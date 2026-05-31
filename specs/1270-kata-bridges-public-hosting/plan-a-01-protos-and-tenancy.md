# Plan 1270 — Part 01: Protos and `services/tenancy`

Foundation part. Adds two `.proto` files (`tenancy.proto`,
`ghserver.proto`) and stands up `services/tenancy` as a gRPC registry
following the existing `services/ghuser` skeleton. No other part
depends on this part beyond the proto files and the running
`services/tenancy` skeleton.

## Step 1 — Open the STATUS sub-row

Append `1270/protos-and-tenancy\tplan\tapproved` to `wiki/STATUS.md` as
the first commit of this PR (master `1270\tplan\tapproved` row is
already on `main` after the plan PR merge). Verification: `rg
"^1270/protos-and-tenancy" wiki/STATUS.md`.

## Step 2 — Author `services/tenancy/proto/tenancy.proto`

Created files: `services/tenancy/proto/tenancy.proto`.

```proto
syntax = "proto3";

package tenancy;

import "common.proto";

service Tenancy {
  rpc ResolveByChannelKey(ChannelTenantKey) returns (Tenant);
  rpc ResolveByRepo(RepoKey) returns (Tenant);
  rpc ResolveByTenantId(TenantIdKey) returns (Tenant);
  rpc UpsertByChannelKey(UpsertChannelKeyRequest) returns (Tenant);
  rpc UpsertByPair(UpsertPairRequest) returns (Tenant);
  rpc SetState(SetStateRequest) returns (Tenant);
  rpc SetRepo(SetRepoRequest) returns (Tenant);
}

message Tenant {
  string tenant_id = 1;
  string channel = 2;
  string channel_tenant_key = 3;
  optional Repo repo = 4;
  string state = 5;
  int64 created_at = 6;
  int64 last_active_at = 7;
}

message Repo { string owner = 1; string name = 2; }
message ChannelTenantKey { string channel = 1; string key = 2; }
message RepoKey { string owner = 1; string name = 2; }
message TenantIdKey { string tenant_id = 1; }

message UpsertChannelKeyRequest {
  string channel = 1;
  string channel_tenant_key = 2;
  string state = 3;
}
message UpsertPairRequest {
  string installation_id = 1;
  string owner = 2;
  string name = 3;
}
message SetStateRequest { string tenant_id = 1; string state = 2; }
message SetRepoRequest { string tenant_id = 1; Repo repo = 2; }
```

