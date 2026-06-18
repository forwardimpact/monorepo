# Plan 1600 — Service URL-default source-of-truth assertion

Execution plan for [design-a.md](design-a.md) ([spec.md](spec.md)).

## Approach

Build the gate infrastructure first (registry + AST expected-URL helper + rule
module + audit script + tests), then declare each service's listen URL in its
`createServiceConfig` manifest, then sweep the divergent consumers
(`init.js` and the MCP docs; the three `.env.*.example` files are already
mutually consistent and become the canonical scheme) so the gate's first run is
green. The canonical URL per service is the value the three env-example files
already agree on (`trace` 3001 … `embedding` 3015); the sweep moves the
out-of-line surfaces to that scheme rather than renumbering 15 services.
libconfig's existing derivation (`config.js` `load()`:
`protocol`→`grpc`, `host`→`0.0.0.0`, `port`→`3000`, `path`→`""`, then
`url = protocol://host:port path`) is the single producer; the helper replays
it on statically-extracted defaults.

Libraries used: libcoaligned (invariants host, `lib/ast.mjs`, `lib/rg.mjs`),
libconfig (derivation reference), acorn (via `lib/ast.mjs`), yaml (registry).

## Parts

| Part | Scope | Depends on |
|---|---|---|
| [plan-a-01.md](plan-a-01.md) | Gate infrastructure: `service-url-drift.registry.yml`, `expected-url.mjs` helper, `service-url-drift.rules.mjs`, `scripts/audit-service-urls.mjs`, and the rule-module unit test. | — |
| [plan-a-02.md](plan-a-02.md) | Manifest declarations: add the listen-URL keys to each in-scope service's `createServiceConfig` defaults, per-service, without disturbing existing config semantics (notably ghserver/oidc backend `port`). | 01 (uses the helper to verify each declared URL) |
| [plan-a-03.md](plan-a-03.md) | Consumer sweep + activation: align `init.js` and the MCP `typed-contracts` docs to the canonical scheme, confirm the three env files match, run the audit to prove zero `restated ≠ expected`, and confirm `bunx coaligned invariants` is green. | 01, 02 |

## Canonical URL scheme (per env-example consensus)

| Service | Canonical URL | Scheme |
|---|---|---|
| trace | `grpc://localhost:3001` | grpc |
| vector | `grpc://localhost:3002` | grpc |
| graph | `grpc://localhost:3003` | grpc |
| map | `grpc://localhost:3004` | grpc |
| pathway | `grpc://localhost:3005` | grpc |
| tenancy | `grpc://localhost:3006` | grpc |
| ghserver | `grpc://localhost:3007` | grpc |
| oidc | `http://localhost:3008` | http |
| ghuser | `grpc://localhost:3009` | grpc |
| oauth | `http://localhost:3010` | http |
| mcp | `http://localhost:3011` | http |
| bridge | `grpc://localhost:3012` | grpc |
| ghbridge | `http://localhost:3013` | http |
| msbridge | `http://localhost:3014` | http |
| embedding | `grpc://localhost:3015` | grpc |

(15 service directories live under `services/` and the three env files carry
exactly 15 `SERVICE_<name>_URL` rows; the spec's "16 as of filing" parenthetical
miscounts its own list, which enumerates the same 15 names this table covers.
`oauth`/`oidc` declare `provider`/`issuer` but still
carry a `SERVICE_*_URL` env row, so they are in-scope. Part 02 reads
`services/<name>/` at execution time and registers any service not in this
table whose manifest produces a `SERVICE_<name>_URL`.)

## Execution recommendation

Sequential, single engineering agent: Part 01 → 02 → 03. The parts are not
independent — 02 and 03 verify against 01's helper, and 03's green run requires
02's declarations. Not suitable for parallel routing. All parts are code; no
`technical-writer` hand-off (the docs sweep in Part 03 is a value alignment, not
prose authoring).

## Risks

- **ghserver/oidc backend port vs. listen URL.** Both already declare a `port`
  (9201/9202) that their bind logic consumes; that is the backend listen port,
  and the env-example `SERVICE_*_URL` (3007/3008) is the *advertised consumer*
  URL. Part 02 must determine, per service, whether the declared `url` is a new
  key distinct from `port` or whether `port` is the listen port — see Part 02
  for the per-service decision rule. Getting this wrong breaks service bind.
- **`path`-bearing or non-localhost env values.** The docker-native/supabase
  embedding row uses `grpc://embedding.local:3015` (different host). The gate
  asserts against the manifest-produced URL, which is `localhost`-based; Part
  03 resolves whether the docker host rows are in-registry consumers or a
  deployment-host exception (treated like `_CALLBACK_BASE_URL`).
- **AST extraction of non-literal defaults.** If any service computes its
  defaults rather than passing an object literal, the helper cannot statically
  extract them; Part 02 flags any such service for a literal-defaults refactor
  or registry exclusion.

— Staff Engineer 🛠️
