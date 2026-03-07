# Plan: Landmark

How to implement the Landmark product described in `spec.md`.

## Product Scaffolding

Create `products/landmark/` with standard monorepo structure:

```
products/landmark/
  package.json          # @forwardimpact/landmark
  bin/fit-landmark.js   # CLI entry point
  src/
    index.js            # Public API
    org.js              # Organization and team logic
    snapshot.js         # Snapshot analytics logic
    evidence.js         # Evidence and marker logic
    formatters/
      org.js            # Organization view formatting
      snapshot.js       # Snapshot view formatting
      evidence.js       # Evidence view formatting
    commands/
      org.js            # org show, org team
      snapshot.js       # snapshot list, show, trend, compare
      evidence.js       # evidence, practice, marker, health
```

Dependencies:

- `@forwardimpact/map` — framework data, marker definitions (pure layer)
- `@forwardimpact/map/activity/queries` — operational queries (workspace only)
- `@forwardimpact/libskill` — job derivation from discipline/level/track

Landmark does not depend on `@supabase/supabase-js` directly. All database
access goes through Map's activity query layer, keeping Supabase as Map's
private implementation detail.

## Query Layer

Landmark delegates all database access to Map's `activity/queries/` modules.
Landmark's `src/` files compose these queries with formatting logic but do not
access Supabase directly.

### Organization queries

From `@forwardimpact/map/activity/queries`:

- `getOrganization()` — all people from `organization_people`.
- `getTeam(managerEmail)` — recursive CTE walking `manager_email` to return
  everyone under a manager.

### Snapshot queries

From `@forwardimpact/map/activity/queries`:

- `listSnapshots()` — all snapshots ordered by `scheduled_for`.
- `getSnapshotScores(snapshotId, { managerEmail })` — team scores for a
  snapshot, optionally filtered by manager's team via
  `getdx_teams.manager_email`.
- `getItemTrend(itemId, { managerEmail })` — score trajectory for an item across
  snapshots.
- `getSnapshotComparison(snapshotId, { managerEmail })` — scores with
  comparative metrics (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`).

### Evidence queries

From `@forwardimpact/map/activity/queries`:

- `getEvidence({ skillId, email })` — evidence rows, optionally filtered by
  skill or person.
- `getPracticePatterns({ skillId, managerEmail })` — aggregated evidence across
  a manager's team.
- `getMarkers(skillId, levelId)` — marker definitions from Map capability YAML.
- `getHealth({ managerEmail })` — joined view of marker evidence and snapshot
  scores. Joins on driver `id` (which matches `item_id` in snapshot scores) and
  uses `contributingSkills` to link each driver to its marker evidence.

All queries join through the unified person model (email PK) and use the derived
team hierarchy for manager-scoped filtering. Evidence queries join through
`artifact_id` → `github_artifacts.email` for person-scoped filtering.

## Formatting Layer

Formatters produce both terminal (CLI) and DOM (web) output:

### Organization formatters

- Directory table: name, discipline, level, track, manager.
- Team tree: hierarchical view under a manager.

### Snapshot formatters

- Score table: item name, score, response count, comparative metrics.
- Trend chart: item scores across snapshots (terminal sparkline or web chart).
- Comparison table: score vs org, vs percentiles.

### Evidence formatters

- Evidence list: artifact, skill, marker, matched, Guide's rationale.
- Personal evidence: grouped by skill, showing markers expected for the person's
  role (derived from discipline/level/track via libskill).
- Practice summary: marker coverage across a team.
- Health view: marker evidence alongside snapshot factor scores.

## CLI Commands

Each command maps to a query + formatter:

| Command              | Query                     | Formatter          |
| -------------------- | ------------------------- | ------------------ |
| `org show`           | `getOrganization()`       | Directory table    |
| `org team --manager` | `getTeam(email)`          | Team tree          |
| `snapshot list`      | `listSnapshots()`         | Snapshot list      |
| `snapshot show`      | `getSnapshotScores()`     | Score table        |
| `snapshot trend`     | `getItemTrend()`          | Trend chart        |
| `snapshot compare`   | `getSnapshotComparison()` | Comparison table   |
| `evidence`           | `getEvidence()`           | Evidence list      |
| `practice`           | `getPracticePatterns()`   | Practice summary   |
| `marker`             | `getMarkers()`            | Marker definitions |
| `health`             | `getHealth()`             | Health view        |

Commands pass raw data to formatters — no transforms in commands.

## Implementation Phases

### Phase 1: Scaffolding and organization

- Create product directory structure and `package.json`.
- Add workspace dependency on `@forwardimpact/map` (both layers).
- Implement `org.js` using Map's activity query modules.
- Implement `org show` and `org team` CLI commands.

### Phase 2: Snapshot analytics

- Implement `snapshot.js` composing Map's snapshot queries with formatters.
- Implement snapshot formatters (score table, trend, comparison).
- Implement `snapshot list`, `show`, `trend`, `compare` CLI commands.

### Phase 3: Evidence and markers

- Implement `evidence.js` composing Map's evidence queries with formatters.
- Implement evidence formatters (evidence list, personal, practice, health).
- Implement `evidence`, `practice`, `marker`, `health` CLI commands.

### Phase 4: Job profile integration

- Use libskill to derive expected skill profiles from person's
  `discipline`/`level`/`track`.
- Show personal evidence against expected markers for the derived role.

### Phase 5: Web UI

- Add web views for organization, snapshot, and evidence analysis.
- Reuse formatters (DOM output variants) from the CLI layer.
