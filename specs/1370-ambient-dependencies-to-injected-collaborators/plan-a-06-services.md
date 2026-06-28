# Plan 1370 — Part 06: Services

Migrates the 12 services under `services/` (excluding `services/CLAUDE.md` and
`services/README.md`). Each service has a `server.js` (or equivalent entry
point) treated as a [spec interpretation](design-a.md#components) of "bin shim"
per [design § Components → Entry points](design-a.md#components) — services are
entry points by another name and own the `createDefaultRuntime()` construction
site for their lifecycle.

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
| `runtime.proc.exit` allow-list | Services call `runtime.proc.exit(code)` from the entry point on a fatal startup error; the migration preserves this. HTTP services (oauth, mcp) instead wire `SIGINT`/`SIGTERM` to `service.stop()` in `server.js` for graceful shutdown — `libhttp` owns the socket teardown, so the entry point never calls `runtime.proc.exit` on a signal. |

## Service file layout

Eight of twelve services do **not** ship a `src/` directory — they put
`index.js` and `server.js` at the service root. Four services
(`ghbridge`, `msbridge`, plus any that grew a `src/` since 2026-05-30)
have a `src/` subtree. Per-section "Files (src)" lists below reflect
the actual layout; sections for services without `src/` list
`services/<name>/index.js`, `services/<name>/server.js`, and any other
top-level `.js` file.

## HTTP transport standardization (libhttp)

Since 2026-05-30 the four HTTP services standardize on
`@forwardimpact/libhttp`'s `createHttpService` factory — a non-bin library
added **after** this plan was first drafted: `oauth` mounts its routes
directly, `ghbridge` / `msbridge` go through `libbridge`'s
`createBridgeServer`, and `mcp` reaches the MCP SDK transport through a
raw-Node escape hatch (`c.env.incoming` / `c.env.outgoing` +
`RESPONSE_ALREADY_SENT`). `libhttp/src` is **ambient-clean** — it does only
network I/O (Hono + `@hono/node-server`) and touches no `process` / `node:fs`
/ clock / timer surface, so `check-ambient-deps` passes on it. It therefore
carries **no** 1370 sub-row, and the HTTP services migrate **no** transport
internals: serve/bind, security headers, body limit, `/health`, and graceful
`stop()` already live behind the library. `libhttp` already accepts injected
`logger` and `tracer`; the runtime construction site and `SIGINT`/`SIGTERM` →
`service.stop()` wiring live in each `server.js`. The clock/timer surface for
the bridge HTTP path (`ProgressTicker`, `ElapsedScheduler`) lives in
`libbridge` and migrates in its plan-a-04 sub-row. The per-service bullets
below describe only the **domain** ambient usage that remains after transport
moved into the libraries.

## bridge

Sub-row: `1370/services-bridge\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/bridge/index.js`, `services/bridge/server.js` (no `src/`
subtree). Generic bridge core consumed by msbridge / ghbridge.

- `node:fs` for static configuration; `process.env` for service config. Standard
  `{ runtime }` injection.

## embedding

Sub-row: `1370/services-embedding\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/embedding/index.js`, `services/embedding/server.js` (no
`src/` subtree). gRPC service for embedding vectors.

- `@grpc/grpc-js` boundary stays unwrapped. Migration covers `process.env` (e.g.
  `EMBEDDING_API_KEY`), `node:fs` (model cache), `Date.now()` (request timing).
- Recent fix `0f5372fd`+ family added JSDoc; the migration preserves it.

## ghauth

Sub-row: `1370/services-ghauth\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/ghauth/index.js`, `services/ghauth/server.js` (no `src/`
subtree). GitHub App authentication service.

- `process.env.KATA_APP_PRIVATE_KEY` (or similar) reads via `runtime.proc.env`.
  Token expiry via `runtime.clock.now`.

## ghbridge

Sub-row: `1370/services-ghbridge\tplan\timplemented`.

Blocking: plan-a-01; plan-a-02 (libwiki — wiki-flow consumes WikiSync);
plan-a-04 (libbridge — HTTP transport + ProgressTicker/ElapsedScheduler clock).

Files (src): `services/ghbridge/index.js`, `services/ghbridge/server.js`,
`services/ghbridge/src/discussion-adapter.js`,
`services/ghbridge/src/graphql.js`, `services/ghbridge/src/injection.js`.

- The pre-PR `rg "WikiRepo|wiki-repo"` audit (per plan-a-02 Step 2) currently
  shows zero ghbridge importers of `WikiRepo`; if the audit at PR time uncovers
  wiki-flow code that the 2026-05-30 snapshot missed, it's rewired here (or in
  plan-a-02 if the migration interlock pulls it forward). The service's own
  ambient-dep migration now centers on `Date.now()` for discussion-context
  timestamps (`index.js`, `src/injection.js`) → `runtime.clock.now`, plus any
  `process.env` / `node:fs` / `node:child_process` usage in `graphql.js` /
  `discussion-adapter.js`. HTTP lifecycle, body limit, and security headers
  moved into `libbridge` → `libhttp`, so they are no longer migrated here.
- Bridge hardening already in place (MAX_REPLY_COUNT, sanitization) is
  untouched; `bodyLimit` now lives in `libhttp`.

## graph

Sub-row: `1370/services-graph\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libgraph).

Files (src): `services/graph/index.js`, `services/graph/server.js` (no `src/`
subtree). Graph query gRPC service.

- Backed by libgraph (migrated in plan-a-03). Service-level migration covers
  config / env / disk-backed cache.

## map (service)

Sub-row: `1370/services-map\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/map/index.js`, `services/map/server.js` (no `src/`
subtree). Map metric ingestion service.

- Standard `{ runtime }` injection across server + handlers.
  `runtime.subprocess` for any shell-out ingest.

## mcp

Sub-row: `1370/services-mcp\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/mcp/index.js`, `services/mcp/server.js` (no `src/`
subtree; `test/http.test.js` is the transport contract test from Step 2 — it
exercises `/health`, the 401 path, and a real `initialize` handshake over the
escape hatch). MCP transport service.

- No longer runs its own `node:http` server: `mcp` mounts on `libhttp` and hands
  the raw Node req/res to the MCP SDK's `StreamableHTTPServerTransport` through
  the escape hatch (`c.env.incoming` / `c.env.outgoing`, returning
  `RESPONSE_ALREADY_SENT`), with `libhttp`'s body limit disabled so the SDK
  reads an untouched body. libmcp / the SDK stay excluded from wrapping.
- Remaining ambient surface is the **clock** only: `Date.now()` for per-session
  `lastActivity` stamps and `setInterval` for the idle-session sweep →
  `runtime.clock.now` and `runtime.clock.setInterval`. The former `EADDRINUSE`
  and shutdown-timeout `process.exit` calls were removed in the libhttp
  migration; signal handling now lives in `server.js` (`SIGINT`/`SIGTERM` →
  `service.stop()`), which clears the sweep timer and closes sessions through
  `libhttp`'s `onStop` hook.

## msbridge

Sub-row: `1370/services-msbridge\tplan\timplemented`.

Blocking: plan-a-01; plan-a-02 (libwiki); plan-a-04 (libbridge — HTTP transport

- ProgressTicker/ElapsedScheduler clock).

Files (src): `services/msbridge/index.js`, `services/msbridge/server.js`,
`services/msbridge/src/discussion-adapter.js`, `services/msbridge/src/teams.js`.

- The pre-PR `rg "WikiRepo|wiki-repo"` audit currently shows zero msbridge
  importers of `WikiRepo`; same conditional rewire as ghbridge. Recent fixes —
  `e9b9e5a6` HMAC refactor, `5624831f` cascade auth cleanup, `d6b43163`
  hardening, `0df0d073` format auto-fix — are preserved untouched.
- Migration now centers on `Date.now()` for discussion-context timestamps in
  `index.js` → `runtime.clock.now`. The typing-ticker cadence (`setInterval` in
  `ProgressTicker`) and the `elapsed`-resume `setTimeout` (`ElapsedScheduler`,
  already on an injected `#clock`) live in `libbridge`, not the service — they
  migrate in libbridge's plan-a-04 row. HTTP lifecycle / body limit moved into
  `libbridge` → `libhttp`.

## oauth

Sub-row: `1370/services-oauth\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/oauth/index.js`, `services/oauth/server.js` (no `src/`
subtree). OAuth dance handler.

- Thinnest HTTP service: `index.js` delegates entirely to `libhttp` and the gRPC
  `providerClient`, so it carries **no** ambient deps — no `process.env`,
  `Date.now()`, or `node:fs` (client secrets and host/port arrive through
  `createServiceConfig` in `server.js`; there is no token-expiry or
  state-persistence logic in the adapter). Migration is the standard
  `{ runtime }` construction in `server.js`, which already wires
  `SIGINT`/`SIGTERM` → `service.stop()`.

## pathway (service)

Sub-row: `1370/services-pathway\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/pathway/index.js`, `services/pathway/server.js` (no
`src/` subtree as of 2026-05-30; if a `src/` has been added, audit and include).
Pathway gRPC service backing the product.

- Loads YAML standards via the same loader pattern as products/pathway.
  `runtime.fs` for the loader.

## trace

Sub-row: `1370/services-trace\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `services/trace/index.js`, `services/trace/server.js` (no `src/`
subtree). Trace ingestion gRPC service.

- NDJSON file reads via `runtime.fs`; trace timing via `runtime.clock.now`.

## vector

Sub-row: `1370/services-vector\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libvector).

