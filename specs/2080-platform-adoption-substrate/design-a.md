# Design 2080-a — Platform adoption substrate

Architecture for spec 2080: a single vendor-neutral `activity.teams` registry
(holding the full org → department → team hierarchy) shared by the GetDX scores
and comments tables and a new `platform_usage` cube, a pull-based collector with
a per-platform adapter contract, and a `fit-landmark adoption` read surface.
Clean break: `getdx_teams`, every `getdx_team_id`, and every `gdx_*` team id are
removed, not migrated (schema is pre-production), across the schema, readers,
the synthetic pipeline, the substrate, and the docs.

## Architecture

```mermaid
flowchart LR
  subgraph authoring [Write path - fit-map, operator credential]
    TR[teams roster] -->|teams push| TEAMS[(activity.teams + source_refs)]
    SYN[synthetic generator] --> TR
    PR[people roster +team_id] -->|people push| OP[(organization_people)]
    GETDX[GetDX raw docs] -->|transform: resolve via source_refs| SCORES[(getdx scores + comments, team_id)]
    ADP[platform adapters] -->|platform ingest| USAGE[(platform_usage)]
  end
  subgraph read [Read path - fit-landmark, caller JWT]
    ADOPT[fit-landmark adoption] --> USAGE
    ADOPT --> SCORES
    ADOPT -->|correlate on team_id| CORR{{usage x DX}}
  end
  SF[["activity.teams_in_scope() SECURITY DEFINER, owner not under forced RLS"]]
  SF -. RLS scope .-> USAGE
  SF -.-> SCORES
  SF -.-> TEAMS
```

Identity, JWT issuance, and the anon-key read client are unchanged from spec
0840 (`resolveIdentity` -> `createLandmarkClient`). `organization_people` keeps
`manager_email` and its existing person-scoped policy; this design only adds
`team_id` and the team-attributed scope path.

## Components

| Component | Home | Responsibility |
| --- | --- | --- |
| `activity.teams` | new migration | Canonical team identity holding org/department/team rows: `team_id` (vendor-neutral slug PK), `name`, `parent_id`, `manager_email` (FK to `organization_people.email`), `ancestors`, `source_refs` (JSONB `{source: ref}`), `updated_at`. |
| `activity.platforms` | new migration | Registry: `platform_id` PK, `name`, `category`, `outcome_metric`. |
| `activity.platform_usage` | new migration | Facts: PK `(team_id, platform_id, metric_id, period_start)`, `metric_kind`, `value`, `contributor_count`, `period_end`, `vs_prev`, `imported_at`. Typed fields only — no per-engineer column, no opaque `raw`. |
| `activity.teams_in_scope()` | new migration | SECURITY DEFINER, STABLE, `SET search_path=''`, no args, reads `auth.email()` internally: the `team_id`s visible to the caller. Sole scope source for every team-attributed RLS policy. |
| `fit-map teams push` | `products/map/src/commands/teams.js` | Author the registry (incl. parent nodes) from a roster file, maintaining `ancestors`. Operator-only. Idempotent on `team_id`. |
| `fit-map platform ingest` | `products/map/src/commands/platform.js` + `src/platform/adapters/` | Generic collector: resolve adapter by `platform_id`, fetch, map to `team_id`, enforce guardrails, upsert. Ships a reference fixture adapter. |
| GetDX transform (adapted) | `activity/transform/getdx.js` | Resolve GetDX team ids to `team_id` via `source_refs`; write scores against `team_id`; re-root the comment team to the author's `organization_people.team_id` (replacing the `getdx_teams.manager_email` derivation); skip+count unresolved; no longer writes `getdx_teams` or membership. |
| Synthetic pipeline (adapted) | `libsyntheticgen`, `libsyntheticrender` | Generator mints vendor-neutral ids for the whole hierarchy (replacing `gdx_org_`/`gdx_dept_`/`gdx_team_`/`gdx_mgr_`, incl. the scenario-effect team match) and emits the teams roster; renderer and `validate-activity.js` write/assert `team_id`. |
| `people push` (adapted) | `products/map/src/commands/people.js` + people transform | Sole writer of `organization_people.team_id` from the roster (moved off GetDX ingestion). |
| Substrate (adapted) | `activity.js` seed, `substrate-persona-query.js`, `persona-enricher.js`, `substrate roster`/`pick` | Seed gains a teams step ahead of `transformAll`; persona discovery reads `activity.teams` (`team_name` from `teams.name`) and keys peers by `team_id`; `enrichPersonaRow` resolves the DSL team by `team_id` directly. |
| `fit-landmark adoption` | `products/landmark/src/commands/adoption.js` | Render the Team x Platform matrix, XmR trend, and usage x DX correlation under the caller JWT. New empty-state keys for no-usage / unpaired-usage. |

