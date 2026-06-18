# Spec 2080 — Platform adoption substrate (#829)

## Problem

Leadership funds platform and AI-agent enablement but cannot see adoption or
impact across teams, and cannot ask whether adoption tracks developer
experience. Three concrete gaps block that question today.

- **No vendor-neutral team identity.** The only team construct in the activity
  schema is `getdx_teams`, shaped by and named for the GetDX survey vendor.
  Three places key on it: `organization_people` team membership,
  `getdx_snapshot_team_scores`, and `getdx_snapshot_comments` each carry a
  GetDX team reference. Any other source of team-level signal would have to
  borrow GetDX's team namespace or invent its own, and no two sources could be
  correlated on a shared team.
- **No storage for generic platform usage.** There is no table for "how much
  did team X use platform Y this period." Issue #829 established that
  producer-side usage metrics (sessions, tokens, lines, active users,
  acceptance rate, adoption percentage) have exactly one legitimate home —
  team-level aggregate, never individual attribution. That ruling generalizes
  beyond coding agents to any platform, and the substrate to hold it does not
  exist.
- **No correlation key.** Correlating platform usage with GetDX developer
  experience scores requires both to reference one team identity. They cannot,
  because there is no shared, vendor-neutral team registry.

These gaps make the leader's job — understand adoption and impact of platform
investment without a per-engineer scoreboard — unanswerable. The schema is not
in production, so this is fixed as an evergreen clean break: the GetDX-specific
team origin is removed, not migrated.

### JTBD

