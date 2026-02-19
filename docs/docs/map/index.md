---
title: Map
description: Data model, YAML format, validation, and programmatic access for the Map data layer.
---

## Overview

Map is the data layer of the FIT suite. It defines the engineering competency
model in YAML files that can be validated, loaded, and consumed by downstream
tools.

> See the [Map product page](/map/) for a high-level overview.

---

## How Data is Organized

All definitions live in YAML files under your data directory:

```
data/
├── grades.yaml           # Career levels (L1–L5)
├── stages.yaml           # Engineering lifecycle phases
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work context modifiers
├── behaviours/           # Approaches to work
├── capabilities/         # Skill groups with responsibilities
└── questions/            # Interview questions
```

Every entity supports both human and agent perspectives in the same file — a
skill definition includes human-readable level descriptions alongside
agent-specific instructions for AI coding assistants.

---

## Validation

Map validates referential integrity, required fields, valid enum values, and
cross-entity consistency:

```sh
npx fit-map validate          # Full validation
npx fit-map validate --shacl  # RDF/SHACL validation
npx fit-map generate-index    # Generate browser indexes
```

---

## Programmatic Access

```javascript
import { loadAllData } from "@forwardimpact/map";
import { validateAll } from "@forwardimpact/map/validation";
import { SKILL_LEVELS, BEHAVIOUR_MATURITIES } from "@forwardimpact/map/levels";

const data = await loadAllData("./data");
```

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
| **Grades**       | What career level?        | `grades.yaml`                      |
| **Tracks**       | Where/how do you work?    | `tracks/{id}.yaml`                 |
| **Skills**       | What can you do?          | `capabilities/{id}.yaml` (skills:) |
| **Behaviours**   | How do you approach work? | `behaviours/{id}.yaml`             |
| **Capabilities** | What capability area?     | `capabilities/{id}.yaml`           |
| **Stages**       | What lifecycle phase?     | `stages.yaml`                      |
| **Drivers**      | What outcomes matter?     | `drivers.yaml`                     |

---

## Skill Levels

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
