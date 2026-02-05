---
title: Schema
description:
  Schema definitions and data loading for skills, behaviours, and role
  frameworks.
---

## Purpose

The schema package defines how engineering competencies are structured. It
provides the foundational data model that both human career progression and AI
agent generation build upon.

## Components

### JSON Schema (`schema/json/`)

Validates YAML data structure. Ensures data files conform to expected format.

### RDF/SHACL (`schema/rdf/`)

Semantic representation for linked data interoperability.

### Data Loading (`lib/loader.js`)

Parses YAML files into JavaScript objects for use by the model layer.

```javascript
import { loadAllData } from "@forwardimpact/schema";
const data = await loadAllData("./data");
```

### Validation (`lib/validation.js`)

Validates data against business rules:

- Referential integrity (skill references exist)
- Required fields present
- Valid enum values
- Cross-entity consistency

## Data Structure

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

## CLI

```sh
npx fit-schema validate          # Validate all data
npx fit-schema generate-index    # Generate browser indexes
npx fit-schema validate:shacl    # Validate RDF/SHACL
```

## Exports

```javascript
import { loadAllData, loadCapabilities } from "@forwardimpact/schema";
import { validateAll } from "@forwardimpact/schema/validation";
import {
  SKILL_LEVELS,
  BEHAVIOUR_MATURITIES,
} from "@forwardimpact/schema/levels";
```
