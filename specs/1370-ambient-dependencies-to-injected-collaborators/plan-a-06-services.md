# Plan 1370 — Part 06: Services

Migrates the 12 services under `services/` (excluding `services/CLAUDE.md`
and `services/README.md`). Each service has a `server.js` (or
equivalent entry point) treated as a [spec interpretation](design-a.md#components)
of "bin shim" per [design § Components → Entry points](design-a.md#components)
— services are entry points by another name and own the
`createDefaultRuntime()` construction site for their lifecycle.

Each section below is **one PR / one sub-row**. Sections execute in
parallel once plan-a-01 and per-section blocking parts have merged.

Blocking dependencies per section noted explicitly. All sections block
on plan-a-01.

Sub-rows: one per section below.

## Recipe deviation: service entry points

Services don't ship golden-capture-able CLI surfaces — they ship long-
running RPC / HTTP / webhook listeners. The recipe applies with these
substitutions:

| Recipe step | Service substitution |
|---|---|
| Step 2 (golden capture) | Snapshot the service's RPC contract via `bun test services/<name>/test/contract.test.js` (creating the file if not present — per-service Step 2 substep). Contract tests assert request/response shapes against a stubbed dependency layer. No bytes-comparison golden. |
| Step 7 (golden replay) | Re-run the contract test after refactor; pass/fail is the verdict. |
| `runtime.proc.exit` allow-list | Services call `runtime.proc.exit(code)` from the entry point on SIGTERM / fatal startup error; the migration preserves this. |

## Service file layout

Eight of twelve services do **not** ship a `src/` directory — they put
`index.js` and `server.js` at the service root. Four services
(`ghbridge`, `msbridge`, plus any that grew a `src/` since 2026-05-30)
have a `src/` subtree. Per-section "Files (src)" lists below reflect
the actual layout; sections for services without `src/` list
`services/<name>/index.js`, `services/<name>/server.js`, and any other
top-level `.js` file.

## bridge

Sub-row: `1370/services-bridge\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/bridge/index.js`, `services/bridge/server.js` (no `src/` subtree). Generic bridge core consumed by msbridge / ghbridge.

- `node:fs` for static configuration; `process.env` for service config. Standard `{ runtime }` injection.

## embedding

Sub-row: `1370/services-embedding\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/embedding/index.js`, `services/embedding/server.js` (no `src/` subtree). gRPC service for embedding vectors.

- `@grpc/grpc-js` boundary stays unwrapped. Migration covers `process.env` (e.g. `EMBEDDING_API_KEY`), `node:fs` (model cache), `Date.now()` (request timing).
- Recent fix `0f5372fd`+ family added JSDoc; the migration preserves it.

## ghauth

Sub-row: `1370/services-ghauth\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/ghauth/index.js`, `services/ghauth/server.js` (no `src/` subtree). GitHub App authentication service.

- `process.env.KATA_APP_PRIVATE_KEY` (or similar) reads via `runtime.proc.env`. Token expiry via `runtime.clock.now`.

## ghbridge

Sub-row: `1370/services-ghbridge\tplan\timplemented`.

Blocking: plan-a-01; plan-a-02 (libwiki — wiki-flow consumes WikiSync).

Files (src): `services/ghbridge/index.js`, `services/ghbridge/server.js`, `services/ghbridge/src/discussion-adapter.js`, `services/ghbridge/src/graphql.js`.

- The pre-PR `rg "WikiRepo|wiki-repo"` audit (per plan-a-02 Step 2) currently shows zero ghbridge importers of `WikiRepo`; if the audit at PR time uncovers wiki-flow code that the 2026-05-30 snapshot missed, it's rewired here (or in plan-a-02 if the migration interlock pulls it forward). Service's own ambient-dep migration covers `process.env`, `node:fs`, `Date.now()`, and any `node:child_process` usage in `graphql.js` / `discussion-adapter.js`.
- Bridge hardening already in place (MAX_REPLY_COUNT, bodyLimit, sanitization) is untouched.

## graph

Sub-row: `1370/services-graph\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libgraph).

Files (src): `services/graph/index.js`, `services/graph/server.js` (no `src/` subtree). Graph query gRPC service.

- Backed by libgraph (migrated in plan-a-03). Service-level migration covers config / env / disk-backed cache.

## map (service)

Sub-row: `1370/services-map\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/map/index.js`, `services/map/server.js` (no `src/` subtree). Map metric ingestion service.

- Standard `{ runtime }` injection across server + handlers. `runtime.subprocess` for any shell-out ingest.

## mcp

Sub-row: `1370/services-mcp\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/mcp/index.js`, `services/mcp/server.js` (no `src/` subtree). MCP transport service.

- libmcp boundary already excluded from SDK wrapping; service-level migration covers project-internal ambient-dep usage only.

## msbridge

Sub-row: `1370/services-msbridge\tplan\timplemented`.

Blocking: plan-a-01; plan-a-02 (libwiki).

Files (src): `services/msbridge/index.js`, `services/msbridge/server.js`, `services/msbridge/src/discussion-adapter.js`, `services/msbridge/src/teams.js`.

- The pre-PR `rg "WikiRepo|wiki-repo"` audit currently shows zero msbridge importers of `WikiRepo`; same conditional rewire as ghbridge. Recent fixes — `e9b9e5a6` HMAC refactor, `5624831f` cascade auth cleanup, `d6b43163` hardening, `0df0d073` format auto-fix — are preserved untouched.
- Migration covers `process.env.SERVICE_SECRET` / similar (already removed; verify), `Date.now()` for typing-ticker cadence (`runtime.clock.now`), `setTimeout` for typing ticker (`runtime.clock.setTimeout`).

## oauth

Sub-row: `1370/services-oauth\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/oauth/index.js`, `services/oauth/server.js` (no `src/` subtree). OAuth dance handler.

- `process.env` for OAuth client secrets; `Date.now()` for token expiry; `node:fs` for state persistence (if any).

## pathway (service)

Sub-row: `1370/services-pathway\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/pathway/index.js`, `services/pathway/server.js` (no `src/` subtree as of 2026-05-30; if a `src/` has been added, audit and include). Pathway gRPC service backing the product.

- Loads YAML standards via the same loader pattern as products/pathway. `runtime.fs` for the loader.

## trace

Sub-row: `1370/services-trace\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/trace/index.js`, `services/trace/server.js` (no `src/` subtree). Trace ingestion gRPC service.

- NDJSON file reads via `runtime.fs`; trace timing via `runtime.clock.now`.

## vector

Sub-row: `1370/services-vector\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libvector).

Files (src): `services/vector/index.js`, `services/vector/server.js` (no `src/` subtree). Vector store gRPC service.

- Backed by libvector (migrated in plan-a-03). Service-level migration covers config / env / disk-backed vector index.

## Per-service CI gate (shared)

After every service's PR merges:

- The service's library blockers (per the per-section table above) are at `plan implemented`.
- The service's sub-row is at `plan implemented`.
- Contract tests pass.

## Libraries used

Libraries used: libutil (Runtime), libmock (createTestRuntime + fakes —
especially createMockSubprocess for shell-out tests), libcli where the
service ships an admin CLI, each service's library dependencies (libwiki,
libgraph, libvector per section), libmcp for mcp / others as needed.

