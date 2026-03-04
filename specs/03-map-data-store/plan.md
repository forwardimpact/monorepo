# Plan: Map as Central Data Store (Simplified)

## Problem

The previous plans modeled developer experience surveys as if we were building
our own survey product. That is not the intent.

We will continue using **GetDX** as the survey platform. Map must ingest **GetDX
snapshot data** (aggregated quarterly survey results) and expose it consistently
to downstream products.

We also over-modeled organization structure. The old **Roster** concept should
be replaced with a simpler **Organization** model.

## Direction

1. **Map is the source of truth** for framework + operational analytics data.
2. **GetDX remains the survey system of record**.
3. **Map stores periodic snapshot imports** from GetDX (`snapshots.list` +
   `snapshots.info`), not per-response survey submissions.
4. **Roster is removed**. Replace with `Organization` = flat list of people.
5. **Team is derived**, not stored as a first-class entity:
   - a team is “everyone in the reporting hierarchy under a manager.”
6. **GitHub activity data remains first-class** for objective marker analysis
   (events → artifacts → evidence), with Map as owner of ingestion/storage.

## External Source Contracts (GetDX)

Map ingestion is based on these GetDX APIs:

- `teams.list` / `teams.info`
- `snapshots.list` / `snapshots.info`

And GitHub webhook/event ingestion for objective engineering signals.

Important semantics we model directly:

- Team hierarchy fields include `id`, `parent_id`, `manager_id`, `ancestors`,
  `reference_id`.
- Snapshot results are **aggregated** (`team_scores`) and include comparative
  metrics (`vs_prev`, `vs_org`, percentile comparisons).
- GetDX already applies contributor privacy thresholds in snapshot outputs.

## Architecture

```
GetDX API (teams + snapshots)
           │
           │ periodic import (future Edge Function / cron)
           ▼
     Map Supabase (single source)
     ├─ framework schema (skills, drivers, etc.)
     └─ activity schema
        ├─ organization_people
        ├─ github_events
        ├─ github_artifacts
        ├─ evidence
        ├─ getdx_teams
        ├─ getdx_snapshots
        └─ getdx_snapshot_team_scores
           │
           ├─ Guide / other products (analysis)
           └─ Landmark (thin analysis UI/CLI)
```

No custom survey collection flow in our stack.

## Data Model Changes

### 1) Replace `Roster` with `Organization`

**Old (remove):** `activity.roster`

**New:** `activity.organization_people`

```sql
CREATE TABLE activity.organization_people (
  github_username         TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  manager_github_username TEXT REFERENCES activity.organization_people(github_username),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Required person fields:

- `name`
- `email`
- `github_username`
- `manager`

Mapping note: `manager` in spec/yaml maps to `manager_github_username` in SQL.

### 2) Team as derived hierarchy

Team is not a stored table. Team is derived by querying the org tree rooted at a
manager.

Example derived-team query pattern (recursive CTE):

```sql
WITH RECURSIVE team AS (
  SELECT github_username
  FROM activity.organization_people
  WHERE github_username = :manager
  UNION ALL
  SELECT p.github_username
  FROM activity.organization_people p
  JOIN team t ON p.manager_github_username = t.github_username
)
SELECT github_username FROM team;
```

### 3) Store GetDX snapshots (aggregated)

```sql
CREATE TABLE activity.getdx_snapshots (
  snapshot_id             TEXT PRIMARY KEY,
  account_id              TEXT,
  scheduled_for           DATE,
  completed_at            TIMESTAMPTZ,
  completed_count         INT,
  total_count             INT,
  last_result_change_at   TIMESTAMPTZ,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw                     JSONB NOT NULL
);

