# Plan 2180-a — Generic substrate contract

Execute spec [2180](spec.md) / design [a](design-a.md): move the standard's
data contract (levels module + thirteen JSON schemas) from `map` into
`libskill`, and move the substrate identity verbs into `fit-terrain` behind
the documented Substrate Contract. One clean break — no shims, no re-exports,
no dual paths.

## Approach

Land the layering fix first (part 01 breaks the `libskill ↔ map` cycle and the
`libterrain → map` edge), then build the generic verbs in `libterrain`
(part 02) while `map` still carries its own copies — the repo stays green
between parts. Part 03 is the break: `map` gains the contract-view migration,
loses the four verbs, and repoints its survivors (stage, smoke, `auth issue`)
to the `libterrain` capabilities. Parts 04–06 rewire the consumers: the
interview workflow, the external documentation and skills, and the Polaris
reference. Every FI-specific literal (`PRODUCT_LANDMARK_TOKEN`,
`wiki/kata-interview/picks.csv`) moves up into the wrapper workflow; the
library takes them only as required options.

## Part Index

| Part | Title | Scope | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | Standard contract moves to libskill | `levels.js` + `schema/json/` move, all import repoints, `libterrain` schema-dir resolution, dependency edges | — |
| [02](plan-a-02.md) | libterrain substrate verbs | `substrate` module (client, contract, persona query, enricher, pick memory, auth users), six verbs, CLI wiring, unit tests | 01 |
| [03](plan-a-03.md) | map after the move | Contract-view migration + API exposure, four verbs deleted, stage/smoke/`auth issue` repointed, tests | 02 |
| [04](plan-a-04.md) | Interview workflow wiring | `persona-select-command` switches to `fit-terrain`, shape-test assertions | 03 |
| [05](plan-a-05.md) | Contract guide, skills, docs | Substrate Contract guide, `fit-terrain`/`fit-map` skill + CLI doc parity, provisioning guide + verb-doc sweep | 03 |
| [06](plan-a-06.md) | Polaris reference wiring | `references/bionova-apps/` drops `@forwardimpact/map`, documents the full `up → init → check → provision → pick → issue` loop | 02 |

Libraries used: libskill (levels module, `schema/json/*` — new home), libterrain
(substrate verbs — new home), libsecret (`mintSupabaseJwt`, `parseDuration`),
libconfig (`createScriptConfig` env resolution: `supabaseUrl`,
`supabaseServiceRoleKey`, `supabaseJwtSecret`), libcli (`formatTable`,
`formatError`, `formatSuccess`), libutil (runtime, `isoTimestamp`),
libsyntheticgen (DSL persona enrichment), libmock (`createTestRuntime`).

## Risks

- **The current wrapper's `jq -r .email` reads a field the pick payload does
  not carry at top level** (`substrate pick --format json` emits
  `{personas:[…]}`). Part 04 extracts `.personas[0].email`. This corrects the
  extraction while switching CLIs — reviewers should not read it as
  behaviour drift; the payload shape itself is unchanged.
- **`substrate.evidence` shares its name with map's vendor `activity.evidence`
  table.** Any terrain query built from a client not bound to
  `db.schema = "substrate"` would silently read the wrong relation through
  the default search path. Part 02's client factory is the only construction
  site and a unit test pins the schema binding (SC4).
- **The contract persona row drops `github_username`** (not a contract
  column). `kata-interview`'s persona template does not reference it, but the
  implementer of part 02 must confirm no supervisor prompt or action consumes
  it from the pick payload before deleting the field.
- **Stage needs two clients after part 03**: the activity-schema client for
  seed, and a substrate-schema client for provision and smoke. Passing the
  activity client to the moved provision would fail with "relation people
  not found" only at CI time.
- **Publish coupling.** `libskill`, `libterrain`, and `map` must release
  together: `map@0.15.x` consumers of `./levels` / `./schema/json/*` take a
  breaking bump, and `map`'s new `libterrain` dependency must resolve to the
  version carrying the substrate verbs. `kata-release-cut` owns the bump
  levels; the constraint to record there is "one release train, map last".
- **Map's discovery strictness moves, not disappears.** The library degrades
  declaredly when `substrate.discovery` is empty or absent; the FI
  requirement that discovery resolves is enforced by map's smoke
  (`assertDiscoveryResolves`), which part 03 keeps.

## Execution recommendation

| Sequencing | Notes |
| --- | --- |
| 01 → 02 → 03 → 04 sequential | Each depends on the previous; repo green after every part. Part 04 additionally waits for the release cut (see its risk) |
| 06 parallel after 02 | The Polaris reference needs only the library surface and touches no map file |
| 05 after 03 | Part 05 edits `products/map/bin/fit-map.js` and the fit-map skill that part 03 also touches, and must not document verbs as gone while the shipped CLI still has them |

Route parts 01–04 and 06 to `staff-engineer` via `kata-implement`; route
part 05 to `technical-writer` (guide + skill prose, with the CLI
`documentation`-array parity edits included so skill/CLI stay in one commit).
Each part lands as one PR.
