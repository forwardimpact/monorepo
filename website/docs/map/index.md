---
title: Map
description: Data product serving framework definitions, operational analytics, and ingestion contracts for the FIT suite.
---

## Overview

Map is the data product that serves framework definitions and operational
analytics to every product in the Forward Impact suite. It owns domain data,
publishes stable contracts, and enforces schema quality — consumers depend on
contracts, not implementation details.

> See the [Map product page](/map/) for a high-level overview.

---

## Position in the Suite

As a data product, Map separates three concerns:

- **Storage** — Map owns data ingestion, schema, and persistence.
- **Interpretation** — Guide reads artifacts from Map, assesses them against
  markers, and writes evidence back. Map stores but does not interpret.
- **Presentation** — Landmark and other products read Map data and format views.
  Map serves but does not present.

Map provides two domains:

1. **Framework domain** — skills, behaviours, levels, disciplines, tracks,
   stages, drivers, and interview questions.
2. **Activity domain** — organization hierarchy, GitHub activity/evidence, and
   GetDX snapshot aggregates.

Products query Map through shared contracts across these datasets.

---

## Internal Layering

The data product serves two audiences separated by a one-way dependency
boundary:

```
products/map/
  src/              Pure data model (published to npm)
  schema/           JSON Schema + RDF/SHACL (published to npm)
  activity/         Operational layer (NOT published to npm)
    migrations/     SQL schema definitions
    ingestion/      GetDX snapshot importer, GitHub webhook receiver
    queries/        Reusable query functions (org, snapshots, evidence)
  bin/fit-map.js    CLI entry point (routes to both layers)
```

**Pure layer** (`src/`, `schema/`) — Framework schema, validation, data loading.
Zero infrastructure dependencies. Published to npm.

**Activity layer** (`activity/`) — Supabase migrations, ingestion pipelines,
query functions. Requires runtime infrastructure. Excluded from npm publish.

**Layering rule:** `activity/` may import from `src/` (e.g., to validate
`discipline` values during people import). `src/` must never import from
`activity/`.

**Join convention:** Framework entity IDs (`discipline`, `level`, `track`,
`skill_id`, `level_id`, `driver.id`) serve as natural join keys between the
activity layer and the pure layer. Activity tables store these IDs as bare
strings; consumers join them to framework objects in application code. No
mapping tables bridge the two layers — the shared ID namespace is the contract.

---

## How Data is Organized

### Framework definitions (YAML)

Definitions live in YAML files under your data directory:

```
data/
├── levels.yaml           # Career levels (L1–L5)
├── stages.yaml           # Engineering lifecycle phases
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work context modifiers
├── behaviours/           # Approaches to work
├── capabilities/         # Skill groups with responsibilities
└── questions/            # Interview questions
```

### Activity model (stored records)

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

Team scope is derived from the manager hierarchy — not stored as a separate
entity.

### Unified person model

`organization_people` uses email as the cross-system join key spanning HR,
GetDX, GitHub (via commit author), and internal tooling. The `discipline`,
`level`, and `track` fields carry the Pathway job profile, so any consumer can
call `deriveJob(discipline, level, track, data)` from libskill to get the full
skill matrix for a person.

### Skill markers

Markers are observable indicators of a skill at a proficiency level. They live
in capability YAML files alongside skill definitions:

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

Markers are installation-specific. Map validates marker definitions during
`fit-map validate`. Guide reads them for interpretation. Landmark reads them for
labeling evidence.

---

## Ingestion Surfaces

### GetDX snapshots

Map imports GetDX snapshots via the `snapshots.list` and `snapshots.info` APIs.
The ingestion pipeline diffs against known snapshots, imports new or changed
ones, and upserts team scores. GetDX teams are bridged to the internal org model
via `manager_email`.

Three tables capture the data:

- **`getdx_snapshots`** — metadata for each quarterly survey cycle.
- **`getdx_teams`** — GetDX team hierarchy with `manager_email` bridge.
- **`getdx_snapshot_team_scores`** — aggregated factor/driver scores with
  comparative metrics (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`).

### GitHub webhooks

Map receives GitHub webhook events (`pull_request`, `pull_request_review`,
`push`), stores raw events in `github_events`, and extracts normalized artifacts
(PRs, reviews, commits) into `github_artifacts`. Each artifact is linked to the
unified person model via `github_username` → `email`.

### Evidence pipeline

```
GitHub Events → Map (github_events → github_artifacts)
                                        │
                                 Guide (interprets against markers)
                                        │
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
matches the `item_id` in `getdx_snapshot_team_scores` — no separate mapping is
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
dependency — these imports are never published.

---

## Validation

Map validates referential integrity, required fields, valid enum values, and
cross-entity consistency:

```sh
npx fit-map validate          # Full validation
npx fit-map validate --shacl  # RDF/SHACL validation
npx fit-map generate-index    # Generate browser indexes
```

Validation covers framework definitions and marker structure. Activity ingestion
validation is handled by ingestion pipelines and table constraints.

---

## Programmatic Access

```javascript
import { loadAllData } from "@forwardimpact/map";
import { validateAll } from "@forwardimpact/map/validation";
import { SKILL_PROFICIENCIES, BEHAVIOUR_MATURITIES } from "@forwardimpact/map/levels";

const data = await loadAllData("./data");
```

For activity datasets, consumers import query functions from
`@forwardimpact/map/activity/queries` as workspace dependencies.

---

## Schema Formats

Definitions are available in two schema formats, always kept in sync:

| Format          | Path           | Purpose                      |
| --------------- | -------------- | ---------------------------- |
| **JSON Schema** | `schema/json/` | YAML validation tooling      |
| **RDF/SHACL**   | `schema/rdf/`  | Linked data interoperability |

---

## Entity Types

| Entity           | Question                  | File Location                      |
| ---------------- | ------------------------- | ---------------------------------- |
| **Disciplines**  | What kind of engineer?    | `disciplines/{id}.yaml`            |
| **Levels**       | What career level?        | `levels.yaml`                      |
| **Tracks**       | Where/how do you work?    | `tracks/{id}.yaml`                 |
| **Skills**       | What can you do?          | `capabilities/{id}.yaml` (skills:) |
| **Behaviours**   | How do you approach work? | `behaviours/{id}.yaml`             |
| **Capabilities** | What capability area?     | `capabilities/{id}.yaml`           |
| **Stages**       | What lifecycle phase?     | `stages.yaml`                      |
| **Drivers**      | What outcomes matter?     | `drivers.yaml`                     |

---

## Skill Proficiencies

| Level          | Description                           |
| -------------- | ------------------------------------- |
| `awareness`    | Learning fundamentals, needs guidance |
| `foundational` | Can apply basics independently        |
| `working`      | Solid competence, handles ambiguity   |
| `practitioner` | Deep expertise, leads and mentors     |
| `expert`       | Authority, shapes org direction       |

---

## Behaviour Maturities

| Maturity        | Description                       |
| --------------- | --------------------------------- |
| `emerging`      | Shows interest, needs prompting   |
| `developing`    | Regular practice with guidance    |
| `practicing`    | Consistent application, proactive |
| `role_modeling` | Influences team culture           |
| `exemplifying`  | Shapes organizational culture     |

---

## Related Documentation

- [Core Model](/docs/model/) — How entities combine into role definitions
- [Lifecycle](/docs/model/lifecycle/) — Stages, handoffs, and checklists
- [Reference](/docs/pathway/reference/) — File organization and CLI
