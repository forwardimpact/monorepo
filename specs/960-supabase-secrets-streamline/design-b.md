# Design 960-b — Supabase Capability Library

## Rationale (vs design-a)

Design-a treats Supabase as **credentials accessed through `Config`** — every
consumer reads URL/key, then calls `createClient(...)` locally. Design-b adds a
new `libraries/libsupabase/` that **owns the three Supabase JWT mints, the
HS256 verify primitive, and `@supabase/supabase-js` client construction**.
`Config` keeps the spec-required four accessors with the same shape as
`mcpToken()`; consumers prefer the higher-level `createAnonClient(...)` /
`createServiceClient(...)` factories that hide URL+key wiring and the
`auth: {persistSession:false}` defaults.

Net deltas vs design-a:

- New leaf library `libsupabase` (depends on `@supabase/supabase-js` and
  `libsecret`). All three Supabase JWT mints (anon, service-role, per-caller
  `authenticated`) live here, co-located with `verifySupabaseHmac` so payload
  shape and algorithm stay consistent. `libsecret` retains generic
  `generateJWT` and the `.env` helpers.
- A second static-inspection rule forbids `@supabase/supabase-js` imports
  (static **and** dynamic) outside `libsupabase/src/client.js` and the Deno
  edge function. This retires the dynamic `await import("@supabase/supabase-js")`
  at `landmark/src/lib/identity.js:154`.
- The static-inspection rule for `process.env.SUPABASE_*` reads **retains the
  same `libstorage` exemption design-a uses**. design-b does not break the
  pre-existing `libconfig/src → libstorage` import; routing `libstorage` reads
  through a new abstraction is out of this spec's scope.
- `Config`'s four accessors remain the spec § Persona observable; the factories
  are an additional affordance, not a replacement.

## Components

