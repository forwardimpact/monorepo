# DRAFT — Platform adoption substrate (vendor-neutral team registry)

> Status: design draft for review. Not a numbered spec yet. No issue opened,
> nothing committed. Supersedes the table design in #829 Slices 2/4 and the
> earlier management-tree-as-team sketch.

## Why

Leadership funding platform and AI-agent enablement needs to see adoption and
impact across teams, and to ask whether adoption *correlates* with developer
experience. That correlation requires platform usage and GetDX scores to share
one team identity. Today they do not: GetDX scores key on `getdx_team_id` and
there is no place for generic platform usage at all.

This design introduces a single vendor-neutral team registry that every source
maps into, an independent platform-usage cube that points at it, and adapts
GetDX ingestion to point at it too. It is an evergreen clean break: the
`getdx_teams` table and the `getdx_team_id` columns are removed, not migrated.
The schema is not in production, so there is no backward compatibility to keep.

## The single team registry

`activity.teams` becomes the canonical, vendor-neutral team identity. Every
team-attributed fact in the schema references it.

```sql
CREATE TABLE activity.teams (
  team_id        TEXT PRIMARY KEY,          -- stable vendor-neutral slug
  name           TEXT NOT NULL,
  parent_id      TEXT REFERENCES activity.teams(team_id),
  manager_email  TEXT REFERENCES activity.organization_people(email),
  ancestors      JSONB,                     -- array of ancestor team_ids; subtree RLS
  source_refs    JSONB,                     -- { "getdx": "...", "claude-code": "...", ... }
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`source_refs` is the correlation key mechanism. Each vendor identifies teams in
its own namespace; an adapter resolves its vendor reference to a canonical
`team_id` by looking it up in `source_refs`. This keeps the registry single and
vendor-neutral while letting any source map in. (Normalized alternative: a
dedicated `activity.team_source_refs(team_id, source, source_ref)` join table.
Recommended only if `source_refs` cardinality grows; JSONB is simpler at this
scale.)

The registry is authored independently of any one vendor, via a new
`fit-map teams push` verb that mirrors `fit-map people push`. No vendor owns the
team list; every vendor maps into it. Team membership for a person lives on
`organization_people.team_id` and is set by `people push`, not by GetDX
ingestion.

## Schema changes (clean break)

Rewrite the base migration set rather than layer new migrations.

- **Remove `activity.getdx_teams`** entirely.
- **Remove `organization_people.getdx_team_id`**; add
  `organization_people.team_id TEXT REFERENCES activity.teams(team_id)`. Folds
  in and replaces `20250504000001_org_people_getdx_team_id.sql`.
- **`getdx_snapshot_team_scores`**: replace `getdx_team_id` with
  `team_id TEXT REFERENCES activity.teams(team_id)`; primary key becomes
  `(snapshot_id, team_id, item_id)`.
- **Add `activity.platforms`** and **`activity.platform_usage`** (below).
- **Rewrite `20260510000000_landmark_rls.sql`**: team-scope policies now read
  the `teams` registry and `team_id`; add policies for `teams`, `platforms`,
  `platform_usage`; extend the retention COMMENT list.

### The platform cube

```sql
CREATE TABLE activity.platforms (
  platform_id    TEXT PRIMARY KEY,   -- 'claude-code', 'github-copilot', 'backstage'
  name           TEXT NOT NULL,
  category       TEXT,               -- 'coding-agent', 'idp', 'ci', 'observability'
  outcome_metric TEXT,               -- the outcome this platform's usage is a denominator for
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity.platform_usage (
  team_id           TEXT NOT NULL REFERENCES activity.teams(team_id),
  platform_id       TEXT NOT NULL REFERENCES activity.platforms(platform_id),
  metric_id         TEXT NOT NULL,
  metric_kind       TEXT NOT NULL,   -- 'usage' | 'outcome'  (Goodhart guardrail)
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  value             NUMERIC,
  contributor_count INT,             -- k-anonymity gate
  vs_prev           NUMERIC,
  raw               JSONB,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, platform_id, metric_id, period_start)
);
```

`metric_kind` and `contributor_count` carry the #829 guarantees structurally:
usage never renders as a headline (only beside an `outcome_metric`), and
sub-threshold cells never reach storage.

## Correlation

Because both cubes key on `team_id`, the correlation Landmark needs is a join:

```sql
SELECT u.team_id, u.platform_id, u.value AS usage,
       s.item_id, s.score AS dx_score
FROM activity.platform_usage u
JOIN activity.getdx_snapshot_team_scores s
  ON s.team_id = u.team_id
 -- aligned on period / snapshot cycle