## Key interfaces

**Adapter contract** (pull-only, aggregate-only):

```
PlatformAdapter:
  platform_id():            string          // must match a platforms row
  period_grain():           'day'|'week'|'month'|'quarter'
  async fetch(period):      SourceRecord[]   // adapter owns its source auth
  resolve_team(record):     team_id | null   // via teams.source_refs[platform_id]
  to_rows(record):          { metric_id, metric_kind, value, contributor_count }[]
```

`to_rows` is a closed typed shape with no per-person field, and the cube stores
nothing else — so there is no column an adapter could smuggle identity through.
The collector drops rows with `contributor_count < k` (config, default 5) and
counts-and-skips a `null` team. #829's no-individual-attribution and k-anonymity
constraints hold by construction.

**Scope function** — `activity.teams_in_scope()` returns, for `auth.email()`:
the membership team (`organization_people.team_id`), teams led
(`teams.manager_email = email`), and every team whose `ancestors` contains any
led team. The body schema-qualifies all references (required under the empty
`search_path`). Each team-attributed policy is `team_id IN (SELECT
activity.teams_in_scope())`; `platforms` is readable by all `authenticated`;
`anon` is granted nothing.

**`ancestors`** is a JSONB array of plain ancestor `team_id` slug strings,
root-first and self-exclusive, recomputed by `teams push`. Descendant membership
is the containment test `ancestors ? <led-id>`.

## Key decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Team identity | One vendor-neutral `teams` registry holding the full hierarchy; vendors map in via `source_refs`. | Per-vendor team tables (today's `getdx_teams`) — no shared key, so usage and DX can't correlate. |
| Registry authorship | `fit-map teams push` from an authoritative roster; the synthetic generator emits one too. | Bootstrap from GetDX teams-list — reintroduces a vendor as the implicit team origin. |
| RLS recursion | `teams_in_scope()` SECURITY DEFINER, owned by a role not subject to forced RLS, so it reads `teams`/`organization_people` with RLS bypassed and the self-referential `teams` policy never re-enters. | Inline subqueries — recurse on the self-referential `teams` table; app-side filtering — bypassable. |
| Comment team source | Re-root to the author's `organization_people.team_id` (email → person → team). | `source_refs` resolution — the comment carries no vendor team id; `source_refs` is the score transform's resolver, not the comment's. |
| No per-record passthrough | Cube stores only typed aggregate fields; drop the `raw` column. | Keep `raw` JSONB — an opaque blob with no enforceable per-person detection rule. |
| Subtree expansion | Materialized `ancestors` slug path maintained by `teams push`; containment check. | Recursive CTE per query — re-walks the tree on every read; no path column to keep correct. |
| Usage/Goodhart guardrail | `metric_kind` column; a `(platform_id, metric_id)` has one kind; read renders `usage` only beside an `outcome`. | Convention/docs only — nothing structural stops a usage-only individual scoreboard. |
| k-anonymity | Dropped at ingest (collector), and applied to the GetDX side at correlation display. | Display-time suppression only — the de-anonymizing cell still sits in storage. |
| Clean break | Remove `getdx_teams`/`getdx_team_id`/`gdx_*` everywhere incl. the synthetic pipeline and docs; rewrite base + RLS migrations. | Additive migration keeping the old columns — dual team identity, the gap this spec closes. |

