# Plan 2180-a part 02 — libterrain substrate verbs

Build the generic substrate identity capability in `libterrain`: a
schema-bound client, the contract description, the persona query rewritten
against `substrate.*`, and the six CLI verbs with unit tests (SC4, SC5).
`map`'s copies stay untouched until part 03.

## Step 1 — Contract description and client factory

One module states the contract; one factory is the only client construction
site.

- Created: `libraries/libterrain/src/substrate/contract.js`
- Created: `libraries/libterrain/src/substrate/client.js`

`contract.js` exports:

```js
export const SUBSTRATE_CONTRACT = {
  schema: "substrate",
  relations: {
    people: {
      required: true,
      columns: ["email", "name", "kind", "manager_email",
                "team_id", "team_name", "discipline", "level", "track"],
    },
    evidence: { required: false, columns: ["email"] },
    discovery: { required: false, columns: ["key", "value"] },
  },
};
```

`client.js` exports `createSubstrateClient({ config })` →
`createClient(config.supabaseUrl(), config.supabaseServiceRoleKey(), { db: { schema: "substrate" } })`.
No other module calls `createClient`.

Verify: new `test/substrate-client.test.js` asserts (via an injected
`createClient` spy) the factory passes `db.schema = "substrate"` — the SC4
schema-binding test covering the `evidence` name shared with map's vendor
table.

## Step 2 — Persona query against the contract

Port `findInvariantSatisfyingPersonas` from
`products/map/src/commands/substrate-persona-query.js`, requeried against
contract relations only.

- Created: `libraries/libterrain/src/substrate/persona-query.js`

| Aspect | Behaviour |
| --- | --- |
| Inputs | `substrate.people` (`kind = 'human'` rows are personas), `substrate.evidence`, `substrate.discovery` |
| Structural invariants (always) | `manager_email` non-null; manages ≥ 1 direct (derived from people rows) |
| Evidence invariants (when `substrate.evidence` present) | authors ≥ 1 evidence row; manages ≥ 1 direct who authors ≥ 1 |
| Optional-relation detection | a query error with code `PGRST205`/`42P01` (relation absent) marks the relation absent; any other error propagates |
| Discovery | fold `substrate.discovery` key/value rows into one object (e.g. `{snapshot_id, item_id}`); absent or empty relation → `discovery: null` |
| Row shape | `email, name, discipline, level, track, parent_email, team_id, team_name, parent, teammates (≤3, truncation flag), manages_count, evidence_count, practice_directs_count` — `github_username`, `getdx_team_id`, `snapshot_id`, `item_id` drop from the row |
| Return | `{ personas, discovery, applied_invariants, diagnostic? }` — `applied_invariants` names which invariant set ran, for the pick payload's declared degradation |
| Diagnostics | port `diagnoseBindingConstraint` unchanged; empty-people diagnostic stays |

