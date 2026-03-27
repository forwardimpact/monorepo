---
name: fit-map
description: >
  Work with the @forwardimpact/map product. Use when validating framework data,
  browsing entity definitions, or adding/modifying skills, capabilities,
  behaviours, disciplines, tracks, levels, questions, or schema definitions.
---

# Map Product

A public data model for consumption by AI agents and engineers. Map is the
foundation of all Forward Impact products — it defines how engineering
competencies, career progression, and agent capabilities are structured in a
machine-readable format.

Making the data model well understood is a first-class goal. It is published in
structured formats (JSON Schema, RDF/SHACL) so that AI agents can reliably
interpret and work with career framework data.

## When to Use

**Data validation and inspection:**

- Validating framework data integrity after changes
- Checking data summary (skill counts, entity counts)
- Generating browser index files for the web app
- Understanding what entities exist in the data

**Data authoring and schema work:**

- Adding or modifying skills in capability files
- Adding new behaviours, disciplines, tracks, or levels
- Adding interview questions
- Working with JSON Schema or RDF/SHACL definitions
- Improving schema documentation for public consumption

---

## CLI

```sh
npx fit-map validate                # Validate all data (JSON schema + referential)
npx fit-map validate --shacl        # Validate RDF/SHACL syntax
npx fit-map validate --data=PATH    # Validate a specific data directory
npx fit-map generate-index          # Generate _index.yaml files for browser loading
```

Validation output includes a data summary showing entity counts. Use this to
quickly verify data is loading correctly after changes.

---

## Data Structure

```
data/pathway/              (resolved via Finder.findData upward traversal)
├── framework.yaml         # Framework metadata, entity definitions
├── levels.yaml            # Career levels (J040, J060, etc.)
├── stages.yaml            # Lifecycle stages (plan, code, review, etc.)
├── drivers.yaml           # Organizational outcomes
├── disciplines/           # Engineering specialties (software_engineering, etc.)
├── tracks/                # Work contexts (platform, forward_deployed, etc.)
├── behaviours/            # Approach to work (outcome_ownership, etc.)
├── capabilities/          # Skills grouped by area (delivery, scale, etc.)
├── repository/            # Repository configuration (vscode-settings, devcontainer, etc.)
└── questions/             # Interview questions
    ├── skills/            # Per-skill question sets
    └── behaviours/        # Per-behaviour question sets
```

Entity files use **co-located content** — `human:` and `agent:` sections in the
same YAML file. All entities have an `id` field used for cross-references.

---

## Product Structure

```
products/map/
  bin/
    fit-map.js             # CLI entry point
  src/
    loader.js              # Load and parse YAML data files
    validation.js          # Referential integrity validation
    schema-validation.js   # JSON Schema validation
    index-generator.js     # Generate _index.yaml for browser
    levels.js              # Skill proficiencies, behaviour maturities
    modifiers.js           # Modifier utilities
  schema/
    json/                  # JSON Schema definitions (public)
    rdf/                   # RDF/SHACL ontology (public)
```

## Key Modules

### loader.js

```javascript
import { loadAllData, loadCapabilities } from "@forwardimpact/map/loader";
const data = await loadAllData("./data");
// data.skills, data.behaviours, data.disciplines, data.tracks, data.levels, ...
```

### validation.js

Validates referential integrity (e.g., discipline references valid skill IDs).

### levels.js

Exports proficiency and maturity constants used by derivation:

```javascript
import {
  SKILL_PROFICIENCIES,
  BEHAVIOUR_MATURITIES,
} from "@forwardimpact/map/levels";
```

## Schema Definitions

### JSON Schema (`schema/json/`)

Validates YAML structure. One schema per entity type.

### RDF/SHACL (`schema/rdf/`)

Semantic representation for linked data interoperability.

**Schema synchronization:** When adding or modifying properties, update both
`schema/json/` and `schema/rdf/` in the same commit. The two formats must stay
in sync.

---

## Common Tasks

### Add a Skill

1. Add skill to capability file:
   `data/pathway/capabilities/{capability_id}.yaml`
2. Add skill object with `id`, `name`, and `human:` section
3. Include level descriptions for all five proficiency levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions: `data/pathway/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npx fit-map validate`

### Add Interview Questions

Location:

- Skills: `data/pathway/questions/skills/{skill_id}.yaml`
- Behaviours: `data/pathway/questions/behaviours/{behaviour_id}.yaml`

Required properties:

| Property     | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Format: `{abbrev}_{level_abbrev}_{number}`     |
| `text`       | Question text (second person, under 150 chars) |
| `lookingFor` | 2-4 bullet points of good answer indicators    |

### Add Agent Skill Section

Add `agent:` section to skill in capability file:

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

## Verification

Always run validation after changes:

```sh
npx fit-map validate
```