CREATE TABLE activity.getdx_teams (
  getdx_team_id           TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  parent_id               TEXT,
  manager_id              TEXT,
  reference_id            TEXT,
  ancestors               JSONB,
  contributors            INT,
  last_changed_at         TIMESTAMPTZ,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity.getdx_snapshot_team_scores (
  id                      BIGSERIAL PRIMARY KEY,
  snapshot_id             TEXT NOT NULL REFERENCES activity.getdx_snapshots(snapshot_id),
  getdx_team_id           TEXT,
  item_id                 TEXT NOT NULL,
  item_type               TEXT,
  item_name               TEXT,
  response_count          INT,
  contributor_count       INT,
  score                   NUMERIC,
  vs_prev                 NUMERIC,
  vs_org                  NUMERIC,
  vs_50th                 NUMERIC,
  vs_75th                 NUMERIC,
  vs_90th                 NUMERIC,
  snapshot_team           JSONB,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4) Retain GitHub activity + evidence model

```sql
CREATE TABLE activity.github_events (
  delivery_id              TEXT PRIMARY KEY,
  event_type               TEXT NOT NULL,
  action                   TEXT,
  repository               TEXT NOT NULL,
  sender_github_username   TEXT,
  occurred_at              TIMESTAMPTZ,
  raw                      JSONB NOT NULL,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity.github_artifacts (
  artifact_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type            TEXT NOT NULL,
  external_id              TEXT NOT NULL UNIQUE,
  repository               TEXT NOT NULL,
  github_username          TEXT,
  occurred_at              TIMESTAMPTZ,
  metadata                 JSONB NOT NULL,
  raw                      JSONB,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity.evidence (
  evidence_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id              UUID NOT NULL REFERENCES activity.github_artifacts(artifact_id),
  skill_id                 TEXT NOT NULL,
  level_id                 TEXT,
  marker_text              TEXT NOT NULL,
  matched                  BOOLEAN NOT NULL,
  rationale                TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This preserves the objective lens Landmark needs for skill-marker analysis while
keeping data ownership in Map.

## Ingestion Model

### Current

- Manual/CLI-triggered import jobs in Map.

### Future

- Add Map Edge Function or scheduled job to periodically:
  1. call `snapshots.list`
  2. diff known snapshots
  3. call `snapshots.info` for new/changed snapshots
  4. upsert snapshot and team score rows
  5. refresh GetDX team catalog via `teams.list`

- Add/retain Map webhook ingestion for GitHub activity:
  1. receive webhook events
  2. upsert `github_events`
  3. extract normalized `github_artifacts`
  4. run marker interpretation into `evidence`

This keeps the implementation simple and aligned with the stated future plan.

## Product Impact

### Map

- Owns ingestion and storage of GetDX snapshot aggregates.
- Owns ingestion and storage of GitHub activity/evidence aggregates.
- Owns `Organization` people model.
- Exposes derived-team queries and aggregate views.

### Landmark

- Does **not** collect surveys.
- Reads Map data (GetDX + GitHub evidence) and performs thin
  analysis/presentation only.

### Guide / Others

- Consume the same Map snapshots + organization hierarchy without direct GetDX
  coupling.

## Implementation Phases

1. **Schema clean break**
   - Remove `roster` usage from specs.
   - Add `organization_people` and GetDX snapshot tables.

2. **Ingestion MVP**
   - Implement Map import command for GetDX snapshots/teams.
   - Upsert raw + normalized fields.

3. **GitHub objective lens**

- Keep/implement GitHub event ingestion in Map.
- Keep/implement artifact extraction + evidence tables.

4. **Derived team queries**
   - Provide standard recursive hierarchy query patterns.

5. **Consumer alignment**
   - Update Landmark and other specs to analysis-only interaction with Map.

## Summary

- Keep GetDX for surveys.
- Ingest quarterly aggregated snapshot data into Map.
- Keep GitHub activity/evidence pipeline in Map for skill-marker analysis.
- Rename and simplify `Roster` → `Organization` (flat people list).
- Define team via manager-rooted hierarchy (derived, not separately stored).
- Keep Landmark as a thin analysis layer on top of Map.
