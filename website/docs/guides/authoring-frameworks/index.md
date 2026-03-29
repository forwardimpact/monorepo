---
title: "Authoring Frameworks"
description: "Define your engineering framework in YAML — entities, skills, behaviours, markers, and validation."
---

# Authoring Frameworks

Map is the data product that stores your engineering framework definitions.
Teams define what good engineering looks like once, in YAML files, and every
other product in the suite reads from that shared source of truth.

## Position in the Suite

Map separates three concerns that are often tangled together:

- **Storage** — Map owns the canonical definitions
- **Interpretation** — Guide reasons about those definitions in context
- **Presentation** — Pathway, Landmark, and Summit each present a focused view

Map provides two domains of data:

- **Framework domain** — skills, behaviours, levels, disciplines, tracks,
  capabilities, and markers that define your engineering standards
- **Activity domain** — organizational hierarchy, GitHub activity, and GetDX
  snapshots that provide operational signals

## How Data is Organized

Framework definitions live in YAML files under a data directory:

```
data/
├── levels.yaml           # Career levels
├── stages.yaml           # Engineering lifecycle phases
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties
├── tracks/               # Work context modifiers
├── behaviours/           # Approaches to work
├── capabilities/         # Skill groups with responsibilities
└── questions/            # Interview questions
```

Each entity type has its own file or directory. Disciplines, tracks, behaviours,
and capabilities use one YAML file per entity, named by identifier. Levels,
stages, and drivers are single files containing all entries.

## Skill Markers

Markers are the observable evidence that someone demonstrates a skill at a given
proficiency level. Every skill definition includes markers for both humans and
AI agents.

```yaml
skills:
  - id: system_design
    name: System Design
    proficiencies:
      working:
        human:
          markers:
            - Designs components with clear boundaries and interfaces
            - Documents trade-offs and decisions in architecture records
            - Considers failure modes and proposes mitigation strategies
        agent:
          markers:
            - Generates component designs with explicit interface contracts
            - Produces architecture decision records from design prompts
            - Identifies failure modes and suggests circuit-breaker patterns
```

The `human:` section describes what a person does. The `agent:` section
describes the equivalent capability for an AI coding agent. Both sections use
the same proficiency levels and the same skill identifiers, so humans and agents
share a common vocabulary.

Markers serve multiple purposes across the suite:

- **Pathway** uses markers to generate job definitions and agent skill files
- **Guide** reads markers to interpret engineering artifacts against them
- **Landmark** matches activity evidence to markers for signal analysis

## Validation

Validate your framework data at any time:

```sh
npx fit-map validate
```

This checks that all YAML files conform to the expected schema — required fields
are present, identifiers are consistent, cross-references resolve, and
proficiency levels use valid values.

For additional schema validation including SHACL syntax checks:

```sh
npx fit-map validate --shacl
```

Run validation before committing changes to catch structural issues early.

## Related Documentation

- [YAML Schema Reference](/docs/reference/yaml-schema/) — full schema
  specification for all entity types
- [Data Model Reference](/docs/reference/model/) — how entities relate to each
  other
- [CLI Reference](/docs/reference/cli/) — complete command documentation for
  `fit-map`
