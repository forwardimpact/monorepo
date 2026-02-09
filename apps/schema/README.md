# @forwardimpact/schema

Schema definitions and data loading for skills, behaviours, and role frameworks.

## Role in the Vision

The schema package defines how engineering competencies are structured. It
provides the foundational data model that both human career progression and
coding agent team generation build upon—ensuring consistency between how we
define human roles and how agent teams understand their capabilities.

## What It Does

- **Schema definitions** — JSON Schema and RDF/SHACL for skills, behaviours,
  disciplines, tracks, and grades
- **Data loading** — Parse and validate YAML data files
- **Index generation** — Generate browser-compatible file indexes
- **Example data** — Canonical examples for testing and reference

## Usage

```sh
# Validate all data files
npx fit-schema validate

# Generate index files for browser
npx fit-schema generate-index

# Validate SHACL ontology
npx fit-schema validate --shacl
```

## Package Exports

```javascript
import { loadAllData, loadCapabilities } from "@forwardimpact/schema";
import { validateAll } from "@forwardimpact/schema/validation";
import {
  SKILL_LEVELS,
  BEHAVIOUR_MATURITIES,
} from "@forwardimpact/schema/levels";
```

## Data Structure

```
examples/
├── grades.yaml           # Career levels
├── stages.yaml           # Lifecycle stages
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work contexts (platform, SRE, etc.)
├── behaviours/           # Approach to work
├── capabilities/         # Skills grouped by area
└── questions/            # Interview questions
```

See the [documentation](../../docs/schema/index.md) for schema details.
