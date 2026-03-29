---
title: YAML Schema Reference
description: File format reference for every entity type, with examples and links to published JSON Schema and RDF/SHACL definitions.
---

## Overview

Framework definitions are stored as YAML files. Two schema formats validate
these files, ensuring structural correctness and enabling tooling integration.

---

## Schema Formats

| Format      | Package Path   | Purpose                      |
| ----------- | -------------- | ---------------------------- |
| JSON Schema | `schema/json/` | YAML validation tooling      |
| RDF/SHACL   | `schema/rdf/`  | Linked data interoperability |

Paths are relative to `products/map/` (published as `@forwardimpact/map`).

---

## Entity Types

| Entity       | Question                  | File Location            | Schema                                |
| ------------ | ------------------------- | ------------------------ | ------------------------------------- |
| Disciplines  | What kind of engineer?    | `disciplines/{id}.yaml`  | `schema/json/discipline.schema.json`  |
| Levels       | What career level?        | `levels.yaml`            | `schema/json/levels.schema.json`      |
| Tracks       | Where/how do you work?    | `tracks/{id}.yaml`       | `schema/json/track.schema.json`       |
| Skills       | What can you do?          | `capabilities/{id}.yaml` | (within capability schema)            |
| Behaviours   | How do you approach work? | `behaviours/{id}.yaml`   | `schema/json/behaviour.schema.json`   |
| Capabilities | What capability area?     | `capabilities/{id}.yaml` | `schema/json/capability.schema.json`  |
| Stages       | What lifecycle phase?     | `stages.yaml`            | `schema/json/stages.schema.json`      |
| Drivers      | What outcomes matter?     | `drivers.yaml`           | `schema/json/drivers.schema.json`     |
| Questions    | How do you assess this?   | `capabilities/{id}.yaml` | `schema/json/*-questions.schema.json` |

---

## Skill Proficiencies

| Proficiency  | Index | Description                            |
| ------------ | ----- | -------------------------------------- |
| awareness    | 0     | Learning fundamentals, needs guidance  |
| foundational | 1     | Applies basics independently           |
| working      | 2     | Solid competence, handles ambiguity    |
| practitioner | 3     | Deep expertise, leads and mentors      |
| expert       | 4     | Authority, shapes direction across org |

---

## Behaviour Maturities

| Maturity      | Index | Description                       |
| ------------- | ----- | --------------------------------- |
| emerging      | 0     | Shows interest, needs prompting   |
| developing    | 1     | Regular practice with guidance    |
| practicing    | 2     | Consistent application, proactive |
| role_modeling | 3     | Influences team culture           |
| exemplifying  | 4     | Shapes organizational culture     |

---

## Co-located Content

All entities use `human:` and `agent:` sections in the same YAML file. The
`human:` section contains descriptions for people. The `agent:` section contains
instructions for AI coding agents. Skills with an `agent:` section generate
SKILL.md files when using `npx fit-pathway skill <id> --agent`.

---

## Skill Markers

Skill markers define observable evidence at each proficiency level within the
`agent:` section. They tell agents (and humans) what "good" looks like at a
given level.

```yaml
skills:
  - id: ci_cd
    name: CI/CD
    human:
      description: "Continuous integration and deployment pipelines"
    agent:
      description: "CI/CD pipeline configuration and maintenance"
      markers:
        awareness:
          - "Follows existing pipeline configuration"
        foundational:
          - "Creates basic pipeline steps"
          - "Configures standard test runners"
        working:
          - "Designs multi-stage pipelines"
          - "Implements caching strategies"
        practitioner:
          - "Optimizes pipeline performance"
          - "Designs deployment strategies"
        expert:
          - "Architects CI/CD platform standards"
```

---

## Entity Examples

### Discipline

```yaml
id: software_engineering
name: Software Engineering
isProfessional: true
isManagement: false
minLevel: L1
validTracks: [null, platform, product]
coreSkills: [code_quality, testing, architecture]
supportingSkills: [ci_cd, documentation]
broadSkills: [security, observability]
human:
  description: "Designs and builds software systems"
agent:
  description: "Software engineering discipline for AI agents"
behaviourModifiers:
  analytical_thinking: 1
```

### Level

```yaml
levels:
  - id: L3
    name: Senior
    baseSkillProficiencies:
      primary: practitioner
      secondary: working
      broad: foundational
    baseBehaviourMaturity: developing
```

### Track

```yaml
id: platform
name: Platform
human:
  description: "Infrastructure and platform engineering"
agent:
  description: "Platform track context for AI agents"
skillModifiers:
  delivery: 1
  scale: -1
behaviourModifiers:
  systems_thinking: 1
```

### Capability

```yaml
id: delivery
name: Delivery
human:
  description: "Shipping software reliably"
agent:
  description: "Delivery capability for AI agents"
skills:
  - id: ci_cd
    name: CI/CD
    human:
      description: "Pipeline management"
    agent:
      description: "CI/CD for agents"
professionalResponsibilities:
  awareness: ["Follow deployment checklists"]
  working: ["Own deployment pipeline for team"]
  practitioner: ["Design deployment strategy for area"]
managementResponsibilities:
  awareness: ["Understand deployment process"]
  working: ["Ensure team follows deployment standards"]
```

### Behaviour

```yaml
id: analytical_thinking
name: Analytical Thinking
human:
  description: "Breaks down complex problems systematically"
agent:
  description: "Systematic problem decomposition"
```

### Stages

```yaml
stages:
  - id: code
    name: Code
    description: "Implement the solution and write tests"
    constraints:
      - "Cannot change architecture"
      - "Must follow the plan"
    handoffs:
      - name: Request Review
        targetStage: review
        prompt: "Implementation complete, tests passing"
```

### Drivers

```yaml
drivers:
  - id: quality
    name: Quality
    human:
      description: "Delivering reliable, well-tested software"
    skills: [testing, code_quality]
    behaviours: [analytical_thinking]
```

---

## Validation

```sh
npx fit-map validate          # Full validation (JSON Schema + referential integrity)
npx fit-map validate --shacl  # Include RDF/SHACL validation
```

Validation checks:

- **Schema compliance** -- Each file matches its JSON Schema definition
- **Referential integrity** -- All cross-references between entities resolve
  (e.g. discipline skill references exist in capabilities)
- **SHACL conformance** -- RDF shapes validate when `--shacl` is specified

---

## Related Documentation

- [Authoring Frameworks](/docs/guides/authoring-frameworks/) -- Writing and
  maintaining framework data
- [Core Model](/docs/reference/model/) -- How entities combine into role
  definitions
