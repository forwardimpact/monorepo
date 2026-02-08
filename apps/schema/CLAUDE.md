# Schema Package

## Package Structure

```
apps/schema/
  src/
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

**Schema Synchronization:** When adding or modifying properties, update both
`schema/json/` and `schema/rdf/` in the same commit. The two formats must stay
in sync.

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

## Tasks

### Add Skill

1. Add skill to capability file
   `apps/schema/examples/capabilities/{capability_id}.yaml`
2. Add skill object with `id`, `name`, and `human:` section
3. Include level descriptions for all five levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions to `apps/schema/examples/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npx fit-schema validate`

### Add Interview Questions

Location:

- Skills: `apps/schema/examples/questions/skills/{skill_id}.yaml`
- Behaviours: `apps/schema/examples/questions/behaviours/{behaviour_id}.yaml`

Required properties:

| Property     | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Format: `{abbrev}_{level_abbrev}_{number}`     |
| `text`       | Question text (second person, under 150 chars) |
| `lookingFor` | 2-4 bullet points of good answer indicators    |

### Add Agent Skill Section

1. Add `agent:` section to skill in capability file
2. Include: `name`, `description`, `useWhen`, `stages`
3. Define stage guidance: `focus`, `activities[]`, `ready[]`
4. Run `npx fit-schema validate`

```yaml
agent:
  name: skill-name-kebab-case
  description: Brief description
  useWhen: When agents should apply this skill
  stages:
    plan:
      focus: Planning objectives
      activities: [...]
      ready: [...]
    code:
      focus: Implementation objectives
      activities: [...]
      ready: [...]
```

### Add Tool Reference

Add `toolReferences:` to skill in capability file:

```yaml
toolReferences:
  - name: Langfuse
    url: https://langfuse.com/docs
    description: LLM observability platform
    useWhen: Instrumenting AI applications
```

### Schema CLI

```sh
npx fit-schema validate          # Validate all data
npx fit-schema generate-index    # Generate browser indexes
npx fit-schema validate --shacl  # Validate RDF/SHACL
```
