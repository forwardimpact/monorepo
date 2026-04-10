# Guide Status Command

**Depends on:** [360 — CLI Library](../360-cli-library/spec.md) (libcli must
exist before this spec is implemented).

## Problem

After setting up Guide, users have no way to verify the system is ready before
asking their first question. Guide requires a stack of 8+ microservices (agent,
llm, memory, graph, vector, tool, trace, web), processed framework data loaded
into indexes and the graph store, and valid LLM credentials. Any missing piece
causes a cryptic gRPC or connection error that tells the user nothing about what
is actually wrong.

The getting-started documentation (issues #266, #268) can show expected output,
but users still cannot diagnose _why_ things are not working. Today the only
feedback path is: start a conversation, hit an error, guess which layer failed,
and repeat. This is especially painful for first-time users who have never seen
the system in a healthy state.

Beyond diagnostics, there is no standard way to probe whether a service is alive.
Each service exposes only its application RPCs. A status check must guess which
RPC to call, construct valid protobuf request objects for each service's unique
API, and interpret application-level errors as reachability signals. This is
fragile and couples the health check logic to every service's domain API.

## Why this matters

Guide answers "How do I find my bearing?" --- a question that requires
confidence in the system before asking it. The 8-service dependency chain means
there are at least 8 distinct failure points, each with its own symptom. A
single missing service, an empty graph store, or an unset `LLM_TOKEN` variable
each produce different errors that are difficult to trace back to root cause
without inside knowledge.

Issues #194, #195, #252, #253, #254, #266, #267, and #268 all stem from
first-time user friction. A status command would collapse the "is it working?"
question into a single invocation, surfacing every configuration gap at once
rather than forcing users through a trial-and-error loop.

The gRPC ecosystem has a standard answer to the service health problem:
[`grpc.health.v1.Health`](https://grpc.io/docs/guides/health-checking/). Every
major gRPC framework, load balancer, and orchestration tool understands this
protocol. Implementing it once in the shared `librpc` Server class gives every
service a health endpoint for free --- no per-service code, no codegen changes,
and standard tooling (`grpcurl`, Kubernetes probes, load balancers) works
immediately.

## Goal

Two changes, one motivation:

1. **Infrastructure.** Add the standard `grpc.health.v1.Health/Check` endpoint
   to `librpc`'s `Server` class so that every gRPC service automatically reports
   its serving status. No per-service code or codegen template changes required.

2. **Product.** Add a `status` command to `fit-guide` that uses `Health/Check`
   to probe each service, queries data inventory, validates LLM credentials, and
   reports a clear ready/not-ready verdict.

## Scope

In scope:

- **`grpc.health.v1` in librpc.** Add the standard health proto definition
  directly in librpc (not through codegen --- this is infrastructure, not an
  application service). The `Server` class auto-registers the `Health` service
  alongside the application service on `start()`. The `Check` RPC responds with
  `SERVING` once the server is listening. No per-service opt-in, no codegen
  template changes, no changes to individual service implementations.
- **A `status` command** declared in the libcli definition for
  `products/guide/bin/fit-guide.js`. Handled before the Repl starts --- when the
  first positional argument is `status`, run the status checks, print the
  report, and exit without entering the interactive session (same early-exit
  pattern as `--version` and the `init` command).
- **Promote the existing `--init` flag** to an `init` command for consistency ---
  `init` and `status` are both actions, not modifiers on the REPL session. This
  aligns fit-guide with other products (`fit-map init`, `fit-map validate`) that
  use commands for distinct operations.
- **Health checks** against each required gRPC service (agent, llm, memory,
  graph, vector, tool, trace) via `Health/Check`, and the web service via its
  existing HTTP `/web/health` endpoint. Each check reports pass/fail with the
  service URL.
- **Data inventory queries:** resource counts from the graph store, triple
  counts from the graph store, and agent definition presence from config.
- **LLM credential validation:** confirm `LLM_TOKEN` is set and non-empty (do
  not make an LLM call --- just verify the credential is configured).
- **Structured summary output** using libcli's `SummaryRenderer` with a clear
  "ready" or "not ready" verdict line.
- **Machine-readable output** via `status --json`, producing a JSON object with
  the same sections (services, data, credentials, verdict).
- **Exit code:** 0 if all checks pass (ready), 1 if any check fails (not
  ready). Follows libcli's exit code convention.

Out of scope:

- `Health/Watch` (streaming) --- not needed for a one-shot status command and
  adds complexity. Can be added later if live health monitoring is needed.
- `Health/List` --- newer addition to the protocol, not widely supported. Each
  server hosts one application service, so `Check` with an empty service name
  (overall server health) is sufficient.
- Auto-repair of missing services, data, or credentials.
- GUI or web-based status display.
- Service restart or process management (that is `fit-rc`'s job).
- Health checks for optional services (supabase, tei).
- Changes to the codegen pipeline or generated service templates.

## Behavioural requirements

### Infrastructure: gRPC health endpoint

1. **Health proto definition.** Define the `grpc.health.v1` service directly in
   librpc using `@grpc/proto-loader` or manual service definition construction.
   The definition must match the
   [standard proto](https://github.com/grpc/grpc-proto/blob/master/grpc/health/v1/health.proto):

   ```protobuf
   service Health {
     rpc Check(HealthCheckRequest) returns (HealthCheckResponse);
   }

   message HealthCheckRequest {
     string service = 1;
   }

   message HealthCheckResponse {
     enum ServingStatus {
       UNKNOWN = 0;
       SERVING = 1;
       NOT_SERVING = 2;
       SERVICE_UNKNOWN = 3;
     }
     ServingStatus status = 1;
   }
   ```

   Only `Check` is required. `Watch` and `List` are out of scope.

2. **Auto-registration in Server.** The `Server.start()` method registers the
   `Health` service on the same gRPC server instance, alongside the application
   service. No constructor signature changes --- the health service is always
   present, unconditionally.

3. **Check semantics.** When `Check` is called:
   - With an empty service name (`""`): respond `SERVING` if the server is
     listening (the fact that the RPC completed means the server is up).
   - With the application service name (e.g., `"Graph"`): respond `SERVING`.
   - With an unknown service name: respond `SERVICE_UNKNOWN`.

   The health endpoint does NOT assess application-level readiness (e.g.,
   whether the graph index is populated). It answers one question: "is this
   gRPC process accepting connections?" Application-level readiness (data
   loaded, dependencies available) is a higher-level concern handled by the
   status command's data inventory checks.

4. **Authentication.** The `Health/Check` RPC bypasses the HMAC authentication
   interceptor. Health checks must work without credentials --- this is standard
   practice and required for load balancers and orchestration tools.

5. **No per-service code.** Individual services (agent, graph, llm, etc.) do not
   implement or configure the health endpoint. It is fully owned by
   `librpc/server.js`.

### Product: fit-guide status command

6. **Service health checks.** For each of the 7 required gRPC services (agent,
   llm, memory, graph, vector, tool, trace), call `Health/Check` with an empty
   service name. For the web service, call `GET /web/health`. Report each
   service as "ok" or "unreachable" with the configured URL. Timeout per service
   should be short (2--3 seconds) so the full check completes quickly even when
   services are down. Run all checks in parallel via `Promise.allSettled`.

7. **Data inventory.** Query the running services for framework data presence:
   - Resource count from the graph service (`GetSubjects` with empty query ---
     count returned lines).
   - Graph triple count from the graph service (`QueryByPattern` with empty
     pattern --- count returned identifiers).
   - Agent definition count from the `config/agents/` directory (count
     `*.agent.md` files).

   Report counts so the user can see whether data has been loaded. Zero counts
   should be flagged as a warning (the system may technically run but will
   produce empty or unhelpful responses).

8. **LLM credential validation.** Check that `LLM_TOKEN` is available via the
   existing `libconfig` credential resolution (environment variable or `.env`
   file). Report present/missing. Do not attempt an actual LLM API call.

9. **Structured summary output.** Use libcli's `SummaryRenderer` to print each
   section (Services, Data, Credentials) as a summary group with aligned labels.
   End with a single verdict line: `Status: ready` or `Status: not ready`.

   When `--json` is also passed, output a JSON object instead:

   ```json
   {
     "services": {
       "agent":  { "url": "grpc://localhost:3002", "status": "ok" },
       "llm":    { "url": "grpc://localhost:3004", "status": "ok" },
       "memory": { "url": "grpc://localhost:3003", "status": "ok" },
       "graph":  { "url": "grpc://localhost:3006", "status": "ok" },
       "vector": { "url": "grpc://localhost:3005", "status": "ok" },
       "tool":   { "url": "grpc://localhost:3007", "status": "ok" },
       "trace":  { "url": "grpc://localhost:3008", "status": "ok" },
       "web":    { "url": "http://localhost:3001",  "status": "ok" }
     },
     "data": {
       "resources": 42,
       "triples": 318,
       "agents": 3
     },
     "credentials": {
       "LLM_TOKEN": "configured"
     },
     "verdict": "ready"
   }
   ```

10. **Exit code semantics.** Exit 0 when all services are reachable and LLM
    credentials are configured (the "ready" state). Exit 1 when any required
    service is unreachable or credentials are missing (the "not ready" state).
    This follows libcli's exit code convention (1 for runtime errors). Data
    warnings (zero counts) do not cause a non-zero exit on their own, since the
    system can technically operate without data --- it just will not be useful.

11. **Error handling.** Use `cli.error()` from libcli for error output and
    `logger.exception()` for caught exceptions, following the standard libcli
    error conventions.

## Success criteria

- `grpcurl -plaintext localhost:3002 grpc.health.v1.Health/Check` returns
  `{ "status": "SERVING" }` for any running gRPC service, without credentials.
- The health endpoint is present on all 7 gRPC services without any per-service
  code changes.
- `npx fit-guide status` on a correctly configured and running system prints the
  structured summary with all services showing "ok", non-zero data counts,
  credentials configured, and `Status: ready`. Exits 0.
- `npx fit-guide status --json` outputs the JSON representation. Exits 0.
- `npx fit-guide status` on a system with missing services or credentials prints
  the structured summary with specific failures and `Status: not ready`. Exits 1.
- `npx fit-guide init` works identically to the current `npx fit-guide --init`.
- `bun run check` passes with the new code.
- Tests cover: health endpoint responding to Check, health endpoint bypassing
  auth, status command "ready" and "not ready" paths. Tests follow the existing
  OO+DI pattern: bypass factories, inject mocks directly.
- The `status` and `init` commands appear in `--help` output automatically via
  the libcli definition.
- No new external dependencies are introduced. The health proto definition is
  constructed directly using `@grpc/grpc-js` and `@grpc/proto-loader` (both
  already dependencies of librpc).

## Integration with libcli (spec 360)

After spec 360 is implemented, fit-guide will use libcli for initial argument
parsing before entering the Repl session. The `status` and `init` commands are
declared in the libcli definition's `commands` array alongside the existing
flags (`--version`, `--data`, `--streaming`, `--help`, `--json`). When
`cli.parse()` returns positionals with `status` or `init` as the first
argument, the entry point dispatches to the corresponding handler and exits
without starting the Repl. This follows the same command dispatch pattern used
by `fit-map` and `fit-pathway`.

The help output separates commands from options, making the distinction clear:

```
fit-guide 1.0.0 — Conversational agent for the Guide knowledge platform

Usage: fit-guide [command] [options]

Commands:
  status              Check system readiness
  init                Generate secrets, .env, and config

Options:
  --data=<path>       Path to framework data directory
  --streaming         Use streaming agent endpoint
  --json              Output as JSON
  --help, -h          Show this help
  --version           Show version

Examples:
  npx fit-guide status
  npx fit-guide status --json
  npx fit-guide init
  echo "Tell me about the company" | npx fit-guide
```

## Open questions

- **Health proto loading.** Should the health service definition be loaded from
  a `.proto` file via `@grpc/proto-loader`, or constructed manually using
  `grpc.makeGenericClientConstructor` / `grpc.ServiceDefinition`? The plan
  should choose based on what is simplest and most maintainable given the
  existing librpc patterns.
- **Data count sources.** Which specific RPCs or queries yield resource counts
  and graph triple counts? The plan should identify the exact service methods to
  call.
