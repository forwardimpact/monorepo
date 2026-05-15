# Design 960-b — Supabase Capability Library, Config Delegates

## Rationale (vs design-a)

Design-a treats Supabase as **credentials accessed through `Config`** — every
consumer reads URL/key, then calls `createClient(...)` locally. Design-b treats
Supabase as a **capability owned by a new `libraries/libsupabase/`** — `Config`
exposes the same four accessors the spec requires but delegates the resolution
to `libsupabase`, and consumers prefer the higher-level `createAnonClient()` /
`createServiceClient()` factories that never expose credentials.

Net deltas:

- New library `libraries/libsupabase/` owns env resolution, the three Supabase
  JWT mints (anon, service-role, per-caller authenticated), HS256 verify, and
  `@supabase/supabase-js` client construction.
- `libstorage` gets **no** static-inspection exemption — it imports
  `libsupabase` (a leaf relative to `libstorage`), so the dead-end
  `libstorage` ← `libsupabase` edge does not create a new cycle. The
  pre-existing `libconfig/src → libstorage` import and `libstorage/bin →
  libconfig` import are unchanged; design-b neither creates nor breaks them.
- All three Supabase JWT mints (anon, service-role, per-caller `authenticated`
  used by `auth-issue.js`) move to `libsupabase`, co-located with verify so
  payload shape, algorithm, and secret stay consistent. `libsecret` retains
  generic `generateJWT` and the `.env` helpers.
- Consumers replace ad-hoc `createClient(url, key, opts)` calls with
  `createAnonClient(...)` / `createServiceClient(...)`, removing the
  `{ auth: { persistSession: false } }` boilerplate scattered across five
  modules. `Config`'s four accessors remain the spec § Persona observable —
  the factories are an additional affordance, not a replacement.

## Components