| Component | Where | Role |
| --- | --- | --- |
| `libsupabase` package | `libraries/libsupabase/` (new) | New leaf library. Carries `package.json` (`description`, `keywords` ending in `agent`, `jobs` per `libraries/CLAUDE.md`) and `README.md`; ships no CLI in v1. Runtime deps: `@supabase/supabase-js`. Monorepo deps: `@forwardimpact/libsecret` (for `generateJWT`). Exports: `createAnonClient`, `createServiceClient`, `mintSupabaseAnonKey`, `mintSupabaseServiceRoleKey`, `mintSupabaseJwt`, `verifySupabaseHmac`. |
| `createAnonClient` / `createServiceClient` | `libraries/libsupabase/src/client.js` (new) | Signatures: `createAnonClient({config, jwt, schema, auth, createClient})` and `createServiceClient({config, schema, createClient})`. `config` is duck-typed and minimal: `createAnonClient` calls `config.supabaseUrl()` + `config.supabaseAnonKey()`; `createServiceClient` calls `config.supabaseUrl()` + `config.supabaseServiceRoleKey()`. Neither factory calls `config.supabaseJwtSecret()` — Decision 8's optional path is preserved. `jwt` sets `global.headers.Authorization = "Bearer <jwt>"`. `schema` is the PostgREST schema. `auth` is an optional pass-through merged **caller-over-defaults** so an explicit `{persistSession: true}` would override; design accepts that as a feature, not a bug. `createClient` is the optional test-seam — when omitted, defaults to the real export from `@supabase/supabase-js`. |
| `mintSupabaseAnonKey` / `mintSupabaseServiceRoleKey` / `mintSupabaseJwt` | `libraries/libsupabase/src/jwt.js` (new) | First two: `(jwtSecret) → string`, 10-year `{iss: "supabase", role, iat, exp}` payload — replace the inline anon/service-role payloads at `scripts/env-storage.js:37-79`. `mintSupabaseJwt({email, secret, ttlSeconds}) → string` is the per-caller `role: "authenticated"` mint relocated from `libsecret/src/index.js:167` — signature unchanged, only the import path changes. All three wrap `libsecret.generateJWT` so the HS256 algorithm pin is single-sourced. |
| `verifySupabaseHmac` | `libraries/libsupabase/src/jwt.js` (new) | `(headerPayload, signatureB64Url, secret) → boolean`. Computes HS256 over `headerPayload` and `timingSafeEqual`s against the decoded `signatureB64Url`. Returns `false` on length mismatch or signature mismatch — same two failure modes as today's `products/landmark/src/lib/identity.js:73-83`. The caller decides how to react: identity.js throws `IdentityUnresolvedError("LANDMARK_AUTH_TOKEN signature does not verify")` (the existing literal at `identity.js:75,82`) when `verifySupabaseHmac` returns `false` and the secret was available. No `jose` dependency. |
| `Config` Supabase accessors | `libraries/libconfig/src/config.js` (edit) | Adds four method-shaped accessors using `#resolve` per-field, matching `mcpToken()` exactly. Per-field lazy resolution is load-bearing for Decision 8: external `npx fit-landmark login` users have URL + anon but no JWT secret; `supabaseUrl()` must not throw because `SUPABASE_JWT_SECRET` is unset. Credential-set membership: three secrets join `#CREDENTIAL_KEYS`; URL does not (compose interpolation). `libconfig` does not import `libsupabase`. |
| Unified bootstrap script | `scripts/env-setup.js` (new; replaces `scripts/env-secrets.js` + `scripts/env-storage.js`) | Single CLI: generates `SERVICE_SECRET`, `DATABASE_PASSWORD`, `MCP_TOKEN`, `SUPABASE_JWT_SECRET` via `libsecret.getOrGenerateSecret`; derives `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` via `libsupabase.mintSupabase*`; generates every value today's `env-secrets.js` + `env-storage.js` pair produces, including the storage-backend access keys per spec § Scope. All values land in a single `.env`. The exact AWS_* layout (one pair vs per-backend pairs vs renamed-per-backend) is a plan-scope detail. Retains the `--output <path>` / `--add-mask` flags `env-secrets.js` exposes for CI. |
| `just env-setup` recipe | `justfile` (edit) | One recipe replacing `env-secrets` + `env-storage`. The recipe name is unchanged. |
| `config.toml` `[auth]` block | `products/map/supabase/config.toml` (edit) | Adds new line `jwt_secret = "env(SUPABASE_JWT_SECRET)"` to the existing `[auth]` table. Supabase CLI substitutes at `supabase start` time (documented at `https://supabase.com/docs/guides/cli/config#variable-interpolation`). Rationale + rejected alternatives in Decision 3. |
| `fit-map activity start` | `products/map/src/commands/activity.js` (edit) | Stops printing the `export MAP_SUPABASE_*` block; emits a one-line ready confirmation. The local Supabase stack reads `SUPABASE_JWT_SECRET` via `config.toml`'s `env()` interpolation; no command-side wiring. |
| Docker Compose env passthrough | `docker-compose.yml` (edit) | Four Supabase services (`storage-supabase`, `supabase-db`, `supabase-kong`, `supabase-map-storage`) drop the `env_file: .env.storage.supabase` line, take values from `.env` directly, and rename every `${MAP_SUPABASE_*}` / `${JWT_SECRET}` to the canonical names. Standalone `.env.storage.*` files deleted with `env-storage.js`. |
| `.env.*.example` files | `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example` (edit) | Each lists the same four-variable Supabase block; only `SUPABASE_URL` differs. `MAP_SUPABASE_DB_PORT` is removed. |
| Consumer call sites | 13 rows enumerated in § Per-module migration (services/, libraries/, products/) | Each replaces `process.env.MAP_SUPABASE_*` + `createClient(...)` with `libsupabase.createAnonClient(...)` / `createServiceClient(...)` (when constructing a client) or `config.supabase*()` accessors (when reading raw values). Per Decision 11, all five packages that import `@supabase/supabase-js` today (`products/summit`, `products/landmark`, `products/map`, `services/map`, `libraries/libterrain`) drop the direct dependency (regular or optional) and add `@forwardimpact/libsupabase` to `dependencies`. |
| Live-Postgres test setup | `products/map/test/activity/{migration-rls,rls-scope,people-provision,auth-issue}.test.js`, `products/map/test/activity/lib/live.js`, `products/landmark/test/{sources,dispatcher}.test.js`, `products/landmark/test/lib/{identity,sign-test-token}.test.js`, `products/landmark/test/commands/login.test.js` (edit) | Each reads `MAP_SUPABASE_*` from `process.env` to skip-gate or construct live clients. Each migrates to the canonical name. Test files are exempt from both static-inspection rules. |
| Static-inspection tests | `products/map/test/activity/service-role-still-used.test.js`, `products/landmark/test/lib/no-service-role-in-src.test.js` (edit); `libraries/libsupabase/test/repo-wide-invariants.test.js` (new) | First two assert the new canonical name. The new repo-wide test walks every `src/`/`bin/` under `products/`, `services/`, `libraries/`. Two patterns: (a) `process.env.SUPABASE_` / `process.env.MAP_SUPABASE_` literals — exempt: `libstorage/src/index.js` and the `products/map/supabase/functions/` tree. (b) Executable imports of `@supabase/supabase-js` — static `import {...} from "@supabase/supabase-js"` **and** dynamic `await import("@supabase/supabase-js")` — exempt: `libsupabase/src/client.js` and `products/map/supabase/functions/`. JSDoc `@param {import("@supabase/supabase-js").SupabaseClient}` type-only references are **not** flagged — they are erased at runtime and don't constitute a usage path. |
| Documentation | 7 pages listed in spec § Documentation table (edit) | Mechanical rename of `MAP_SUPABASE_*` and `JWT_SECRET` to canonical names; recipe-name updates. |