The job is **Engineering Leaders → Measure Engineering Outcomes**
([JTBD.md](../../JTBD.md#engineering-leaders-measure-engineering-outcomes)). The
Big Hire is *"demonstrate engineering progress without making individuals feel
surveilled,"* and its Anxiety force is *"measurement feels like surveillance
regardless of intent."* A leader investing in platform enablement needs to know
"is this being adopted, and is it helping?" at team granularity and against
developer experience, without a per-engineer view that turns that anxiety into
fact. A team-aggregate substrate with a shared team key is what makes the
question answerable while honoring the no-surveillance promise.

## Goal

A single vendor-neutral team registry is the canonical team identity for the
activity schema, authored independently of any vendor through a new `fit-map
teams push` verb. Both the GetDX scores and comments tables and a new
platform-usage cube reference it, so platform usage and developer experience
scores correlate on a shared team. Row-level security clamps every
team-attributed read to the caller's team subtree. A pull-based collector
ingests platform usage at team aggregate through per-platform adapters, dropping
any cohort below the contributor threshold and refusing any per-person field. A
new `fit-landmark adoption` surface renders the Team × Platform matrix, never
shows a usage metric except beside an outcome, and draws a control-chart trend
per team and platform. GetDX ingestion and the synthetic-data pipeline are both
adapted to the registry. Every `getdx_teams` table and `getdx_team_id` reference
is removed — across the activity schema, its readers, and the synthetic-data
pipeline that populates it.

## Scope (in)

| Area | Surface | What changes |
| --- | --- | --- |
| Team registry | New `activity.teams` table | Canonical vendor-neutral team identity, with a per-source reference that lets any vendor resolve its own team namespace into one registry row. Carries the team hierarchy needed for subtree scoping. |
| Registry authorship | New `fit-map teams push` verb (+ guide page + skill entry per `products/CLAUDE.md`) | Populates `activity.teams` from an authoritative roster. No vendor owns the team list. Operator-only: not reachable from any Landmark read path. Idempotent over an unchanged roster. |
| Team membership | `activity.organization_people` | Replace the GetDX team column with a reference to `activity.teams`, set by `fit-map people push`, not by GetDX ingestion. The management-tree column (`manager_email`) and its existing person-scoped RLS are retained unchanged. |
| GetDX re-key | `activity.getdx_snapshot_team_scores`, `activity.getdx_snapshot_comments` | Replace the GetDX team reference on both tables with a reference to `activity.teams`. The team-scores row identity and ingestion upsert key move to (snapshot, team, item). The comments table keeps its existing engineer-attributed (email) scope; only its team reference re-points. |
| Platform registry | New `activity.platforms` table | The set of platforms tracked: identity, name, category, and the outcome metric its usage is a denominator for. |
| Platform usage cube | New `activity.platform_usage` table | Team × Platform × Metric × Period facts: value, contributor count, period bounds, prior-period comparison, and a discriminator marking each metric as usage or outcome. References `activity.teams` and `activity.platforms`. Stores only typed aggregate fields — no per-engineer column and no opaque per-record passthrough. |
| Clean-break removal | Schema migrations | Remove `activity.getdx_teams` and every `getdx_team_id` reference — including the SQL function `activity.snapshot_ids_for_person`, which joins on it. Rewrite the base activity-schema and Landmark RLS migrations, extending each table-name allowlist in the RLS migration (the REVOKE/GRANT lists, the retention `COMMENT` set, and every retention-validator list) to the new tables. Fold in and remove the standalone GetDX-team-column migration. No compatibility shim, no data migration. |
| RLS | Landmark RLS migration | Enable RLS on `teams`, `platforms`, `platform_usage`, and keep it on the re-keyed `getdx_snapshot_team_scores`, `getdx_snapshot_comments`, and `getdx_snapshots`. Team-attributed reads admit rows for teams the caller belongs to, leads, or is an ancestor manager of (subtree). `platforms` is readable by any authenticated caller. `anon` reads zero. |
| GetDX ingestion adaptation | Map GetDX transform path | The GetDX team transform stops writing `getdx_teams` and stops setting membership; it resolves each GetDX team to a registry team via the source reference. The score transform and the comment transform — whose team derivation currently routes through `getdx_teams.manager_email` — both write the resolved registry team. GetDX teams that do not resolve are counted and skipped, never auto-created. |
| Synthetic-data pipeline | `libsyntheticgen` generator, `libsyntheticrender` renderer and activity validator | The generator mints vendor-neutral team identities (not `gdx_team_*`) and emits a teams roster plus `team_id`-keyed activity rows; the renderer and the activity validator write and assert the registry identity. This supersedes spec 0840's carve-out, which predates the column's removal. |
| Readers re-pointed | `activity.queries.snapshots`, the Map substrate persona/roster surfaces, and the Landmark `sources` command | Every read of `getdx_teams`/`getdx_team_id` reads the registry instead. `snapshots.js` composes the `get_team` management-tree output with the new team identity (its `get_team` call site changes even though `get_team` does not). `persona-enricher.js` drops its `gdx_team_` id-prefix coupling. The `get_team` helper itself is orthogonal and unchanged. |
| Pull collector + adapter contract | New `fit-map platform ingest` verb and a platform-adapter interface | Generic collector dispatches to a registered adapter by platform identity and upserts the cube idempotently per period. Collector-enforced guarantees: cohorts below the contributor threshold (default 5) are dropped before insert; a team that does not resolve is counted and skipped; an adapter emitting any per-person field is rejected. A reference fixture adapter exercises the path. |
| Adoption read surface | New `fit-landmark adoption` verb (+ guide page + skill entry) | Renders Team × Platform for a period; suppresses or rolls up cells below the contributor threshold on both the usage and the GetDX side; renders a usage metric only paired with its platform's outcome metric; draws a per-team, per-platform control-chart trend via the existing XmR machinery; offers a correlation view pairing platform usage with the team's GetDX scores on the shared team identity. |
| Tests | `products/map/test/`, `products/landmark/test/`, `libsyntheticgen`/`libsyntheticrender` tests, `services/map` test | Cover registry authorship idempotency; RLS subtree scope and anon-zero-rows on every team-attributed table; GetDX score and comment resolution and unresolved-skip; the cube discriminator and collector guarantees; adoption-matrix suppression, usage-needs-outcome rendering, and the correlation join; the synthetic pipeline emitting registry identities; and that no `getdx_teams`/`getdx_team_id` reference survives. |

## Scope (out)

- **Concrete Claude Code and Copilot adapters** (#829 Slices 2 and 4). This
  spec lands the substrate plus a reference fixture adapter; the vendor adapters
  are follow-up specs that inherit this spec's constraints.
- **#829 Slice 3 (traces → evidence).** The per-engineer, individual-attributed
  branch; it does not enter the team-aggregate cube.
- **Push ingestion.** Per-source scoped write tokens and an ingestion endpoint
  are a follow-up. This slice is pull-only.
- **Cross-cutting team cohorts.** A person belongs to one team for this slice;
  guilds and tiger teams are a follow-up the registry shape does not preclude.
- **Retention enforcement.** Declaring each row class's retention window is in
  scope; the job that deletes past-retention rows is not, matching spec 0840.
- **Engineer-side login flow.** JWT issuance into an engineer's environment
  remains the spec 0840 follow-up; this spec assumes the 0840 identity
  substrate.
- **Director-tier scope beyond the team subtree.** The recursive team subtree is
  the only scope expansion.
- **`services/map` gRPC contract.** The proto and its consumers are not changed
  beyond the test fixture that asserts on the removed column; Landmark reads
  through JS query modules, not the proto.
- **Web UI.** The adoption surface ships as a CLI verb; the web binding is later.

## Constraints (from #829)

Issue #829 enumerates downstream-binding constraints. Two are enforced
structurally by this spec and carry acceptance criteria: producer-side metrics
never reach an individual-attributed view (the cube has no per-engineer column
or passthrough, and the collector rejects any per-person field) and team
cohorts below a contributor threshold (default 5) are dropped (k-anonymity —
generalized here from #829's Copilot-specific statement to every platform's
team aggregate). The remaining constraints — Claude Code content gates
default-off, trace bodies engineer-only — bind the follow-up adapter specs
(Scope-out), which cite #829; they are not restated here so the issue stays
canonical and this slice ingests no vendor content to test them against.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | `activity.teams`, `activity.platforms`, and `activity.platform_usage` exist; `activity.getdx_teams` does not; no `getdx_team_id` column exists anywhere in the `activity` schema. | Static check on the migrated schema: the three tables present, `getdx_teams` absent, no `getdx_team_id` column. |
| 2 | `organization_people`, `getdx_snapshot_team_scores`, and `getdx_snapshot_comments` each reference `activity.teams`; none references a `getdx_*` team table. | Static check: a foreign key from each of the three tables to `activity.teams`; no foreign key to a `getdx_*` team table. |
| 3 | `fit-map teams push` populates `activity.teams` from an authoritative roster and is idempotent over an unchanged roster. | Behavioural test: push N teams; assert N rows; re-push; assert row count and per-team identity unchanged. |
| 4 | RLS is enabled on `teams`, `platforms`, `platform_usage`, `getdx_snapshot_team_scores`, `getdx_snapshot_comments`, and `getdx_snapshots`. | Static check: row security enabled on all six tables; no policy admits `anon`. |
| 5 | An authenticated caller reads team-attributed rows only for teams in their subtree; a sibling subtree contributes zero; an anon caller reads zero. | Behavioural test with a multi-level team fixture: a team lead sees own and descendant team rows, not a sibling subtree's; anon reads zero from each team-attributed table. |
| 6 | The cube carries a usage/outcome discriminator, and the collector rejects an adapter that emits any per-person field. | Static check: the discriminator column exists with the two values. Behavioural test: feed the fixture adapter a per-person field; assert it errors and stores nothing. |
| 7 | GetDX ingestion resolves each GetDX team to a registry team and writes scores and comments against it; an unresolved GetDX team is counted and skipped, not created. | Behavioural test: seed a source reference for one GetDX team, omit another; run the transform; assert scores and comments for the mapped team carry its registry identity, the unmapped team yields no `teams` row, and the skip is counted. |
| 8 | The collector drops a cohort below 5 contributors and skips an unresolved team. | Behavioural test via the fixture adapter: feed a sub-threshold row and an unresolved-team row; assert neither is stored and both are counted. |
| 9 | `fit-map platform ingest` is idempotent per period. | Behavioural test: ingest a fixture period twice; assert cube row count and values unchanged. |
| 10 | `fit-landmark adoption` renders Team × Platform for a period, suppresses sub-threshold cells on both the usage and GetDX sides, and renders a usage metric only beside its platform's outcome metric. | Behavioural test: seed usage rows, some sub-threshold and one usage metric with no paired outcome; assert sub-threshold cells are absent or rolled up and the unpaired usage cell is not rendered. |
| 11 | `fit-landmark adoption --platform <id>` draws a per-team, per-platform control-chart trend. | Integration test: seed enough periods; assert the chart renders with control limits via the existing XmR machinery. |
| 12 | The adoption surface correlates a team's platform usage with its GetDX scores by mapping a usage period to the GetDX snapshot cycle whose schedule covers it, joined on the shared team identity. | Integration test: seed `platform_usage` and `getdx_snapshot_team_scores` for the same team in a usage period within a snapshot cycle; assert the correlation view returns paired usage and score values. |
| 13 | The operator write credential for `fit-map teams push` and `fit-map platform ingest` is not reachable from any Landmark read path. | Static inspection: no file under `products/landmark/src/` constructs a service-role client or references the write credential, mirroring spec 0840 criterion 3a. |
| 14 | No source, test, or migration references `getdx_teams` or `getdx_team_id`, and no synthetic producer mints a `gdx_team_` identity. | Static inspection: a repository-wide search (`products/`, `libraries/`, `services/`, migrations, tests) for `getdx_teams`, `getdx_team_id`, and `gdx_team_` returns zero occurrences. |

## Notes — evidence pointers (for design)

- Cube shape to mirror (semantics differ, structure is the template):
  `activity.getdx_snapshot_team_scores` in the base activity-schema migration.
- Team-scope RLS idiom to generalize, plus the table-name allowlists to extend:
  the Landmark RLS migration (`20260510000000_landmark_rls.sql`) — REVOKE/GRANT
  lists, the retention `COMMENT` set, `_validate_retention_blob`,
  `retention_blob`, and the validation `DO` block. The
  `activity.snapshot_ids_for_person` function there joins on `getdx_team_id` and
  must be re-keyed (it stays SECURITY INVOKER and membership-scoped — it lists a
  person's own sources, not a subtree).
- GetDX origin to demote: the team, score, and comment transforms in
  `products/map/src/activity/transform/getdx.js` (the comment transform derives
  team via `getdx_teams.manager_email`).
- GetDX-team readers to re-point: `products/map/src/activity/queries/snapshots.js`,
  the substrate persona/roster surfaces (`substrate-persona-query.js`,
  `persona-enricher.js` — note its `gdx_team_` prefix coupling into the
  synthetic DSL), and `products/landmark/src/commands/sources.js`.
- Synthetic producers to re-root: `libsyntheticgen/src/engine/{entities,activity}.js`
  (mint `gdx_team_*`), `libsyntheticrender/src/render/raw.js` and
  `src/validate-activity.js`, and `services/map/test/map.test.js`.
- Operator write-path and idempotency precedents: `fit-map people push`
  (`products/map/src/commands/people.js`) and `people-provision.js`.
- Standalone migration to fold in: `20250504000001_org_people_getdx_team_id.sql`;
  comments FK in `20250101000003_getdx_snapshot_comments.sql`.
- Empty-state registry to extend: `products/landmark/src/lib/empty-state.js`.
- Umbrella: [#829](https://github.com/forwardimpact/monorepo/issues/829).