| Component | Where | Role |
| --- | --- | --- |
| `libsupabase` package | `libraries/libsupabase/` (new) | Owns the four canonical names, HS256 mint/verify primitives, and `@supabase/supabase-js` client factories. Carries `package.json` (`description`, `keywords ending agent`, `jobs` per `libraries/CLAUDE.md`) and `README.md`; ships no CLI in v1. Runtime deps: `@supabase/supabase-js`. Monorepo deps: `@forwardimpact/libsecret` (for `generateJWT`). |
| `readSupabaseEnv` | `libraries/libsupabase/src/env.js` (new) | Pure function: `({process, envOverrides}) → {url, anonKey, serviceRoleKey, jwtSecret}`. Throws `"<KEY> not found in environment"` matching the existing `#resolve` throw shape. Used by `Config` accessors and by the bootstrap script. |
| `createAnonClient` / `createServiceClient` | `libraries/libsupabase/src/client.js` (new) | Single signature each: `createAnonClient({config, jwt, schema, flowType})` and `createServiceClient({config, schema})`. `config` is a `Config` instance (required); `jwt` is an optional pre-issued access token (sets `global.headers.Authorization = "Bearer <jwt>"`); `schema` is the PostgREST schema; `flowType` is the optional Supabase Auth flow (e.g. `"pkce"` for login). Both call `createClient(config.supabaseUrl(), key, { auth: { persistSession: false, flowType }, db: { schema }, global: { headers } })`. No record-vs-Config polymorphism. |
| `mintSupabaseAnonKey` / `mintSupabaseServiceRoleKey` / `mintSupabaseJwt` | `libraries/libsupabase/src/jwt.js` (new) | The first two: `(jwtSecret) → string`, 10-year `{iss: "supabase", role, iat, exp}` payload — replace the inline anon/service-role payloads at `scripts/env-storage.js:37-79`. `mintSupabaseJwt({email, secret, ttlSeconds})` is the per-caller `role: "authenticated"` mint relocated from `libsecret/src/index.js:167` — same signature; no change to its callers' contract beyond the import path. All three wrap `libsecret.generateJWT` so the HS256 algorithm pin is single-sourced. |
| `verifySupabaseJwt` | `libraries/libsupabase/src/jwt.js` (new) | `(token, jwtSecret) → claims | null`. Uses `node:crypto.createHmac("sha256", secret)` + `timingSafeEqual` over the `header.payload` segment — same primitives as today's `products/landmark/src/lib/identity.js:71-84`. Returns the decoded payload on success, `null` on signature mismatch or shape error. No `jose` dependency. The current inline implementation in `identity.js` is replaced by a call to this helper. |
| `Config` Supabase accessors | `libraries/libconfig/src/config.js` (edit) | Adds four method-shaped accessors that internally delegate to `readSupabaseEnv` with the same `process` reference Config already holds. Throw shape and naming match `mcpToken()`. Credential-set membership: three secrets join `#CREDENTIAL_KEYS`; URL does not (compose interpolation). |
| Unified bootstrap script | `scripts/env-setup.js` (new; replaces `scripts/env-secrets.js` + `scripts/env-storage.js`) | Single CLI: generates `SERVICE_SECRET`, `DATABASE_PASSWORD`, `MCP_TOKEN`, `SUPABASE_JWT_SECRET` via `libsecret.getOrGenerateSecret`; derives `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` via `libsupabase.mintSupabase*`; generates `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for storage. All values land in a single `.env`. Retains the `--output <path>` / `--add-mask` flags `env-secrets.js` exposes for CI. |
| `just env-setup` recipe | `justfile` (edit) | One recipe replacing `env-secrets` + `env-storage`. The recipe name is unchanged. |
| `config.toml` `[auth] jwt_secret` | `products/map/supabase/config.toml` (edit) | Adds `jwt_secret = "env(SUPABASE_JWT_SECRET)"` to the existing `[auth]` block. Supabase CLI substitutes at `supabase start` time. Rationale + rejected alternatives in Decision 3. |
| `fit-map activity start` | `products/map/src/commands/activity.js` (edit) | Stops printing the `export MAP_SUPABASE_*` block; emits a one-line ready confirmation. The local Supabase stack reads `SUPABASE_JWT_SECRET` via `config.toml`'s `env()` interpolation; no command-side wiring needed. |
| Docker Compose env passthrough | `docker-compose.yml` (edit) | The four Supabase services (`storage-supabase`, `supabase-db`, `supabase-kong`, `supabase-map-storage`) drop the `env_file: .env.storage.supabase` line, take values from `.env` directly, and rename every `${MAP_SUPABASE_*}` / `${JWT_SECRET}` to the canonical names. The standalone `.env.storage.*` files are deleted with `env-storage.js`. |
| `.env.*.example` files | `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example` (edit) | Each lists the same four-variable Supabase block; only `SUPABASE_URL` differs across files. `MAP_SUPABASE_DB_PORT` is removed. |
| Consumer call sites | 10 files across `services/`, `libraries/`, `products/` (edit) | Each replaces `process.env.MAP_SUPABASE_*` reads + `createClient(...)` with either `libsupabase.createAnonClient(config)` / `createServiceClient(config)` (when constructing a client) or `config.supabase*()` accessors (when reading raw values). Per-module seams in § Per-module migration. |
| Live-Postgres test setup | Same 9 files design-a lists | Mechanical rename of `process.env.MAP_SUPABASE_*` → `process.env.SUPABASE_*` in skip-gates and live-client construction. Test files are exempt from the static-inspection rule. |
| Static-inspection tests | `products/map/test/activity/service-role-still-used.test.js`, `products/landmark/test/lib/no-service-role-in-src.test.js` (edit) + `libraries/libsupabase/test/repo-wide-invariants.test.js` (new) | First two assert the new canonical name. The new libsupabase test walks every `src/`/`bin/` under `products/`, `services/`, and `libraries/` from the monorepo root (resolved via `Finder.findUpward` to avoid hard-coded relative paths) and fails on two patterns: (a) `process.env.SUPABASE_` / `process.env.MAP_SUPABASE_` literals outside `libsupabase/src/env.js` and the Deno edge function; (b) any `@supabase/supabase-js` import — static `import` declaration **or** dynamic `await import(...)` (covering `identity.js:154-155`'s current dynamic-import refresh path) — outside `libsupabase/src/client.js` and the Deno edge function. |
| Documentation | 7 pages listed in spec § Documentation table (edit) | Mechanical rename of `MAP_SUPABASE_*` and `JWT_SECRET` to canonical names; recipe-name updates. |

## Component graph

```mermaid
graph TD
  EX[.env.*.example] --> SETUP[scripts/env-setup.js]
  SETUP -->|writes| ENV[.env]
  SETUP --> LIBSB[libsupabase: mintSupabase*]
  LIBSB --> LIBSEC[libsecret: generateJWT]
  ENV --> CFGTOML[products/map/supabase/config.toml]
  CFGTOML -->|env(SUPABASE_JWT_SECRET)| SBCLI[supabase CLI]
  ENV --> CONFIG[libconfig.Config]
  CONFIG -->|readSupabaseEnv| LIBSB
  CONFIG --> MAPSVC[services/map/server.js]
  CONFIG --> MAPCLI[products/map/src/lib/client.js]
  CONFIG --> MAPAUTH[products/map/src/commands/auth-issue.js]
  CONFIG --> LM_SB[landmark/src/lib/supabase.js]
  CONFIG --> LM_ID[landmark/src/lib/identity.js]
  CONFIG --> LM_LOG[landmark/src/commands/login.js]
  CONFIG --> SUMMIT[summit/src/lib/supabase.js]
  CONFIG --> TERRAIN[libterrain/src/cli-helpers.js]
  LIBSB --> LIBSTOR[libstorage/src/index.js]
  LM_SB --> LIBSB
  LM_LOG --> LIBSB
  MAPCLI --> LIBSB
  MAPSVC --> LIBSB
  SUMMIT --> LIBSB
  TERRAIN --> LIBSB
  LM_ID -->|verifySupabaseJwt| LIBSB