```

That answers "does this team's platform adoption track its developer experience
scores," which is the whole reason for a single registry.

## RLS

Team-scope, expressed against the `teams` registry, reused for both cubes and
the registry itself.

```sql
CREATE POLICY landmark_select ON activity.platform_usage
  FOR SELECT TO authenticated
  USING (team_id IN (
    SELECT t.team_id FROM activity.teams t
    WHERE t.manager_email = (SELECT auth.email())                       -- teams led
       OR t.ancestors ? (SELECT lt.team_id FROM activity.teams lt       -- descendants
            WHERE lt.manager_email = (SELECT auth.email()))
       OR t.team_id = (SELECT op.team_id FROM activity.organization_people op
            WHERE op.email = (SELECT auth.email()))                     -- own team
  ));
```

The same predicate clamps `getdx_snapshot_team_scores` (now via `team_id`) and
`teams`. `platforms` is a small reference table readable by all `authenticated`.
`anon` gets zero rows everywhere.

## GetDX ingestion adaptation

`products/map/src/activity/transform/getdx.js` changes role:

- `transformTeams` (`:77-130`) no longer writes `getdx_teams` and no longer sets
  `organization_people` membership. It becomes a **resolution** step: for each
  GetDX team in the teams-list document, look up the canonical `team_id` via
  `teams.source_refs->>'getdx'`. Unresolved GetDX teams are counted and skipped,
  never auto-created (the registry is authored by `teams push`).
- Score transform (`:178`, `:196-198`) writes `team_id` (resolved) instead of
  `getdx_team_id`; conflict target becomes `snapshot_id,team_id,item_id`.
- Comment mapping (`:234-238`) builds its `manager_email → team_id` map from
  `teams`, not `getdx_teams`.

Readers to repoint from `getdx_team_id`/`getdx_teams` to `team_id`/`teams`:
`products/map/src/activity/queries/snapshots.js`,
`products/map/src/commands/substrate-persona-query.js:107`,
`products/map/src/commands/substrate-roster.js`,
`products/map/src/lib/persona-enricher.js`.

## Pull ingestion + adapters

Generic collector on the write path (service-role, not reachable from Landmark
reads), dispatching to per-platform adapters:

```
fit-map teams push                                  # author the registry
fit-map platform ingest --platform <id> --period <p>  # pull via adapter
```

Adapter contract (pull-only, aggregate-only):

```
platform_id()        → registry key
period_grain()       → 'day' | 'week' | 'month' | 'quarter'
fetch(period)        → opaque source records (adapter owns source auth)
resolve_team(record) → team_id via teams.source_refs[platform_id]  | null
to_rows(record)      → [{ metric_id, metric_kind, value, contributor_count }]
```

Collector-enforced rules: drop rows with `contributor_count < k` (default 5);
count-and-skip null team resolution; reject any per-person field; upsert on the
primary key (idempotent per period). The Claude Code adapter consumes the OTel
metric stream only — no `OTEL_LOG_*` content gates, no traces — so #829's
content-gate and trace-body constraints hold by construction.

## Read surface

`fit-landmark adoption` renders Team × Platform for a period, suppresses or
rolls up sub-threshold cells, and renders a `usage` metric only beside its
platform's `outcome_metric`. `--platform <id>` draws the per-team XmR series via
the existing Wheeler machinery. A correlation view pairs platform usage with the
team's DX scores on the shared `team_id`.

## Removed / rewritten inventory

| Item | Action |
| --- | --- |
| `activity.getdx_teams` table | removed |
| `organization_people.getdx_team_id` | replaced by `team_id → teams` |
| `getdx_snapshot_team_scores.getdx_team_id` | replaced by `team_id → teams` |
| `migrations/20250504000001_org_people_getdx_team_id.sql` | removed (folded into base) |
| `migrations/20250101000000_activity_schema.sql` | rewritten (teams, platforms, platform_usage; getdx_teams gone) |
| `migrations/20260510000000_landmark_rls.sql` | rewritten (team_id policies + new tables) |
| `transform/getdx.js` `transformTeams` | resolution step, not a writer |
| `queries/snapshots.js`, `substrate-persona-query.js`, `substrate-roster.js`, `persona-enricher.js` | repointed to `teams`/`team_id` |
| Audit: `migrations/20250101000003_getdx_snapshot_comments.sql` | check for `getdx_team` references |

## Open questions for review

1. **Registry authorship.** `fit-map teams push` from an authoritative roster
   (recommended), or bootstrap the registry from GetDX's teams-list on first
   ingest? The former is cleaner and truly vendor-neutral; the latter is less
   work but reintroduces GetDX as the implicit team origin.
2. **`source_refs` JSONB vs a `team_source_refs` join table.** JSONB is simpler;
   the join table is the normalized form if a team carries many source refs.
3. **`k` default.** 5 (matching #829's Copilot threshold), or higher for the
   more granular platform data?
4. **Spec split.** One spec for the whole clean break, or split substrate
   (registry + cubes + RLS + GetDX adaptation) from sources (Claude Code +
   Copilot adapters)?
5. **Umbrella.** Fresh issue, or re-scope #829?