Verify: `test/substrate-persona-query.test.js` covers invariants with and
without `substrate.evidence`, the binding-constraint diagnostic, and discovery
folding/absence, against a new `test/substrate-stubs.js` fixture keyed on the
three contract relations (modeled on map's `_substrate-stubs.js`).

## Step 3 — Enricher, pick memory, auth users

Port the three support modules.

- Created: `libraries/libterrain/src/substrate/persona-enricher.js` (from
  `products/map/src/lib/persona-enricher.js`)
- Created: `libraries/libterrain/src/substrate/pick-memory.js` (from
  `products/map/src/lib/pick-memory.js`, logic unchanged; header comment loses
  the `wiki/kata-interview` path — the path is caller-supplied)
- Created: `libraries/libterrain/src/substrate/auth-users.js` (merges
  `products/map/src/lib/auth-helpers.js` `findAuthUser` and
  `products/map/src/commands/people-provision.js` `runProvisionCommand` →
  `runProvision`, requeried: roster emails come from `substrate.people`)

Enricher change: `enrichPersonaRow(row, ast)` keys on the contract's
`row.team_id` and calls `findTeamById(ast, row.team_id)` directly — the
`gdx_team_` prefix handling deletes; vendor-id mapping is the consumer view's
job (part 03). `loadStory` ports unchanged (upward resolution of
`data/synthetic/story.dsl` from cwd; absent → `null`, un-enriched rows).

Verify: `test/substrate-enricher.test.js` (team resolution by bare `team_id`,
absent AST → null fields) and `test/substrate-provision.test.js`
(create/restore/decommission against a stubbed `auth.admin`, roster read from
`substrate.people`) pass.

## Step 4 — The six verb commands

One module per verb, signatures from design § CLI verb interfaces.

- Created: `libraries/libterrain/src/commands/substrate-init.js`
- Created: `libraries/libterrain/src/commands/substrate-check.js`
- Created: `libraries/libterrain/src/commands/substrate-provision.js`
- Created: `libraries/libterrain/src/commands/substrate-pick.js`
- Created: `libraries/libterrain/src/commands/substrate-roster.js`
- Created: `libraries/libterrain/src/commands/substrate-issue.js`

| Verb | Implementation notes |
| --- | --- |
| `init --cwd <dir>` | Offline. Writes `<cwd>/supabase/migrations/<ts>_substrate_contract.sql` (`ts` from `runtime.clock`): `CREATE SCHEMA substrate`, service-role grants, one commented example view per contract relation generated from `SUBSTRATE_CONTRACT` columns |
| `check` | Column-explicit `select(<columns>).limit(1)` per relation via the client; one diagnostic per missing/malformed relation; required failure → exit 1, optional absence → info diagnostic, exit 0 |
| `provision` | Thin wrapper over `runProvision` |
| `pick --format json\|text --memory <path> --memory-window <n>` | Port of map's `runPickCommand`: memory only when `--memory` supplied (read window, append on success; stateless otherwise); window default 5 via `--memory-window`; enrichment via `loadStory`; payload gains `selection_metadata.applied_invariants` from the query |
| `roster --format json\|text` | Port of map's `runRosterCommand` over the same query; table headers unchanged |
| `issue --email <e> --cwd <p> --token-env <NAME> [--ttl <d>] [--stash <path>]` | Port of map's `runSubstrateIssueCommand`: `--token-env` **required, no default**; `.env` line is `<NAME>=<jwt>`; `.substrate.json` carries the discovery key/values (spread, not nested) + `persona_email`, `manager_email` (persona's own email — port the invariant-(a) comment), `generated_at`; no discovery → identity-only file; same tmp-write/rename atomicity, mode 0600, stash behaviour; `kind !== "human"` rejection message names `substrate.people`, not `fit-map auth issue` |

No `PRODUCT_LANDMARK_TOKEN` or `kata-interview` literal survives (SC5). The
pick-memory `run_id` column keeps its `env.GITHUB_RUN_ID ?? ""` source — CI
run metadata, not a product literal, and it degrades to empty outside GitHub.

Verify:
`rg 'PRODUCT_LANDMARK_TOKEN|kata-interview|getdx_|github_' libraries/libterrain/src/ libraries/libterrain/bin/`
is empty (SC4, SC5); `test/substrate-init.test.js`,
`test/substrate-check.test.js`, `test/substrate-pick.test.js` (memory on/off,
window, token-env-free), `test/substrate-issue.test.js` (file set,
`--token-env` threading and required-ness, stash, non-human rejection,
identity-only degradation) pass.

## Step 5 — CLI wiring and package surface

Dispatch the verbs and export the capabilities map will consume.

- Modified: `libraries/libterrain/bin/fit-terrain.js`,
  `libraries/libterrain/package.json`
- Created: `libraries/libterrain/src/substrate/index.js`

`bin/fit-terrain.js`: the existing `positionals[0] === "substrate"` branch
becomes a subcommand table (`up|init|check|provision|pick|roster|issue`);
stack-facing verbs build `createScriptConfig("terrain")` and
`createSubstrateClient({ config })`; `issue` reads `config.supabaseJwtSecret()`
(the `JWT_SECRET` env var — design § Key Decisions). Add the six command
definitions (options + examples) to `definition.commands`.

`package.json`: `exports` gains
`"./substrate": "./src/substrate/index.js"` (re-exports
`findInvariantSatisfyingPersonas`, `findAuthUser`, `runProvision`,
`createSubstrateClient`, `SUBSTRATE_CONTRACT`); `@supabase/supabase-js` moves
from `optionalDependencies` to `dependencies`; add `@forwardimpact/libsecret`.

Verify: `bunx fit-terrain --help` lists the seven substrate verbs;
`bun test libraries/libterrain` passes; `bun run invariants` passes.

Libraries used: libsecret (`mintSupabaseJwt`, `parseDuration`), libconfig
(`createScriptConfig`), libcli (`formatTable`, `formatError`,
`formatSuccess`), libsyntheticgen (enricher helpers), libutil
(`isoTimestamp`, runtime), libmock (tests).

## Risks

- `pick`'s enrichment resolves `story.dsl`/`prose-cache.json` upward from
  `cwd` with a depth cap of 5 (ported `findUpward` call) — in the interview
  action the process cwd is the checkout root, so the cap is safe, but do not
  "simplify" to project-root resolution: an external consumer has no
  monorepo-shaped root.
- `check` must not use `select("*")` — PostgREST accepts unknown relations
  lazily on some error paths; the column-explicit select is what turns a
  malformed view into a diagnostic naming the missing column.