```

`libsupabase` has one monorepo dep (`libsecret`); neither `libstorage` nor
`libconfig` is in its dep set, so `libstorage → libsupabase` and
`libconfig → libsupabase` are dead-end edges with no return path. The
pre-existing `libconfig/src/config.js:4` import of `libstorage` (real) and
`libstorage/bin/fit-storage.js` import of `libconfig` (bin-only) are
unchanged by this design. design-b's claim is narrow: it does not
*introduce* a new cycle, which is why `libstorage` can route Supabase reads
through `libsupabase` without the static-inspection exemption design-a uses.

## `Config` accessor interface

```js
import { readSupabaseEnv } from "@forwardimpact/libsupabase";

class Config {
  static #CREDENTIAL_KEYS = new Set([
    "ANTHROPIC_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "MCP_TOKEN",
    "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET",
  ]);
  supabaseUrl()            { return this.#cachedSupabase().url; }
  supabaseAnonKey()        { return this.#cachedSupabase().anonKey; }
  supabaseServiceRoleKey() { return this.#cachedSupabase().serviceRoleKey; }
  supabaseJwtSecret()      { return this.#cachedSupabase().jwtSecret; }

  #cachedSupabase() {
    if (!this.#cache.has("__supabase")) {
      this.#cache.set("__supabase", readSupabaseEnv({
        process: this.#process,
        envOverrides: this.#envOverrides,
      }));
    }
    return this.#cache.get("__supabase");
  }
}
```

`readSupabaseEnv` throws the same `"<KEY> not found in environment"` shape on
first access of a missing field. The cache is on `Config` (not libsupabase),
matching the existing `#resolve` cache discipline.

## Per-module migration

