# Map as Data Product

Map is the data product that serves framework definitions and operational
analytics to every product in the Forward Impact suite. It owns domain data,
publishes stable contracts, and enforces schema quality — consumers depend on
contracts, not implementation details.

```
@forwardimpact/map    CLI: fit-map
```

## Why

Every product in the suite needs the same foundational data: who works here,
what skills matter, how the team is structured, and what the signals say.
Without a data product, each consumer builds its own ingestion, its own schema,
and its own validation — then they drift apart. Map eliminates that duplication
by giving every downstream product a single source of truth with a stable
contract to depend on.

As a data product, Map separates three concerns that are often conflated:

- **Storage** — Map owns data ingestion, schema, and persistence.
- **Interpretation** — Guide reads artifacts from Map, assesses them against
  markers, and writes evidence back. Map stores but does not interpret.
- **Presentation** — Landmark and other products read Map data and format views.
  Map serves but does not present.

## Internal Layering

The data product serves two audiences with different needs: npm consumers that
import the pure data model, and operational products that query live data. These
live in the same product but are separated by a one-way dependency boundary.

```
products/map/
  src/              Pure data model (published to npm)
  schema/           JSON Schema + RDF/SHACL (published to npm)
  examples/         Example YAML data (published to npm)
  activity/         Operational layer (NOT published to npm)
    migrations/     SQL schema definitions
    ingestion/      GetDX snapshot importer, GitHub webhook receiver
    queries/        Reusable query functions (org, snapshots, evidence)
  bin/fit-map.js    CLI entry point (routes to both layers)
```

**Pure layer** (`src/`, `schema/`, `examples/`) — Framework schema, validation,
data loading. Zero infrastructure dependencies. Published to npm via the
existing `"files"` field in `package.json`.

**Activity layer** (`activity/`) — Supabase migrations, ingestion pipelines,
query functions. Requires runtime infrastructure. Excluded from npm publish
automatically (not listed in `"files"`).

**Layering rule:** `activity/` may import from `src/` (e.g., to validate
`discipline` values against framework data during people import). `src/` must
never import from `activity/`. The npm-published surface has zero operational
dependencies.

**Join convention:** Framework entity IDs (`discipline`, `level`, `track`,
`skill_id`, `level_id`, `driver.id`) are stable identifiers that serve as
natural join keys between the activity layer and the pure layer. Activity tables
store these IDs as bare strings; consumers join them to framework objects in
application code by loading the YAML data and matching on `id`. No mapping
tables or explicit foreign-key relationships bridge the two layers — the shared
ID namespace is the contract.

## What

### Framework schema

Map publishes the career framework: skills, capabilities, behaviours,
disciplines, tracks, levels, stages, and drivers. These are defined in YAML
files, validated by JSON Schema and SHACL, and consumed by libskill for
derivation and by Pathway for presentation.

### Unified person model

A single `organization_people` table serves the entire product suite. Every
product that reasons about people, teams, or job profiles consumes this table.

| Field             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `email` (PK)      | Cross-system join key (HR, GetDX, GitHub, internal) |
| `name`            | Display name                                        |
| `github_username` | Links to GitHub activity (optional)                 |
| `discipline`      | From Map disciplines (e.g. `se`, `em`)              |
| `level`           | From Map levels (e.g. `L3`, `L4`)                   |
| `track`           | From Map tracks (e.g. `platform`) (optional)        |
| `manager_email`   | References another person — defines hierarchy       |

Email is the join key because it spans HR systems, GetDX, GitHub (via commit
author), and internal tooling. The `discipline`, `level`, and `track` fields
carry the Pathway job profile, so any product can call
`deriveJob(discipline, level, track, data)` from libskill to get the full skill
matrix for a person.

### Team as derived hierarchy

Team is not a stored entity. A team is everyone in the reporting hierarchy under
a given manager, resolved by walking `manager_email` references. This avoids
maintaining a separate team structure that drifts from the actual org tree.

### GetDX snapshot storage

GetDX is the external survey platform. Map stores periodic snapshot imports
(aggregated quarterly survey results) — not individual survey responses.

Three tables capture the GetDX data:

- **Snapshots** — metadata for each quarterly survey cycle.
- **Teams** — GetDX team hierarchy with `manager_email` bridging to the internal
  org model.