## Component graph

```mermaid
graph TD
  EX[.env.*.example] --> SETUP[scripts/env-setup.js]
  SETUP -->|writes| ENV[.env]
  SETUP -->|mintSupabase*| LIBSB[libsupabase]
  LIBSB -->|generateJWT| LIBSEC[libsecret]
  ENV --> CFGTOML[products/map/supabase/config.toml]
  CFGTOML -->|env(SUPABASE_JWT_SECRET)| SBCLI[supabase CLI]
  ENV --> CONFIG[libconfig.Config]
  CONFIG --> MAPSVC[services/map/server.js]
  CONFIG --> MAPCLI[products/map/src/lib/client.js]
  CONFIG --> MAPAUTH[products/map/src/commands/auth-issue.js]
  CONFIG --> LM_SB[landmark/src/lib/supabase.js]
  CONFIG --> LM_ID[landmark/src/lib/identity.js]
  CONFIG --> LM_LOG[landmark/src/commands/login.js]
  CONFIG --> SUMMIT[summit/src/lib/supabase.js]
  CONFIG --> TERRAIN[libterrain/src/cli-helpers.js]
  MAPSVC -->|createServiceClient| LIBSB
  MAPCLI -->|createServiceClient| LIBSB
  MAPAUTH -->|mintSupabaseJwt| LIBSB
  LM_SB -->|createAnonClient| LIBSB
  LM_LOG -->|createAnonClient| LIBSB
  LM_ID -->|createAnonClient + verifySupabaseHmac| LIBSB
  SUMMIT -->|createServiceClient| LIBSB
  TERRAIN -->|createServiceClient| LIBSB
  STOR[libstorage/src/index.js] -.->|env-direct, exempted| ENV
```

`libsupabase` depends only on `libsecret` (which has no monorepo deps).
`libconfig` does not import `libsupabase`. Arrows above show *import
direction*: `MAPSVC → LIBSB` means `services/map/server.js` imports from
`libsupabase`. `libstorage`'s edge is dashed because it stays env-direct
(same as design-a) — see Decision 2.

## `Config` accessor interface