| Module | Migration |
| --- | --- |
| `services/map/server.js:13-20` | Replace the `||` chain with `createServiceClient({config})`. The dead property branch and `process.env` fallback delete. |
| `services/map/index.js` | No change. `MapService` already takes a pre-built `supabase` client. |
| `libraries/libterrain/src/cli-helpers.js:50-72` | `resolveSupabaseClient(config)` returns `createServiceClient({config})`. Callers construct `Config` via `createScriptConfig("terrain")`. |
| `libraries/libstorage/src/index.js:198-229` | Import `readSupabaseEnv` from libsupabase. `_createSupabaseStorage(prefix, process)` calls `readSupabaseEnv({process}).serviceRoleKey`. No `process.env.SUPABASE_SERVICE_ROLE_KEY` read; no static-inspection exemption. |
| `products/map/src/lib/client.js:12-32` | `createMapClient(opts)` defaults `config = createProductConfig("map")` and calls `createServiceClient({config})`. |
| `products/map/src/commands/auth-issue.js:53-60` | Reads `config.supabaseJwtSecret()` (passed via existing handler `params`); calls `libsupabase.mintSupabaseJwt({email, secret, ttlSeconds})` — same signature as today's `libsecret` export, only the import path changes. |
| `products/map/src/commands/activity.js:20` | `createSupabaseCli()` constructed inside `start()`. The `formatSubheader("Export these variables…")` block is deleted in full. |
| `products/landmark/src/lib/supabase.js:30-48` | `createLandmarkClient({config, jwt, schema})` calls `createAnonClient({config, jwt, schema})`. The persist-session-false invariant moves into libsupabase. |
| `products/landmark/src/lib/identity.js:71-104,139,154-155` | Public API becomes `resolveIdentity({config, env})`. `env` is retained only for `LANDMARK_AUTH_TOKEN`. HMAC verify path calls `verifySupabaseJwt(jwt, config.supabaseJwtSecret())` inside a `try` — Decision 8. `refreshSession`'s dynamic `await import("@supabase/supabase-js")` is replaced by `createAnonClient({config})`, retiring the only dynamic Supabase import. |
| `products/landmark/src/commands/login.js:116-134` | `resolveAnonClient({config, flowType})` calls `createAnonClient({config})` — the `flowType` PKCE option threads through as an additional named argument to `createAnonClient`'s `auth` block. Error wording points at `just env-setup`. |
| `products/summit/src/lib/supabase.js:27-51` | `createSummitClient({config, schema})` calls `createServiceClient({config, schema})`. |
| `products/landmark/test/lib/sign-test-token.js:14-20` | Renames `process.env.MAP_SUPABASE_JWT_SECRET` → `process.env.SUPABASE_JWT_SECRET`. Test helper stays env-direct (test files are out of the static-inspection scope). |

## Key Decisions

| # | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| 1 | Unprefixed canonical names. | Keep `MAP_` prefix; introduce parallel `LANDMARK_SUPABASE_*` / `SUMMIT_SUPABASE_*`. | One Supabase instance exists; prefix is dead structure (spec § Problem). |
| 2 | New `libsupabase` capability library owning env reads, JWT mint + verify, and client construction; `Config` accessors delegate to `readSupabaseEnv`. | (a) Add four accessors directly to `Config` and let consumers call `createClient(...)` per-module (**design-a**). (b) Make `libsupabase` the sole entry and remove `Config` accessors. | (a) leaves five duplicate `createClient(url, key, {auth:{persistSession:false}})` call sites and forces `libstorage` into a static-inspection exemption. (b) violates spec § Persona ("imports `Config` and reads four named accessors"). Design-b honors the Config-accessor contract — the four methods on `Config` *are* the persona observable — and additionally exposes higher-level factories for the client-construction sites. The next consumer wiring a new product *can* call the four accessors directly; the factories are an ergonomic shortcut, not a replacement. |
| 3 | Override Supabase CLI demo secret via `jwt_secret = "env(SUPABASE_JWT_SECRET)"` in `config.toml`. | `supabase start --jwt-secret <ours>`; docker-compose `map-supabase`-only stack. | `--jwt-secret` flag does not exist on `supabase start`. Docker-compose-only is explicitly out of spec scope. |
| 4 | Single unified bootstrap script. | Keep two scripts with one delegating to the other. | The split is the root cause of defect 1 in the spec; collapsing eliminates the bug class and shrinks the combined codebase (duplicate JWT payloads disappear). |
| 5 | `mintSupabase*` and `verifySupabaseJwt` live in `libsupabase`, not `libsecret`. | Keep mint in `libsecret`; verify in `libsupabase`. | Mint and verify must agree on payload shape (iss, role, algorithm) byte-for-byte. Splitting them across packages re-opens a class of "they don't agree" bugs in the same shape as today's three-secret divergence. `libsecret` stays focused on `.env` file management and generic `generateJWT` primitives. |
| 6 | All values in single `.env`; `.env.storage.*` files deleted. | Keep the storage-backend split files. | The split was about storage-type selection, not credential isolation. `STORAGE_TYPE` + `AWS_ENDPOINT_URL` already select the backend. |
| 7 | `#CREDENTIAL_KEYS` registers the three secrets; URL is not registered. | Register all four. | URL must reach docker-compose `${SUPABASE_URL}` shell interpolation, which runs before any Node process loads `Config`. Hiding the URL breaks compose. |
| 8 | Landmark HMAC stays best-effort: `try { verifySupabaseJwt(jwt, config.supabaseJwtSecret()) }`. | (a) Make HMAC mandatory. (b) Add `supabaseJwtSecretIfPresent()` accessor. | (a) breaks external `npx fit-landmark login` (engineers who never run bootstrap have no JWT secret; the comment at `identity.js:50-51` documents the intent). (b) is the same shape with a different name; idiomatic `try` for "may be unset on this install" suffices. |
| 9 | Static-inspection extends to forbid `@supabase/supabase-js` imports (static **and** dynamic) outside `libsupabase/src/client.js` and the Deno edge function. | Trust code review; only forbid direct env reads. | Without the second rule, the next consumer skips `libsupabase` and re-introduces `createClient(...)` boilerplate. This is a design-introduced invariant beyond spec § Success Criteria; it is the load-bearing guard that makes Decision 2's centralization durable past the migration commit. |
| 10 | Delete `MAP_SUPABASE_DB_PORT`. | Keep for documentary value. | Zero source consumers; spec § Scope requires removal. |

## Test surfaces

| Surface | What it covers |
| --- | --- |
| `libsupabase` unit | `readSupabaseEnv` returns the four values from a stubbed `process`/`envOverrides`; throws the `"<KEY> not found in environment"` shape on each missing field. `mintSupabaseAnonKey(secret)` and `mintSupabaseServiceRoleKey(secret)` produce HS256 JWTs that `verifySupabaseJwt(.., secret)` accepts. `createAnonClient` / `createServiceClient` accept a duck-typed `Config` and a plain record; both call `createClient` with `auth.persistSession = false`. |
| `libconfig` unit | The four accessors return env values; `SUPABASE_*` secrets do not appear on `process.env` after `Config.load()` (credential isolation); URL does appear on `process.env`; throw shape matches `#resolve`. |
| `env-setup` integration | Bootstrap against a tmpdir produces a `.env` with all 8 expected keys; second run is idempotent; signed anon + service-role JWTs verify against the generated `SUPABASE_JWT_SECRET`. |
| Static-inspection | No `process.env.SUPABASE_` / `process.env.MAP_SUPABASE_` in product/service/library `src/` + `bin/` (sole allow-list: `libsupabase/src/env.js`). No `createClient(.., .., ..)` from `@supabase/supabase-js` outside `libsupabase` + the Deno edge function. No hardcoded `"super-secret-jwt-token-..."` literal anywhere in source. |
| Consumer migration | Existing test suites pass after only a one-token env-var rename in test setup; no fixture or assertion logic changes. |
| Docker compose | `docker compose --profile map-supabase config` against a bootstrap-produced `.env` reports no unset-variable warnings. |
