---
applyTo: "apps/schema/**"
---

# Schema Architecture

## Package Structure

```
apps/schema/
  lib/
    loader.js           # Load and parse YAML data files
    validation.js       # Data validation logic
    schema-validation.js # JSON Schema validation
    index-generator.js  # Generate _index.yaml for browser
    levels.js           # Skill levels, behaviour maturities
    modifiers.js        # Modifier utilities
  schema/
    json/               # JSON Schema definitions
    rdf/                # RDF/SHACL ontology
  examples/             # Canonical example data
```

## CLI

`npx fit-schema <command>`

| Command            | Purpose                      |
| ------------------ | ---------------------------- |
| `validate`         | Run full data validation     |
| `generate-index`   | Generate browser index files |
| `validate --shacl` | Validate SHACL ontology      |

## Key Modules

### loader.js

Loads and parses YAML data files into JavaScript objects.

```javascript
import { loadAllData, loadCapabilities } from "@forwardimpact/schema/loader";
const data = await loadAllData("./data");
```

### validation.js

Validates data against business rules (referential integrity, required fields).

```javascript
import { validateAll } from "@forwardimpact/schema/validation";
const errors = validateAll(data);
```

### schema-validation.js

Validates data against JSON Schema definitions.

### levels.js

Exports skill level and behaviour maturity constants.

```javascript
import {
  SKILL_LEVELS,
  BEHAVIOUR_MATURITIES,
} from "@forwardimpact/schema/levels";
```

### index-generator.js

Generates `_index.yaml` files for browser-based data loading.

## Schema Definitions

### JSON Schema (`schema/json/`)

Validates YAML structure. One schema per entity type.

### RDF/SHACL (`schema/rdf/`)

Semantic representation for linked data interoperability.

## Example Data (`examples/`)

Canonical reference data for testing and documentation. Structure:

```
examples/
├── grades.yaml           # Career levels
├── stages.yaml           # Lifecycle stages
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work contexts
├── behaviours/           # Approach to work
├── capabilities/         # Skills grouped by area
└── questions/            # Interview questions
```
