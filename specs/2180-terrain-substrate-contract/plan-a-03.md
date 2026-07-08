# Plan 2180-a part 03 — map after the move

The clean break: `map` implements the contract as views over `activity.*`,
deletes the four moved verbs and their support modules, and repoints stage,
smoke, and `auth issue` to the `libterrain` capabilities (SC6, SC7).

## Step 1 — Contract-view migration and API exposure

`map` maps `activity.*` onto the contract relations.

- Created:
  `products/map/supabase/migrations/20260708000000_substrate_contract.sql`
- Modified: `products/map/supabase/config.toml`

Migration content (shape; implementer finalizes SQL):

```sql
create schema substrate;
grant usage on schema substrate to service_role;

create view substrate.people as
select p.email, p.name, p.kind, p.manager_email,
       replace(p.getdx_team_id, 'gdx_team_', '') as team_id,
       t.name as team_name,
       p.discipline, p.level, p.track
from activity.organization_people p
left join activity.getdx_teams t on t.getdx_team_id = p.getdx_team_id;

create view substrate.evidence as
select ga.email
from activity.evidence e
join activity.github_artifacts ga on ga.artifact_id = e.artifact_id;

create view substrate.discovery as
with latest as (select snapshot_id from activity.getdx_snapshots
                order by scheduled_for desc limit 1)
select 'snapshot_id' as key, latest.snapshot_id as value from latest
union all
select 'item_id', sc.item_id
from latest
join lateral (select item_id from activity.getdx_snapshot_team_scores
              where snapshot_id = latest.snapshot_id limit 1) sc on true;

grant select on all tables in schema substrate to service_role;
```

`team_id` strips the `gdx_team_` vendor prefix — the DSL team id the terrain
enricher keys on; the vendor coupling lives here, not in the library. Grants
go to `service_role` only — `substrate` stays out of anon/authenticated
reach, matching the contract's auth model. `config.toml`:
`schemas = ["public", "activity", "substrate"]`.

Verify: `supabase db reset` applies cleanly; new
`products/map/test/activity/substrate-contract-views.test.js` parses the
migration and asserts every relation/column named by `libterrain`'s
`SUBSTRATE_CONTRACT` is defined, and that `fit-terrain substrate check`'s
probe passes against a stub built from the migration's column lists (SC7).

## Step 2 — Delete the moved verbs and support modules

- Deleted:
  `products/map/src/commands/{substrate-pick,substrate-roster,substrate-issue,substrate-persona-query,people-provision}.js`,
  `products/map/src/lib/{persona-enricher,pick-memory,auth-helpers}.js`
- Deleted:
  `products/map/test/activity/{substrate-pick.integration,substrate-roster,substrate-issue.integration,substrate-persona-query,people-provision.integration}.test.js`,
  `products/map/test/lib/{persona-enricher,pick-memory.integration}.test.js`,
  `products/map/test/activity/_substrate-stubs.js` (superseded by
  `libterrain/test/substrate-stubs.js`)
- Modified: `products/map/bin/fit-map.js` (CLI definition drops the
  `substrate roster|pick|issue` commands; `people` args become
  `<validate|push> [file]` and the provision dispatch case deletes),
  `products/map/bin/dispatch-substrate.js` (only the `stage` case and a
  `stage`-only `known` set survive)

Verify: `fit-map --help` lists none of the four verbs; a **new**
`products/map/test/cli-definition.test.js` (no CLI-definition test exists
today) pins their absence (SC6).

## Step 3 — Stage provisions through libterrain

- Modified: `products/map/src/commands/substrate-stage.js`,
  `products/map/package.json` (`createMapClient` already takes a `schema`
  option — `src/lib/client.js` is untouched)

`loadProvision` default becomes
`() => import("@forwardimpact/libterrain/substrate").then((m) => m.runProvision)`.
Stage builds a second client
`createMapClient({ config: stageConfig, schema: "substrate" })` after
url-discovery and passes it to the provision phase and the smoke; the
activity-schema client keeps serving seed. `package.json` gains
`@forwardimpact/libterrain`.

Verify: `products/map/test/substrate-stage.test.js` and
`test/activity/substrate-stage*.test.js` pass, still asserting the provision
phase runs and that phase failures carry `[substrate stage: provision]`.

## Step 4 — Smoke and auth issue consume the moved capabilities

No private copy of the persona query or auth-user lookup survives.

- Modified: `products/map/src/commands/substrate-smoke.js` (import
  `findInvariantSatisfyingPersonas` from `@forwardimpact/libterrain/substrate`;
  it now receives the substrate-schema client; `assertPersonaIsHuman` queries
  `substrate.people`; `assertDiscoveryResolves` reads the query's folded
  `discovery` object — FI strictness on discovery stays here)
- Modified: `products/map/src/commands/auth-issue.js` (import `findAuthUser`
  from `@forwardimpact/libterrain/substrate`; the `organization_people`
  roster read stays — it is map's vendor query on map's operator surface)

Verify: `products/map/test/activity/substrate-smoke.test.js` (rebuilt on
contract-relation stubs) and `test/activity/auth-issue.test.js` pass.

## Step 5 — Repo-wide checks

Verify:
`rg 'getdx_|github_' libraries/libterrain/src/ libraries/libterrain/bin/`
still empty; `bun test products/map` and `bun run invariants` pass;
`fit-map substrate stage` help text and the skill remain accurate about the
retained pipeline (prose updates land in part 05).

Libraries used: libterrain (`./substrate`: `runProvision`,
`findInvariantSatisfyingPersonas`, `findAuthUser`, `SUBSTRATE_CONTRACT`),
libconfig, libsecret (smoke/auth issue JWT mint — unchanged).

## Risks

- View column drift is the contract's failure mode: the
  `substrate-contract-views.test.js` comparison against `SUBSTRATE_CONTRACT`
  is what keeps map's migration and the library's probe from drifting apart —
  do not hand-copy the column list into the test.
- `rls-scope.test.js`, `migration-rls.test.js`, and
  `service-role-still-used.test.js` assert schema/RLS posture; the new
  `substrate` schema (service-role-only grants, no RLS of its own — views run
  with owner rights) must be reflected there rather than allow-listed
  blindly.