Files (src): `services/vector/index.js`, `services/vector/server.js` (no `src/`
subtree). Vector store gRPC service.

- Backed by libvector (migrated in plan-a-03). Service-level migration covers
  config / env / disk-backed vector index.

## Per-service CI gate (shared)

After every service's PR merges:

- The service's library blockers (per the per-section table above) are at
  `plan implemented`.
- The service's sub-row is at `plan implemented`.
- Contract tests pass.

## Libraries used

Libraries used: libutil (Runtime), libmock (createTestRuntime + fakes —
especially createMockSubprocess for shell-out tests), libcli where the
service ships an admin CLI, each service's library dependencies (libwiki,
libgraph, libvector per section), libhttp (ambient-clean HTTP transport
composed by oauth / mcp / bridges — no 1370 row of its own), libbridge (HTTP

- scheduling clock for the bridges), libmcp for mcp / others as needed.

## Master row advance

When every `1370/*` sub-row across plan-a-02 through plan-a-06 is at
`plan implemented`, the master `1370\tplan\timplemented` row advances.
This is the only condition that flips the master row.

## Risks

- **Service migration without consumer awareness.** A service whose RPC contract
  evolves during migration (even if the contract test still passes) may surprise
  the gateway. Mitigation: contract tests must include canary cases the gateway
  also runs; release-merge gates service PRs on both the local contract test and
  the gateway's contract verification (where available).
- **Bridge service async-cascade collides with existing hardening.** msbridge /
  ghbridge's hardening commits introduced precise error-path semantics.
  Migration must preserve them exactly. Mitigation: each bridge PR's diff shows
  hardening lines untouched; release-merge inspects.
- **services that read `process.env` lazily during request handling.** A
  `runtime.proc.env` Proxy preserves late-binding token rotation
  ([design § Collaborator Surfaces](design-a.md#collaborator-surfaces)). Tests
  must specifically exercise the rotation path against
  `createMockProcess({ env })` mutation between requests.
- **services/mcp and external SDK boundary.** Resolved by the 2026-05-30 libhttp
  migration: mcp no longer runs its own `node:http` server — it mounts on
  `libhttp` and hands the raw Node req/res to the MCP SDK transport via the
  documented escape hatch (`c.env.incoming` / `c.env.outgoing` +
  `RESPONSE_ALREADY_SENT`). The `node:net` / `node:http` direct-use audit now
  returns clean for mcp, so the remaining migration is purely the clock surface
  (`Date.now()` / `setInterval`); there is no inline transport reimplementation
  left to surface.

— Staff Engineer 🛠️
