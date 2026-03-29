---
title: Map Internals
description: "Data product architecture — internal layering, activity model, ingestion surfaces, query functions, and programmatic access."
---

## Internal Layering

```
products/map/
  src/              Pure data model (published to npm)
    loader.js       YAML file loading and parsing
    validation.js   Referential integrity and data validation
    schema-validation.js  JSON Schema validation
    levels.js       Type definitions, skill proficiencies, behaviour maturities
    modifiers.js    Capability and skill modifier utilities
    index-generator.js  Browser index generation
    index.js        Public API exports
  schema/           JSON Schema + RDF/SHACL (published to npm)
    json/           JSON Schema definitions
    rdf/            RDF/SHACL definitions
  activity/         Operational layer (NOT published to npm)
    migrations/     SQL schema definitions
    extract/        Data extraction utilities
    transform/      Data transformation utilities
    storage.js      Storage interface
    queries/        Reusable query functions
      org.js        Organization and team queries
      snapshots.js  GetDX snapshot queries
      evidence.js   Evidence queries
      artifacts.js  GitHub artifact queries
  bin/fit-map.js    CLI entry point (routes to both layers)
```

**Pure layer** (`src/`, `schema/`) -- Framework schema, validation, data
loading. Zero infrastructure dependencies. Published to npm.

**Activity layer** (`activity/`) -- Supabase migrations, ingestion pipelines,
query functions. Requires runtime infrastructure. Excluded from npm publish.

**Layering rule:** `activity/` may import from `src/` (e.g., to validate
`discipline` values during people import). `src/` must never import from
`activity/`.

**Join convention:** Framework entity IDs (`discipline`, `level`, `track`,
`skill_id`, `level_id`, `driver.id`) serve as natural join keys between the
activity layer and the pure layer. Activity tables store these IDs as bare
strings; consumers join them to framework objects in application code. No
mapping tables bridge the two layers -- the shared ID namespace is the contract.

---

## Activity Model

Core data product contracts:

| Table                        | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `organization_people`        | Unified person model (email PK)                 |
| `github_events`              | Raw GitHub webhook events                       |
| `github_artifacts`           | Normalized artifacts (email join to person)     |
| `evidence`                   | Guide-written skill evidence (artifact_id join) |
| `getdx_snapshots`            | Quarterly snapshot metadata                     |
| `getdx_teams`                | GetDX team hierarchy (manager_email join)       |
| `getdx_snapshot_team_scores` | Aggregated scores per team per snapshot         |

Team scope is derived from the manager hierarchy -- not stored as a separate
entity.

### Unified Person Model

`organization_people` uses email as the cross-system join key spanning HR,
GetDX, GitHub (via commit author), and internal tooling. The `discipline`,
`level`, and `track` fields carry the Pathway job profile, so any consumer can
call `deriveJob(discipline, level, track, data)` from libskill to get the full
skill matrix for a person.

---

## Ingestion Surfaces

### GetDX Snapshots

Map imports GetDX snapshots via the `snapshots.list` and `snapshots.info` APIs.
The ingestion pipeline diffs against known snapshots, imports new or changed
ones, and upserts team scores. GetDX teams are bridged to the internal org model
via `manager_email`.

Three tables capture the data:

- **`getdx_snapshots`** -- metadata for each quarterly survey cycle.
- **`getdx_teams`** -- GetDX team hierarchy with `manager_email` bridge.
- **`getdx_snapshot_team_scores`** -- aggregated factor/driver scores with
  comparative metrics (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`).

### GitHub Webhooks

Map receives GitHub webhook events (`pull_request`, `pull_request_review`,
`push`), stores raw events in `github_events`, and extracts normalized artifacts
(PRs, reviews, commits) into `github_artifacts`. Each artifact is linked to the
unified person model via `github_username` to `email`.

### Evidence Pipeline

```
GitHub Events -> Map (github_events -> github_artifacts)
                                        |
                                 Guide (interprets against markers)
                                        |
                                 activity.evidence
```

Guide reads artifacts without evidence rows, assesses each against skill markers
from capability YAML, and writes evidence back with `skill_id`, `level_id`,
`marker_text`, `matched`, and `rationale`. Landmark reads evidence for
presentation.

---

## Query Functions

Map's `activity/queries/` modules expose reusable query functions that form part
of the data product contract. Consumers import these rather than querying
Supabase directly.

| Module         | Function                                              | Purpose                                            |
| -------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `org.js`       | `getOrganization()`                                   | All people from `organization_people`              |
| `org.js`       | `getTeam(managerEmail)`                               | Recursive walk of `manager_email` hierarchy        |
| `snapshots.js` | `listSnapshots()`                                     | All snapshots ordered by `scheduled_for`           |
| `snapshots.js` | `getSnapshotScores(snapshotId, { managerEmail })`     | Team scores, optionally filtered by manager's team |
| `snapshots.js` | `getItemTrend(itemId, { managerEmail })`              | Score trajectory across snapshots                  |
| `snapshots.js` | `getSnapshotComparison(snapshotId, { managerEmail })` | Scores with comparative metrics                    |
| `evidence.js`  | `getEvidence({ skillId, email })`                     | Evidence rows, filtered by skill or person         |
| `evidence.js`  | `getPracticePatterns({ skillId, managerEmail })`      | Aggregated evidence across a manager's team        |
| `artifacts.js` | `getArtifacts({ email, type })`                       | GitHub artifacts, filtered by person or type       |

---

## Drivers and GetDX Alignment

Framework drivers are the GetDX drivers. The driver `id` in `drivers.yaml`
matches the `item_id` in `getdx_snapshot_team_scores` -- no separate mapping is
needed. Each driver declares `contributingSkills` and `contributingBehaviours`,
linking the survey-measured outcome back to framework definitions. This is what
makes the health view possible: Landmark juxtaposes a driver's GetDX score with
marker evidence for its contributing skills.

---

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
dependency -- these imports are never published.

---

## Programmatic Access

```javascript
// Pure layer imports
import { loadAllData } from "@forwardimpact/map";
import { validateAll } from "@forwardimpact/map/validation";
import { SKILL_PROFICIENCIES, BEHAVIOUR_MATURITIES } from "@forwardimpact/map/levels";

const data = await loadAllData("./data");
```

For activity datasets, consumers import query functions from
`@forwardimpact/map/activity/queries` as workspace dependencies:

```javascript
// Activity layer imports (workspace only, not published)
import { getOrganization, getTeam } from "@forwardimpact/map/activity/queries/org";
import { listSnapshots, getSnapshotScores } from "@forwardimpact/map/activity/queries/snapshots";
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import { getArtifacts } from "@forwardimpact/map/activity/queries/artifacts";
```

---

## Related Documentation

- [libskill Internals](/docs/internals/libskill/) -- Derivation engine that
  consumes Map data
- [Pathway Internals](/docs/internals/pathway/) -- Presentation layer for
  framework data
- [YAML Schema Reference](/docs/reference/yaml-schema/) -- Schema format
  documentation
