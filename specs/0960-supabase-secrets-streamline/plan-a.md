# Plan 0960-a — Streamline Supabase Secrets and JWT Authentication

References: [spec.md](spec.md) · [design-a.md](design-a.md).

## Approach

Land the rename in dependency order: helpers and accessors first, then the
bootstrap script that produces the new `.env` shape, then the ten consumer call
sites (each preceded by a `createProductConfig`/`createServiceConfig` call in
its bin where needed — `services/map/server.js`, `bin/fit-guide.js`, and
`bin/fit-terrain.js` already build a `Config`; the three product bins this spec
touches (`fit-map.js`, `fit-landmark.js`, `fit-summit.js`) do not), then the
static-inspection test and docker-compose wiring that close the gate, then the
documentation. Parts are sized so each lands as one reviewable diff with its own
tests passing in isolation — except Part 04's new `process.env.SUPABASE_` ban,
which assumes Part 03 already migrated every consumer.

## Parts

| Part | Title | Scope |
| --- | --- | --- |
| [01](plan-a-01.md) | Foundation | `libsecret` mint helpers; `Config` Supabase accessors + credential-set entries; unit tests |
| [02](plan-a-02.md) | Bootstrap | `scripts/env-setup.js`, `just env-setup` recipe, `config.toml` `jwt_secret`, three `.env.*.example` files; delete `env-secrets.js`, `env-storage.js`, `.env.storage.*` |
| [03](plan-a-03.md) | Consumer migration | Ten `src/` call sites + `activity.js` rewrite + `sign-test-token.js` rename + every dependent test file |
| [04](plan-a-04.md) | Compose + static-inspection gate | `docker-compose.yml` rewrites; existing static-inspection tests retargeted; new "no `process.env.SUPABASE_` in src/bin" test |
| [05](plan-a-05.md) | Documentation | Seven `websites/` pages + `fit-summit/references/roster.md` + `websites/fit/docs/internals/operations/index.md` recipe swap |

Libraries used: `@forwardimpact/libsecret` (`generateJWT`, `generateSecret`, `generateBase64Secret`, `getOrGenerateSecret`, `updateEnvFile`, plus two new `mintSupabase*` helpers), `@forwardimpact/libconfig` (`Config`, `createServiceConfig`, `createScriptConfig`, `createProductConfig`).

## Execution

Parts run sequentially **01 → 02 → 03 → 04**; **05 runs in parallel with 04**.
Route each part as listed below. Land each part as a separate PR so reviewers
see one diff at a time; merge into `main` in order so the next part can rebase
on a green base. Do not collapse 03 into a single mega-commit — its ten
sub-targets each land green on their own and the static-inspection assertion in
Part 04 is what catches anything missed.

| Part | Agent | Why |
| --- | --- | --- |
| 01 | `staff-engineer` | Library code touching credential surfaces in `libsecret` and `libconfig`; needs careful test coverage. |
| 02 | `staff-engineer` | Script + recipe wiring with idempotency and CI-output contracts (`--add-mask`). |
| 03 | `staff-engineer` | Cross-product code migration; each consumer's test suite must stay green at each step. |
| 04 | `staff-engineer` | Compose wiring and gate-tightening. The new static-inspection test fails CI if anything in 03 was missed — by design. |
| 05 | `technical-writer` | Mechanical docs rename + recipe swap. Parallelizable with 04 because docs and Compose touch disjoint files. |

## Risks

| Risk | Cannot see by reading the plan |
| --- | --- |
| Local Supabase CLI silently ignores `jwt_secret = "env(SUPABASE_JWT_SECRET)"` if the CLI is older than the version that introduced `env()` interpolation. | The interpolation feature has been documented in the Supabase CLI for years and pre-dates this monorepo's pinned floor; the failure mode if a contributor runs an outdated CLI is that `fit-map activity start` mints demo-secret JWTs and Landmark identity falls through to shape-only verify (no security break — Postgres RLS still clamps). Out of scope to gate behind a `supabase --version` probe; flagged for the implementer in case the symptom appears. |
| The `libstorage` exemption documented in design § Per-module injection seams is a permanent allow-list entry, not a TODO. | Part 04's static-inspection test must hard-code the file path of the exemption in the `ALLOW` set rather than scanning for a magic comment, so future moves don't silently drop the exemption. |
| `Config.load()` is async; the three product bins this spec touches (`fit-map.js`, `fit-landmark.js`, `fit-summit.js`) have no `libconfig` import today and Part 03 must introduce one near the top of each entry point before any handler runs. | `bin/fit-guide.js`, `bin/fit-terrain.js`, and `services/map/server.js` show the pattern: `import { createProductConfig } from "@forwardimpact/libconfig"` plus `const config = await createProductConfig("<name>")` at module top. Each spec-touched bin uses a different dispatch shape (`fit-map.js` is a per-command `switch` with `dispatchAuth`/`dispatchActivity` helpers; `fit-landmark.js` threads context via `buildContext`; `fit-summit.js` calls handler-export functions directly), so threading `config` looks different in each — see plan-a-03 Step 0. |
| `Config.#CREDENTIAL_KEYS` membership controls whether a value lands on `process.env` or in the private `#envOverrides` map. Adding `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to that set removes them from `process.env` — but docker-compose interpolation runs at the shell level and reads `process.env` from the user's shell, not from `Config`. | Docker-compose interpolates `${SUPABASE_*}` *before* any Node process loads `Config`, so `.env` values are visible to compose via dotenv-style loading of `.env` files by the docker-compose runtime itself. This is fine — but tests that spawn a Node child process and pass it through `Config` must understand that `SUPABASE_ANON_KEY` will not appear on the child's `process.env`. |

## Out of scope

Spec § Out of scope, deferred is authoritative. The plan does not introduce
backwards-compatibility shims, fallback chains, or deprecated aliases.
