# Plan A -- Guide Status Command

## Approach

Two independent layers, bottom-up:

1. **librpc health endpoint** -- add the standard `grpc.health.v1.Health/Check`
   to the `Server` class so every gRPC service gets it for free.
2. **fit-guide status command** -- add `status` (and promote `--init` to `init`)
   using the health endpoint, data inventory queries, and credential checks.

The health service definition is constructed manually as a
`grpc.ServiceDefinition` object inside librpc -- no `.proto` file, no
proto-loader, no codegen involvement. This matches how the existing generated
definitions work (plain JS objects with `path`, serialize/deserialize, and stream
flags) and avoids adding file-system dependencies or proto-loader to the runtime
path. The `HealthCheckRequest` and `HealthCheckResponse` messages are trivial
(one string field, one enum field) so hand-coding the serialization with raw
protobuf wire format is straightforward.

The health service is registered directly on the `grpc.Server` instance with
**unwrapped** handlers -- bypassing `#wrapHandlers` entirely -- so HMAC auth
never touches it. This is the cleanest auth bypass: no conditional logic in
`#wrapUnary`, no allow-lists, just a second `addService` call.

For the status command's health client, we build a lightweight gRPC client
directly via `grpc.makeGenericClientConstructor` using the same health service
definition. This client has **zero retries** and a **2-second deadline** so
unreachable services fail fast instead of hanging for 10+ seconds.

The plan is split into two independently executable parts.

## Part Index

| Part | File | Summary | Depends on |
|------|------|---------|------------|
| 01 | [plan-a-01.md](plan-a-01.md) | librpc health endpoint + tests | -- |
| 02 | [plan-a-02.md](plan-a-02.md) | fit-guide status/init commands + tests | Part 01 |

## Cross-cutting Concerns

- **No new dependencies.** `@grpc/grpc-js` is already in librpc. The health
  service definition is pure JS.
- **No codegen changes.** The health definition lives in librpc source code, not
  in `generated/`.
- **No per-service changes.** Individual service `server.js` files are
  untouched.
- **Test pattern.** All tests use OO+DI: inject mocks from libharness, no
  factories.

## Risks

1. **Manual protobuf encoding.** The health request/response messages use raw
   protobuf wire encoding (field 1, varint for enum, length-delimited for
   string). This is well-documented and the messages are trivial, but a typo in
   wire format would cause silent failures. Mitigation: integration test with
   real `@grpc/grpc-js` encoding round-trips in the unit tests.

2. **`addService` called twice.** The grpc-js `Server` supports multiple
   `addService` calls for different service paths. This is standard practice
   (the health check proto was designed for exactly this). No risk here, but
   worth noting since it is new to the codebase.

3. **Config loading in status command.** `createServiceConfig` loads `.env` and
   `config.json`. The status command gates on `config/config.json` existence
   before attempting any config loads (same check as `setupServices`). Per-service
   config failures are caught individually — a missing entry for one service
   marks it `"unreachable"` without preventing checks on the others.

## Execution

**Sequential.** Part 02 depends on Part 01 (the health definition export).

Route both parts to `staff-engineer`. No documentation changes required for this
spec (status command will appear in `--help` output automatically via the libcli
definition).
