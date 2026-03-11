# @forwardimpact/map

A public site describing the data model for consumption by AI agents and
engineers.

## Role in the Vision

The Map product is the fundamental underpinning of all Forward Impact products.
It defines how engineering competencies, career progression, and agent
capabilities are structured\u2014and publishes that structure in
machine-readable formats so AI agents can reliably interpret and work with
career framework data.

Making the data model well understood is a first-class goal. By publishing JSON
Schema and RDF/SHACL definitions alongside canonical example data, we ensure
that every consumer—human or AI—shares a consistent understanding of the data
model.

## What It Does

- **Public data model** — JSON Schema and RDF/SHACL definitions for skills,
  behaviours, disciplines, tracks, and levels
- **Data loading** — Parse and validate YAML data files
- **Validation** — Enforce referential integrity, required fields, and schema
  compliance
- **Index generation** — Generate browser-compatible file indexes
- **Example data** — Canonical examples for testing and reference

## Usage

```sh
# Validate all data files
npx fit-map validate

# Generate index files for browser
npx fit-map generate-index

# Validate SHACL ontology
npx fit-map validate --shacl
```

## Package Exports

```javascript
import { loadAllData, loadCapabilities } from "@forwardimpact/map";
import { validateAll } from "@forwardimpact/map/validation";
import {
  SKILL_PROFICIENCIES,
  BEHAVIOUR_MATURITIES,
} from "@forwardimpact/map/levels";
```

## Data Structure

```
examples/
├── levels.yaml           # Career levels
├── stages.yaml           # Lifecycle stages
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work contexts (platform, SRE, etc.)
├── behaviours/           # Approach to work
├── capabilities/         # Skills grouped by area
└── questions/            # Interview questions
```

See the [documentation](../../website/docs/map/index.md) for details.