## Data flow

**Ingest.** `teams push` (or the synthetic generator's roster) populates the
registry with each team's `source_refs` and `ancestors`. `people push` sets
membership. GetDX transform maps `getdx team id -> team_id` via `source_refs`,
writes scores against `team_id`, re-roots comment teams to the author's
membership team, skips unresolved. `platform ingest` dispatches to an adapter,
which rolls source records up to `team_id`; the collector applies the guardrails
and upserts on the PK (idempotent).

**Read.** `fit-landmark adoption` queries `platform_usage` (and, for
correlation, `getdx_snapshot_team_scores`) under the caller JWT; RLS clamps both
to `teams_in_scope()`. The matrix suppresses or rolls up sub-threshold cells on
both sides, withholds an unpaired `usage` metric, draws the per-team-per-platform
control chart via `fit-xmr`, and pairs a usage period with the snapshot whose
`scheduled_for` (a single DATE) is the latest at or before the period's end.

## Clean-break removals and rewrites

| Item | Action |
| --- | --- |
| `activity.getdx_teams` | dropped |
| `organization_people.getdx_team_id` | -> `team_id` referencing `teams`; `manager_email` and its policy retained; membership write moves to `people push` |
| `getdx_snapshot_team_scores.getdx_team_id` | -> `team_id`; PK and ingestion upsert key move to `(snapshot_id, team_id, item_id)` |
| `getdx_snapshot_comments.team_id` | FK re-pointed -> `teams`; email-scoped RLS retained; transform re-roots team to author's `organization_people.team_id` |
| `activity.snapshot_ids_for_person` | both join sides re-keyed to `team_id`; stays SECURITY INVOKER, membership-scoped |
| RLS table-name allowlists | REVOKE/GRANT, retention `COMMENT` set, `_validate_retention_blob` (null-window branch grows from `organization_people`-only to a set incl. `teams`/`platforms`), `retention_blob`, and the `DO` block extended; `platform_usage` windowed on `imported_at` |
| `activity.get_team` (management-tree helper) | unchanged; `snapshots.js` re-points only its composition with team identity |
| synthetic pipeline | `libsyntheticgen` mints vendor-neutral ids for all four `gdx_*` prefixes incl. the scenario-effect match and emits the teams roster; `libsyntheticrender` raw + validator assert `team_id` |
| `activity.js` seed pipeline | gains a teams target ahead of `transformAll` (fixed people->getdx order) so the `team_id` FK resolves |
| docs | remove stale `getdx_teams` from `fit-map` skill `cli.md` and the two Map data-source pages |
| `migrations/20250504000001_org_people_getdx_team_id.sql` | removed; folded into base |
| base activity-schema + landmark-RLS migrations | rewritten to the new shape |
| `queries/snapshots.js`, `substrate-persona-query.js`, `persona-enricher.js`, `substrate roster`/`pick`, `landmark/src/commands/sources.js`, `services/map/test/map.test.js` | re-pointed to `teams`/`team_id` |

## Risks

- **SECURITY DEFINER surface.** `teams_in_scope()` takes no caller args, reads
  `auth.email()` internally, is `STABLE SET search_path=''` with all references
  schema-qualified, owned by a role not subject to forced RLS, and grants
  EXECUTE to `authenticated` only with PUBLIC revoked.
- **`ancestors` correctness.** Scope depends on the slug path; `teams push` must
  recompute it on every roster change or a moved team mis-scopes.
- **Correlation bounding.** `scheduled_for` is a single DATE; the cycle is the
  half-open interval up to the next snapshot's `scheduled_for`, so a usage period
  maps to the latest snapshot at or before its end.
- **Roster gaps.** A GetDX team or platform cohort with no matching `source_refs`
  silently drops its rows; transforms and the collector count skips.
