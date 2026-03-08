# Plan: Map as Data Product

How to implement Map as the data product described in `spec.md`.

## Directory Structure

New files live under `activity/` in the Map product. The pure layer (`src/`,
`schema/`, `examples/`) is unchanged.

```
products/map/
  src/                          # Pure layer (unchanged, published to npm)
  schema/                       # JSON Schema + SHACL (unchanged, published)
  examples/                     # YAML data (unchanged, published)
  activity/                     # Operational layer (not published to npm)
    migrations/
      001_activity_schema.sql   # All activity tables
    ingestion/
      getdx.js                  # GetDX snapshot importer
      github.js                 # GitHub webhook receiver + artifact extraction
      people.js                 # Organization people import from CSV/YAML
    queries/
      org.js                    # Organization and team queries
      snapshots.js              # Snapshot score queries
      evidence.js               # Evidence queries
      artifacts.js              # GitHub artifact queries
  bin/fit-map.js                # CLI routes to both layers
```

`activity/` imports from `src/` (e.g., loading framework data to validate
`discipline`/`level`/`track` during people import). `src/` never imports from
`activity/`.

## Database Schema

### Activity schema tables

All operational data lives in the `activity` schema on Supabase.

#### organization_people

```sql
CREATE TABLE activity.organization_people (
  email                   TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  github_username         TEXT UNIQUE,
  discipline              TEXT NOT NULL,
  level                   TEXT NOT NULL,
  track                   TEXT,
  manager_email           TEXT REFERENCES activity.organization_people(email),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### GetDX snapshot tables

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
  manager_email           TEXT REFERENCES activity.organization_people(email),
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

`manager_email` on `getdx_teams` bridges GetDX teams to the internal org
hierarchy. Populated during import by matching GetDX `manager_id` →
`reference_id` → `email`.

#### GitHub activity tables

```sql
CREATE TABLE activity.github_events (
  delivery_id             TEXT PRIMARY KEY,
  event_type              TEXT NOT NULL,
  action                  TEXT,
  repository              TEXT NOT NULL,
  sender_github_username  TEXT,
  occurred_at             TIMESTAMPTZ,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity.github_artifacts (
  artifact_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type           TEXT NOT NULL,
  external_id             TEXT NOT NULL UNIQUE,
  repository              TEXT NOT NULL,
  github_username         TEXT,
  email                   TEXT REFERENCES activity.organization_people(email),
  occurred_at             TIMESTAMPTZ,
  metadata                JSONB NOT NULL,
  raw                     JSONB,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`email` on `github_artifacts` links to the unified person model. Populated
during extraction by joining `github_username` → `organization_people`.

#### Evidence table

```sql
CREATE TABLE activity.evidence (
  evidence_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id             UUID NOT NULL REFERENCES activity.github_artifacts(artifact_id),
  skill_id                TEXT NOT NULL,
  level_id                TEXT,
  marker_text             TEXT NOT NULL,
  matched                 BOOLEAN NOT NULL,
  rationale               TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Guide writes evidence rows. Map stores them. Landmark reads them.

### Derived team query

Team membership is resolved by walking `manager_email` references:

```sql
WITH RECURSIVE team AS (
  SELECT email, name, discipline, level, track
  FROM activity.organization_people
  WHERE email = :manager_email
  UNION ALL
  SELECT p.email, p.name, p.discipline, p.level, p.track
  FROM activity.organization_people p
  JOIN team t ON p.manager_email = t.email
)
SELECT * FROM team;
```

## Marker Definitions in Capability YAML

Markers are co-located with skill definitions in Map capability files:

```yaml
skills:
  - id: system_design
    name: System Design
    human:
      description: ...
      levelDescriptions:
        working: You design systems independently
    agent:
      name: system-design
      description: ...
    markers:
      working:
        human:
          - Authored a design doc accepted without requiring senior rewrite
          - Led a technical discussion that resolved a design disagreement
        agent:
          - Produced a design doc that passes review without structural rework
          - Decomposed a feature into components with clear interface boundaries
```

`fit-map validate` validates marker structure and references.

## Ingestion

All ingestion code lives in `activity/ingestion/`. Each module imports from
`src/` for framework validation but has no coupling to the pure layer's public
API.

### GetDX snapshot import

`activity/ingestion/getdx.js` — CLI or scheduled job:

1. Calls `snapshots.list` and diffs against known snapshots.
2. Calls `snapshots.info` for new or changed snapshots.
3. Upserts snapshot and team score rows.
4. Refreshes GetDX team catalog via `teams.list`.
5. Populates `manager_email` on `getdx_teams` by matching `manager_id` →
   `reference_id` → `email`.

### GitHub activity ingestion

`activity/ingestion/github.js` — webhook receiver:

1. Receives GitHub webhook events.
2. Upserts `github_events`.
3. Extracts normalized `github_artifacts` and links `email` via
   `github_username`.

Guide handles the next step: interpreting unscored artifacts into evidence.

### Evidence pipeline

```
GitHub Events → Map (github_events → github_artifacts)
                                        │
                                 Guide (interprets against markers)
                                        │
                                 activity.evidence
```

Guide reads artifacts without evidence rows, assesses each against skill markers
from capability YAML, and writes back:

- `skill_id` and `level_id` — which marker was evaluated
- `marker_text` — the specific marker text
- `matched` — whether the artifact demonstrates the marker
- `rationale` — Guide's reasoning (visible to the engineer)

Guide runs on-demand or as a scheduled batch job.

## Implementation Phases

### Phase 0: Marker schema (precondition)

Guide and Landmark both depend on markers existing in capability YAML. The
schema must support markers before any activity data references them.

Add `markers` to the `skill` definition in both schema formats (same commit):

**JSON Schema** (`schema/json/capability.schema.json`) — add to `#/$defs/skill`:

```json
"markers": {
  "type": "object",
  "description": "Observable indicators of skill proficiency, keyed by level",
  "propertyNames": {
    "enum": ["awareness", "foundational", "working", "practitioner", "expert"]
  },
  "additionalProperties": {
    "type": "object",
    "properties": {
      "human": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Observable markers for human engineers"
      },
      "agent": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Observable markers for AI agents"
      }
    },
    "additionalProperties": false
  }
}
```

**SHACL** (`schema/rdf/capability.ttl`) — add class, properties, and shape:

```turtle
fit:SkillMarkers a rdfs:Class ;
    rdfs:label "Skill Markers"@en ;
    rdfs:comment "Observable indicators of skill proficiency at a level"@en .

fit:markers a rdf:Property ;
    rdfs:label "markers"@en ;
    rdfs:comment "Observable indicators keyed by proficiency level"@en ;
    rdfs:domain fit:Skill ;
    rdfs:range fit:SkillMarkers .

fit:humanMarkers a rdf:Property ;
    rdfs:label "humanMarkers"@en ;
    rdfs:comment "Observable markers for human engineers"@en ;
    rdfs:domain fit:SkillMarkers ;
    rdfs:range xsd:string .

fit:agentMarkers a rdf:Property ;
    rdfs:label "agentMarkers"@en ;
    rdfs:comment "Observable markers for AI agents"@en ;
    rdfs:domain fit:SkillMarkers ;
    rdfs:range xsd:string .
```

Add `fit:markers` property to `SkillShape` and a new `SkillMarkersShape`.

Update `fit-map validate` to check marker structure and level references.

### Phase 1: Activity directory and schema

- Create `activity/` directory structure under `products/map/`.
- Verify `activity/` is excluded from npm publish (not in `package.json`
  `"files"`).
- Create Supabase migration (`activity/migrations/001_activity_schema.sql`) with
  all activity tables.
- Add `organization_people` with email PK and job profile fields.
- Add GetDX snapshot tables with `manager_email` join column.
- Add GitHub activity and evidence tables.

### Phase 2: Organization management

- Implement `activity/ingestion/people.js` for importing people from CSV/YAML.
- Import from `src/` to validate `discipline`, `level`, `track` against
  framework data.
- Add `fit-map people import` CLI command.

### Phase 3: GetDX ingestion

- Implement `activity/ingestion/getdx.js` for GetDX snapshots and teams.
- Upsert raw + normalized fields.
- Populate `manager_email` bridge on `getdx_teams`.

### Phase 4: GitHub ingestion

- Implement `activity/ingestion/github.js` for webhook events.
- Implement artifact extraction with `email` join.

### Phase 5: Query layer and consumer readiness

- Implement `activity/queries/` modules (org, snapshots, evidence, artifacts).
- Export query functions for Landmark and Guide to import as workspace
  dependencies (`@forwardimpact/map/activity/queries`).
- Ensure all downstream products can query the data product through its
  documented contracts.
