# Plan: Landmark as Thin Analysis Layer

Landmark is not a survey platform and not a data-ingestion platform.

Landmark is a **thin analysis and presentation layer** on top of Map data.

## Scope (Clean Break)

### Landmark does

1. Query Map for organizational, framework, and measurement data.
2. Compute/format analyst-friendly and manager-friendly views.
3. Present output via CLI/UI.

### Landmark does not

1. Own survey collection.
2. Own a roster store.
3. Own webhook ingestion.
4. Own Edge Functions, migrations, or storage pipelines.

Those responsibilities move to Map.

## Dependencies

Landmark depends on Map data contracts:

- `activity.organization_people` (flat people list)
- derived team hierarchy by manager
- GitHub objective-lens data:
  - `activity.github_events`
  - `activity.github_artifacts`
  - `activity.evidence`
- GetDX imports:
  - `activity.getdx_teams`
  - `activity.getdx_snapshots`
  - `activity.getdx_snapshot_team_scores`

## Architecture

```
GetDX API ──> Map ingestion jobs/functions ──> Map activity tables
                                                  │
                                                  ▼
                                         Landmark analysis layer
                                         (query + aggregate + format)
```

No separate data pipeline in Landmark.

## Analysis Model

### Organization and team slicing

- Organization is a flat list of people.
- Team is a derived query rooted at a manager.
- Landmark accepts manager/team filters and resolves team membership via
  hierarchy expansion.

### Snapshot analytics

Landmark reads snapshot aggregates and provides:

1. **Point-in-time view** for a snapshot and team.
2. **Trend view** across snapshots (`vs_prev` and historical score trajectory).
3. **Comparative view** (`vs_org`, `vs_50th`, `vs_75th`, `vs_90th`).
4. **Driver/factor breakdowns** by `item_type` and `item_name`.

### Marker analytics (objective lens)

Landmark reads GitHub-derived evidence and provides:

1. **Personal evidence view** by skill/marker and recent artifacts.
2. **Team practice patterns** aggregated over manager-derived team scope.
3. **Driver health joins** where marker evidence is compared with GetDX snapshot
   factors.

## CLI Direction (Simplified)

Core commands:

- `fit-landmark org show`
- `fit-landmark org team --manager <github_username>`
- `fit-landmark snapshot list`
- `fit-landmark snapshot show --snapshot <id> [--manager <github_username>]`
- `fit-landmark snapshot trend --item <item_id> [--manager <github_username>]`
- `fit-landmark snapshot compare --snapshot <id> [--manager <github_username>]`
- `fit-landmark evidence [--skill <skill_id>] [--manager <github_username>]`
- `fit-landmark practice [--skill <skill_id>] [--manager <github_username>]`
- `fit-landmark health [--manager <github_username>]`

Removed commands:

- Survey create/distribute/close
- Roster sync
- Any ingestion/replay pipeline controls

## Implementation Phases

1. **Contract alignment**
   - Switch Landmark from `roster` assumptions to `organization_people`.
   - Add manager-rooted team resolution.

2. **Snapshot query layer**
   - Read snapshot + score tables from Map.
   - Implement common filters (`snapshot_id`, manager/team subtree, item type).

3. **Views and formatting**
   - Build concise outputs for trend/comparison/team slices.
   - Build evidence/practice outputs from GitHub marker analysis tables.

4. **Remove legacy concepts**
   - Delete survey orchestration features from Landmark spec and plan.
   - Delete roster ownership assumptions.

## Success Criteria

- Landmark can answer “how is team X trending on DX factors?” using only Map.
- Landmark can answer “what marker evidence do we have for skill X?” using only
  Map.
- No survey submission, distribution, or ingestion logic remains in Landmark.
- No roster concept remains; only organization + derived team hierarchy.