## Master row advance

When every `1370/*` sub-row across plan-a-02 through plan-a-06 is at
`plan implemented`, the master `1370\tplan\timplemented` row advances.
This is the only condition that flips the master row.

## Risks

- **Service migration without consumer awareness.** A service whose RPC contract evolves during migration (even if the contract test still passes) may surprise the gateway. Mitigation: contract tests must include canary cases the gateway also runs; release-merge gates service PRs on both the local contract test and the gateway's contract verification (where available).
- **Bridge service async-cascade collides with existing hardening.** msbridge / ghbridge's hardening commits introduced precise error-path semantics. Migration must preserve them exactly. Mitigation: each bridge PR's diff shows hardening lines untouched; release-merge inspects.
- **services that read `process.env` lazily during request handling.** A `runtime.proc.env` Proxy preserves late-binding token rotation ([design § Collaborator Surfaces](design-a.md#collaborator-surfaces)). Tests must specifically exercise the rotation path against `createMockProcess({ env })` mutation between requests.
- **services/mcp and external SDK boundary.** MCP's SDK is out of scope; if a service module re-implements MCP transport semantics inline (rather than calling the SDK), migrating that module surfaces the inline reimplementation. Mitigation: per-service audit lists every `node:net` / `node:http` direct use and the PR rewrites them through the SDK or `runtime` collaborators, not both.

— Staff Engineer 🛠️