- **Team scores** — aggregated factor/driver scores with comparative metrics
  (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`).

### GitHub activity storage

Map ingests GitHub webhook events, stores raw events, and extracts normalized
artifacts (PRs, reviews, commits). Each artifact is linked to the unified person
model via `github_username` → `email`.

### Evidence storage

Guide writes evidence rows back to Map after interpreting GitHub artifacts
against skill markers. Each evidence row records the source artifact, skill,
proficiency level, marker text, match result, and Guide's rationale. Evidence
links to `github_artifacts` via `artifact_id`, so consumers can navigate from
evidence to the source PR, review, or commit. Person filtering follows the
chain: evidence → artifact → person (via `email` on `github_artifacts`).
Landmark reads these for presentation.

### Marker definitions

Markers are concrete, observable indicators of a skill at a proficiency level.
They live in Map's capability YAML files alongside skill definitions:

```yaml
skills:
  - id: system_design
    markers:
      working:
        human:
          - Authored a design doc accepted without requiring senior rewrite
        agent:
          - Produced a design doc that passes review without structural rework
```

Markers are installation-specific — the same skill at the same level may have
different markers in different organizations. Map validates marker definitions
during `fit-map validate`. Guide reads them for interpretation. Landmark reads
them for labeling evidence.

## Data Contracts

Map's data product contract defines the schemas, tables, and external interfaces
that consumers can depend on. Changes to these contracts follow semver —
breaking changes require a major version bump.

### Activity schema

```sql
activity.organization_people    -- unified person model (email PK)
activity.github_events          -- raw webhook events
activity.github_artifacts       -- normalized artifacts (email join to person)
activity.evidence               -- Guide-written skill evidence (artifact_id join)
activity.getdx_snapshots        -- quarterly snapshot metadata
activity.getdx_teams            -- GetDX team hierarchy (manager_email join)
activity.getdx_snapshot_team_scores  -- aggregated scores per team per snapshot
```

### Query functions

Map's `activity/queries/` modules expose reusable query functions that form part
of the data contract. Consumers import these rather than querying Supabase
directly.

| Module         | Function                                              | Purpose                                                 |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `org.js`       | `getOrganization()`                                   | All people from `organization_people`                   |
| `org.js`       | `getTeam(managerEmail)`                               | Recursive walk of `manager_email` hierarchy             |
| `snapshots.js` | `listSnapshots()`                                     | All snapshots ordered by `scheduled_for`                |
| `snapshots.js` | `getSnapshotScores(snapshotId, { managerEmail })`     | Team scores, optionally filtered by manager's team      |
| `snapshots.js` | `getItemTrend(itemId, { managerEmail })`              | Score trajectory across snapshots                       |
| `snapshots.js` | `getSnapshotComparison(snapshotId, { managerEmail })` | Scores with comparative metrics                         |
| `evidence.js`  | `getEvidence({ skillId, email })`                     | Evidence rows, optionally filtered by skill or person   |
| `evidence.js`  | `getPracticePatterns({ skillId, managerEmail })`      | Aggregated evidence across a manager's team             |
| `artifacts.js` | `getArtifacts({ email, type })`                       | GitHub artifacts, optionally filtered by person or type |

Team queries use a recursive CTE on `manager_email` to resolve full subtrees.
Evidence queries join through `artifact_id` → `github_artifacts.email` for
person-scoped filtering.

### Drivers and GetDX alignment

Framework drivers are the GetDX drivers. The driver `id` in `drivers.yaml`
matches the `item_id` in `getdx_snapshot_team_scores` — no separate mapping is
needed. When GetDX publishes a new survey factor, it becomes a new driver in the
framework data.

Each driver also declares `contributingSkills` and `contributingBehaviours`,
which link the survey-measured outcome back to the framework's skill and
behaviour definitions. This is what makes the health view possible: Landmark can
juxtapose a driver's GetDX score with marker evidence for its contributing
skills, using the same driver `id` as the join key across both datasets.

```yaml
# drivers.yaml
- id: code_review
  name: Code Review
  description: Timeliness and quality of feedback during code review
  contributingSkills:
    - code_quality
    - team_collaboration
  contributingBehaviours:
    - precise_communication
    - relentless_curiosity
```

Map validates that `contributingSkills` and `contributingBehaviours` reference
valid skill and behaviour IDs.

### External source contracts

Map ingestion depends on these GetDX APIs:

- `teams.list` / `teams.info`
- `snapshots.list` / `snapshots.info`

And GitHub webhook events for activity ingestion.

### Access control

The activity schema holds PII (names, emails, manager relationships) and
performance-related data (evidence, scores). Row-level security and access
control policies are not implemented in this initial version. The schema is
accessible to all authenticated consumers within the product suite.

Access control is a standard data product concern and will be designed and
implemented in a later phase, after the data model and consumer patterns have
stabilized.

## Consumers

The data product serves five consumers through two interfaces:

| Product      | Layer    | Consumes                                               |
| ------------ | -------- | ------------------------------------------------------ |
| **Landmark** | Activity | Snapshots, evidence, organization, markers             |
| **Guide**    | Activity | Artifacts (reads), evidence (writes), markers (reads)  |
| **Pathway**  | Pure     | Framework schema (skills, disciplines, levels, tracks) |
| **Basecamp** | Pure     | Framework schema                                       |
| **libskill** | Pure     | Framework schema for derivation                        |

Pure-layer consumers install `@forwardimpact/map` from npm. Activity-layer
consumers import from `@forwardimpact/map/activity/queries` as a workspace
dependency — these imports are never published.

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │  @forwardimpact/map                         │
                     │                                             │
  npm consumers ────>│  src/      Pure data model                  │
  (Pathway,          │  schema/   JSON Schema + SHACL              │
   Basecamp,         │  examples/ YAML entity definitions          │
   libskill)         │─────────────────────────────────────────────│
                     │  activity/ Operational layer                │
  Supabase ─────────>│    migrations/   SQL schema                 │
  GetDX API ────────>│    ingestion/    Import pipelines           │
  GitHub webhooks ──>│    queries/      Reusable query functions   │
                     └──────────────────────┬──────────────────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          │                 │                 │
                       Guide            Landmark         other products
                    (interprets)       (presents)
                          │
                   activity.evidence
```
