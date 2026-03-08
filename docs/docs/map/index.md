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

---

## Validation

Map validates referential integrity, required fields, valid enum values, and
cross-entity consistency:

```sh
npx fit-map validate          # Full validation
npx fit-map validate --shacl  # RDF/SHACL validation
npx fit-map generate-index    # Generate browser indexes
```

Validation covers framework definitions. Activity ingestion validation is
handled by ingestion pipelines and table constraints.

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