`state` is one of `pending_consent`, `active`, `revoked`. The
`channel_tenant_key` shape is documented in
[design § Tenant registry](design-a.md#tenant-registry): GitHub uses
the composite `"{installation_id}:{owner}/{name}"`; MS uses the
Azure tenant id.

Verification: `bunx fit-codegen --all` succeeds; the regenerated
`generated/proto/` carries `tenancy.proto`; the consolidated
`generated/types/types.js` namespace bundle includes a `tenancy`
namespace with `Tenant`, `ChannelTenantKey`, `UpsertPairRequest`; the
generated `generated/services/exports.js` exports a `TenancyClient`
and a `TenancyBase`. (Codegen emits one consolidated types bundle, not
per-service `.d.ts` files — verification reads the bundle, not a
synthetic per-service file.)

## Step 3 — Author `services/ghserver/proto/ghserver.proto`

Created files: `services/ghserver/proto/ghserver.proto`.

```proto
syntax = "proto3";

package ghserver;

import "common.proto";

service Ghserver {
  rpc MintInstallationToken(MintRequest) returns (MintResponse);
}

message MintRequest {
  string owner = 1;
  string name = 2;
  string requested_by = 3;
}

message MintResponse {
  string installation_token = 1;
  int64 expires_at = 2;
}
```

`requested_by` is a free-form label the caller passes for audit
(`"oidc"`, `"ghbridge"`, `"msbridge"`); it does not authenticate the
caller (peer auth substrate is deferred — see plan-a.md § gRPC peer
authentication). The single-RPC surface mirrors
[design § Workflow identity](design-a.md#workflow-identity).

Verification: `bunx fit-codegen --all` succeeds;
`generated/proto/ghserver.proto` exists; the `generated/types/types.js`
bundle's `ghserver` namespace defines `MintRequest`, `MintResponse`;
`generated/services/exports.js` exports `GhserverClient` and
`GhserverBase`.

## Step 4 — Add required `tenant_id` field to `services/bridge/proto/bridge.proto`

Modified files: `services/bridge/proto/bridge.proto`.

Add a required `string tenant_id` to every message that scopes a record
to or returns a record across tenants. Per
[design § Storage isolation](design-a.md#storage-isolation): records
and cross-record reads are tenant-scoped in every mode. The field is
added at the next available field number in each message; all existing
field numbers are preserved.

| Message | Field added |
|---|---|
| `Discussion` | `string tenant_id = 13;` |
| `Origin` | `string tenant_id = 4;` |
| `LoadDiscussionRequest` | `string tenant_id = 3;` |
| `LoadByCorrelationRequest` | `string tenant_id = 2;` |
| `OriginKey` | `string tenant_id = 2;` |
| `PutPendingDispatchRequest` | `string tenant_id` (next) |
| `ResolvePendingDispatchRequest` | `string tenant_id` (next) |
| `EnqueueInboxRequest` | `string tenant_id` (next) |
| `DrainInboxRequest` | `string tenant_id` (next) |
| `SweepRequest` | `string tenant_id` (next) |
| `OpenRecessRef` | `string tenant_id` (next) |
| `ListOpenRecesses` calls (signature unchanged — uses tenant via gRPC metadata header `x-tenant-id` for the `common.Empty` request) | n/a (see Step 4a) |

The field is required. Single-tenant callers set it to the literal
`"default"`; multi-tenant callers set the resolved tenant. The
`services/bridge` handler rejects empty `tenant_id` on every RPC
that carries the field (see part 05 Step 8).

### Step 4a — gRPC metadata for parameterless RPCs

`ListOpenRecesses` is declared as `common.Empty → OpenRecessList`. To
scope by tenant without breaking the request shape, the bridge sets a
gRPC metadata header `x-tenant-id` on every call (`"default"` in
single-tenant, the resolved tenant in multi-tenant); `services/bridge`
reads the header in the handler and rejects missing or empty values.
`librpc`'s server helper already exposes per-call metadata; the
implementer wires the read in part 05 Step 8.

Verification: `bunx fit-codegen --all` succeeds; `bun run test` in
`services/bridge` passes — existing tests are updated to thread
`tenant_id: "default"` on every request as part of this step
(grep for the test fixture-builder helpers and add the field once at
each builder, not per call site); a new test
`services/bridge/test/multi-tenant.test.js` (authored in part 05)
covers each cross-tenant RPC's scoping behaviour.

## Step 5 — Scaffold `services/tenancy/`

Created files:
- `services/tenancy/package.json` (mirror `services/ghuser/package.json`
  — `name: "@forwardimpact/svctenancy"`, `bin: { "fit-svctenancy":
  "./server.js" }`, dependencies on `libconfig`, `librpc`,
  `libstorage`, `libtelemetry`, `libtype`, `libpreflight`).
- `services/tenancy/index.js` (exports `TenancyService` extending
  `TenancyBase` from `@forwardimpact/librpc`).
- `services/tenancy/server.js` (mirror `services/ghuser/server.js`:
  `createServiceConfig("tenancy", { ... })`, `createLogger`,
  `createTracer`, `createStorage`, instantiate stores, wire `Server`).
- `services/tenancy/src/tenant-store.js` (`TenantStore` class:
  `BufferedIndex(storage, "tenants.jsonl", config)`; methods
  `resolveByChannelKey`, `resolveByRepo`, `resolveByTenantId`,
  `upsertByChannelKey`, `upsertByPair`, `setState`, `setRepo`).
- `services/tenancy/src/service.js` (RPC handlers thin over
  `TenantStore`).
- `services/tenancy/CLAUDE.md` (one-paragraph guide to the service's
  job per `services/CLAUDE.md` convention).
- `services/tenancy/README.md` (jobs declaration mirroring
  `services/ghuser/README.md` shape).
- `services/tenancy/test/tenancy.test.js` (per-RPC unit tests using
  `libmock`'s `createTestRuntime` per spec 1370 convention; covers
  `upsertByPair` idempotency, `resolveByRepo` returns only `active`
  tenants, `setState` transition to `revoked`).

Verification: `bun test services/tenancy` passes; `bun run check` is
clean (format, lint, jsdoc, invariants, context).

## Step 6 — Register `services/tenancy` in `services/README.md`

Modified files: `services/README.md`.

Add a row to the catalog table matching the existing service
descriptions for `ghuser` / `oauth`. The catalog row points at
`services/tenancy/README.md`.

Verification: `rg "services/tenancy" services/README.md` returns the
catalog row.

## Step 7 — Register `services/tenancy` for `fit-rc`

Operator step (out of repo): add the service to the operator's local
`config/config.json` `init.services` array per
[services/CLAUDE.md § Running services](../../services/CLAUDE.md#running-services).
`config/config.json` is gitignored — the README note added in Step 5
documents the requirement so a fresh operator wires it up.

Verification: `services/tenancy/README.md` § Running carries the
one-line `init.services` instruction. No monorepo `package.json` edit
is needed — `workspaces` is `["libraries/*", "products/*", "services/*"]`
so the new directory is picked up automatically by `bun install`.

## Step 8 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/protos-and-tenancy\tplan\tapproved` →
`1270/protos-and-tenancy\tplan\timplemented`. Commit the wiki edit.

Verification: `wiki/STATUS.md` shows
`1270/protos-and-tenancy\tplan\timplemented`.

## Risks

- **Proto package names collide with existing services.** `ghserver`
  and `tenancy` are not currently used as proto package names in
  `services/*/proto/`. Step 2 and Step 3 verify uniqueness against
  `rg "^package " services/*/proto/*.proto`.

- **`generated/` is checked in.** Adding new protos updates
  `generated/` outputs; the part PR must include the regenerated
  artifacts. The `fit-codegen` step is part of the
  [`bunx fit-codegen --all` cross-cutting concern](plan-a.md#code-generation).

## Libraries used

`libconfig`, `librpc`, `libstorage`, `libtelemetry`, `libtype`,
`libpreflight`, `libindex` (via `BufferedIndex` in the tenant store).
