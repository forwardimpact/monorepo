---
applyTo: "**"
---

# Architecture

## Monorepo Packages

```
apps/
  schema/       @forwardimpact/schema   Schema, validation, data loading
  model/        @forwardimpact/model    Derivation logic, job/agent models
  pathway/      @forwardimpact/pathway  Web app, CLI, formatters
```

| Package                  | CLI           | Purpose                                |
| ------------------------ | ------------- | -------------------------------------- |
| `@forwardimpact/schema`  | `fit-schema`  | Schema definitions and data loading    |
| `@forwardimpact/model`   | —             | Derivation engine for roles and agents |
| `@forwardimpact/pathway` | `fit-pathway` | Web app and CLI for career progression |

## 3-Layer System

1. **Schema** (`apps/schema/src/`) — Data definitions, validation, loading
2. **Model** (`apps/model/src/`) — Pure business logic, derivation
3. **Pathway** (`apps/pathway/src/`) — Formatters, views, UI components

## Data Flow

```
Schema (data) → Model (derivation) → Pathway (presentation)
```

- **Schema** defines what entities look like and validates them
- **Model** transforms entities into derived outputs (jobs, agents)
- **Pathway** formats outputs for display (web, CLI, markdown)

## Key Paths

| Purpose      | Location                       |
| ------------ | ------------------------------ |
| Example data | `apps/schema/examples/`        |
| JSON Schema  | `apps/schema/schema/json/`     |
| RDF/SHACL    | `apps/schema/schema/rdf/`      |
| Derivation   | `apps/model/src/`              |
| Formatters   | `apps/pathway/src/formatters/` |
| Templates    | `apps/pathway/templates/`      |

## Dependency Chain

```
schema → model → pathway
```

When updating data structure, change:

1. `apps/schema/schema/json/` and `rdf/` — Schema definitions (both formats,
   same commit)
2. `apps/schema/examples/` — Example data
3. `apps/model/src/` — Derivation logic if needed
4. `apps/pathway/src/formatters/` — Presentation if needed

See package-specific instructions:

- `architecture-schema.instructions.md` — Schema package
- `architecture-model.instructions.md` — Model package
- `architecture-pathway.instructions.md` — Pathway package