```js
class Config {
  static #CREDENTIAL_KEYS = new Set([
    "ANTHROPIC_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "MCP_TOKEN",
    "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET",
  ]);
  supabaseUrl()            { return this.#resolve(["SUPABASE_URL"], stripTrailingSlashes); }
  supabaseAnonKey()        { return this.#resolve(["SUPABASE_ANON_KEY"]); }
  supabaseServiceRoleKey() { return this.#resolve(["SUPABASE_SERVICE_ROLE_KEY"]); }
  supabaseJwtSecret()      { return this.#resolve(["SUPABASE_JWT_SECRET"]); }
}
```

Throw shape matches existing `#resolve`: `"<KEY> not found in environment"`.
Per-field lazy resolution lets `supabaseUrl()` succeed while
`supabaseJwtSecret()` throws on the same Config (Decision 8 wraps the latter
in a `try`).

## Per-module migration

| Module | Migration |
| --- | --- |
| `services/map/server.js:13-20` | Replace the `||` chain with `createServiceClient({config})`. Dead property branch and `process.env` fallback delete. |
| `services/map/index.js` | No change. `MapService` already takes a pre-built `supabase` client. |
| `libraries/libterrain/src/cli-helpers.js:50-72` | `resolveSupabaseClient(config)` returns `createServiceClient({config})`. Callers construct `Config` via `createScriptConfig("terrain")`. |
| `libraries/libstorage/src/index.js:198-229` | **No source change** for the Supabase rename — the existing `process.env.SUPABASE_SERVICE_ROLE_KEY` read at line 201 is already the canonical name. libstorage stays env-direct and joins the static-inspection allow-list, same as design-a. AWS_*/S3_* env names are unrelated to this spec. |
| `products/map/src/lib/client.js:12-32` | `createMapClient(opts)` defaults `config = createProductConfig("map")` and calls `createServiceClient({config})`. |
| `products/map/src/commands/auth-issue.js:53-60` | Reads `config.supabaseJwtSecret()` via existing handler `params`; calls `libsupabase.mintSupabaseJwt({email, secret, ttlSeconds})` — same signature as today's `libsecret` export, only the import path changes. |
| `products/map/src/commands/activity.js:20` | `supabaseCli` module-level singleton is unchanged (`stop`, `status`, `migrate` continue to share it). Only the `formatSubheader("Export these variables…")` block in `start()` is deleted. |
| `products/landmark/src/lib/supabase.js:12,30-48` | `createLandmarkClient({config, jwt, schema})` resolves URL + anon key from `config` and calls `createAnonClient({config, jwt, schema})`. The existing `SupabaseUnavailableError` typed throw is preserved: if `config.supabaseUrl()` or `config.supabaseAnonKey()` throws `"not found"`, `createLandmarkClient` catches and re-throws as `SupabaseUnavailableError` — `dispatcher.test.js:7` documents this as the exit-code-3 contract. |
| `products/landmark/src/lib/identity.js:71-104,139,154-155` | Public API becomes `resolveIdentity({config, env, createClient})` — `createClient` is forwarded to `createAnonClient({config, createClient})` (the factory's `createClient` parameter). `env` carries `LANDMARK_AUTH_TOKEN` only. The HMAC verify path is: `try { secret = config.supabaseJwtSecret() } catch { /* no secret — silent skip per Decision 8 */ }`; if `secret` was set, call `verifySupabaseHmac(headerPayload, sigB64, secret)` and throw `IdentityUnresolvedError("LANDMARK_AUTH_TOKEN signature does not verify")` (the existing literal) on `false`. `refreshSession`'s dynamic `await import("@supabase/supabase-js")` is replaced by `createAnonClient({config, createClient})`. |
| `products/landmark/src/commands/login.js:103-134,161,168` | `createPkceStorage()` stays in-module (Landmark-local). `resolveAnonClient({config, createClient, flowType = "implicit"})` retains today's `flowType` parameter (default `"implicit"` for OTP, caller passes `"pkce"` for browser) and calls `createAnonClient({config, auth: {flowType, storage: createPkceStorage()}, createClient})`. The two call sites at `:161` (OTP) and `:168` (PKCE browser) pass through unchanged. Error wording points at `just env-setup`. |
| `products/map/test/activity-start.test.js:35-54` | The four `assert.match(text, /export MAP_SUPABASE_*/)` assertions and the order check are replaced with one assertion on the new ready-confirmation output. |
| `products/summit/src/lib/supabase.js:27-51` | `createSummitClient({config, schema})` calls `createServiceClient({config, schema})`. |
| `products/landmark/test/lib/sign-test-token.js:14-20` | Renames `process.env.MAP_SUPABASE_JWT_SECRET` → `process.env.SUPABASE_JWT_SECRET` **and** changes the `mintSupabaseJwt` import from `@forwardimpact/libsecret` to `@forwardimpact/libsupabase` (Decision 5 relocation). Test helper stays env-direct. |

## Key Decisions

| # | Decision | Rejected alternative | Why |
| --- | --- | --- | --- |
| 1 | Unprefixed canonical names. | Keep `MAP_` prefix; introduce parallel `LANDMARK_SUPABASE_*` / `SUMMIT_SUPABASE_*`. | One Supabase instance exists; prefix is dead structure (spec § Problem). |
| 2 | New `libsupabase` capability library centralizing client construction + JWT mint/verify. `Config` accessors stay in `libconfig` (`#resolve` per-field) and do not delegate to `libsupabase`. `libstorage` stays env-direct + exempt from the `process.env.SUPABASE_*` static-inspection rule (same as design-a). | (a) Add four accessors directly to `Config` and let consumers call `createClient(...)` per-module (**design-a**). (b) Have `Config` accessors delegate into a shared env-reader helper in `libsupabase`. (c) Route `libstorage` through `libsupabase` to drop the exemption. | (a) leaves five duplicate `createClient(...)` call sites. (b) muddles ownership: either `libsupabase` imports `Config` (cycle) or it duck-types the four accessors twice. (c) doesn't fit: `libstorage` reads only `SUPABASE_SERVICE_ROLE_KEY` as a string (for HMAC-signing storage URLs) and never uses `@supabase/supabase-js`, so the `createAnonClient` / `createServiceClient` factory surface gives it nothing useful — and routing it through a string-getter in `libsupabase` would require either `libsupabase → libconfig` (cycle, given the existing `libconfig/src → libstorage` import) or a parallel `.env` reader. design-b accepts the same `libstorage` exemption design-a uses and wins on factory centralization + dynamic-import removal. |
| 3 | Override Supabase CLI demo secret via `jwt_secret = "env(SUPABASE_JWT_SECRET)"` in `config.toml`. | `supabase start --jwt-secret <ours>`; docker-compose `map-supabase`-only stack. | `--jwt-secret` flag does not exist on `supabase start`. Docker-compose-only is explicitly out of spec scope. |
| 4 | Single unified bootstrap script. | Keep two scripts with one delegating. | The split is the root cause of spec defect 1; collapsing eliminates the bug class. |
| 5 | `mintSupabase*` and `verifySupabaseHmac` live in `libsupabase`, not `libsecret`. | Keep mint in `libsecret`; verify in `libsupabase`. | Mint and verify must agree on payload shape, iss, role, algorithm. Splitting them re-opens "they don't agree" bugs. `libsecret` retains generic `generateJWT` and `.env` helpers. |
| 6 | All values in single `.env`; `.env.storage.*` files deleted. | Keep the storage-backend split files. | The split was about storage-type selection, not credential isolation. `STORAGE_TYPE` + `AWS_ENDPOINT_URL` already select the backend. |
| 7 | `#CREDENTIAL_KEYS` registers the three secrets; URL is not registered. | Register all four. | URL must reach docker-compose `${SUPABASE_URL}` shell interpolation. Hiding it breaks compose. |
| 8 | Landmark HMAC stays best-effort: a thrown `"not found"` on `config.supabaseJwtSecret()` silently skips the check; a `false` return from `verifySupabaseHmac` when the secret **was** available throws the existing `IdentityUnresolvedError("LANDMARK_AUTH_TOKEN signature does not verify")`. | (a) Make HMAC mandatory. (b) Add `supabaseJwtSecretIfPresent()` accessor. | (a) breaks external `npx fit-landmark login` (no bootstrap, no JWT secret). (b) is the same shape with a different name; idiomatic `try` around the accessor suffices. |
| 9 | Static-inspection extends to forbid `@supabase/supabase-js` imports (static **and** dynamic) outside `libsupabase/src/client.js` and the `products/map/supabase/functions/` tree. | Trust code review. | Without the second rule, the next consumer skips `libsupabase` and re-introduces `createClient(...)` boilerplate. This is a design-introduced invariant beyond spec § Success Criteria. |
| 10 | Delete `MAP_SUPABASE_DB_PORT`. | Keep for documentary value. | Zero source consumers; spec § Scope requires removal. |
| 11 | `@supabase/supabase-js` becomes a hard `dependencies` entry on `libsupabase`. Every package whose `src/` or `bin/` imports `@supabase/supabase-js` today — `products/summit`, `products/landmark`, `products/map`, `services/map`, `libraries/libterrain` — **drops** its direct `@supabase/supabase-js` entry (regular or optional) and **adds** `@forwardimpact/libsupabase` to `dependencies`. | Keep `optionalDependencies` and mirror on libsupabase. | Today's optional-dep guard is paired with `try { await import(...) }`. Decision 9 forbids that import shape, so the guard becomes vestigial. Owning the dep at `libsupabase` makes the install requirement explicit and one-source; the five consumers no longer carry their own declaration. |

## Test surfaces

| Surface | What it covers |
| --- | --- |
| `libsupabase` unit | `mintSupabaseAnonKey(secret)` / `mintSupabaseServiceRoleKey(secret)` / `mintSupabaseJwt({email, secret, ttlSeconds})` produce HS256 JWTs whose third segment `verifySupabaseHmac` accepts against the same `secret`. `createAnonClient` / `createServiceClient` call the injected `createClient` (defaults to the real one) with `auth: {persistSession: false, autoRefreshToken: false}` merged caller-over-defaults; PKCE `{flowType, storage}` pass through. `createAnonClient` calls only `supabaseUrl()` + `supabaseAnonKey()` on its `config`; `createServiceClient` calls only `supabaseUrl()` + `supabaseServiceRoleKey()` — verified by a stub that throws on any other accessor. |
| `libconfig` unit | The four accessors return env values; `SUPABASE_*` secrets do not appear on `process.env` after `Config.load()` (credential isolation); URL does appear on `process.env`; throw shape matches `#resolve`. |
| `env-setup` integration | Bootstrap against a tmpdir produces a `.env` with all 8 expected keys; second run is idempotent; signed anon + service-role JWTs verify against the generated `SUPABASE_JWT_SECRET`. |
| Static-inspection | No `process.env.SUPABASE_` / `process.env.MAP_SUPABASE_` literals in product/service/library `src/` + `bin/` outside `libstorage/src/index.js` and the `products/map/supabase/functions/` tree. No executable `@supabase/supabase-js` imports outside `libsupabase/src/client.js` and `products/map/supabase/functions/` (JSDoc type-only references not flagged). No hardcoded `"super-secret-jwt-token-..."` literal in source. |
| Consumer migration | Existing test suites pass after a one-token env-var rename in test setup, plus signature-shape updates at the injection seams design-b changes (`resolveIdentity({config, env, createClient})`, `resolveAnonClient({config, createClient, flowType})`, factory `createClient` parameter). No fixture data or assertion-target changes. |
| Docker compose | `docker compose --profile map-supabase config` against a bootstrap-produced `.env` reports no unset-variable warnings. |
