---
title: YAML Schema Reference
description: File format reference for every entity type, with examples and links to published JSON Schema and RDF/SHACL definitions.
---

## Overview

Agent-aligned engineering standard definitions are stored as YAML files. Two
schema formats validate these files, ensuring structural correctness and
enabling tooling integration.

---

## Schema Formats

| Format      | Package Path   | Purpose                      |
| ----------- | -------------- | ---------------------------- |
| JSON Schema | `schema/json/` | YAML validation tooling      |
| RDF/SHACL   | `schema/rdf/`  | Linked data interoperability |

Paths are relative to `products/map/` (published as `@forwardimpact/map`).

---

## Entity Types

| Entity                 | Question                                         | File Location                  | Schema                                          |
| ---------------------- | ------------------------------------------------ | ------------------------------ | ----------------------------------------------- |
| Standard               | What is this agent-aligned engineering standard? | `standard.yaml`                | `schema/json/standard.schema.json`              |
| Levels                 | What career level?                               | `levels.yaml`                  | `schema/json/levels.schema.json`                |
| Disciplines            | What kind of engineer?                           | `disciplines/{id}.yaml`        | `schema/json/discipline.schema.json`            |
| Tracks                 | Where/how do you work?                           | `tracks/{id}.yaml`             | `schema/json/track.schema.json`                 |
| Capabilities           | What capability area?                            | `capabilities/{id}.yaml`       | `schema/json/capability.schema.json`            |
| Skills                 | What can you do?                                 | `capabilities/{id}.yaml`       | (within capability schema)                      |
| Behaviours             | How do you approach work?                        | `behaviours/{id}.yaml`         | `schema/json/behaviour.schema.json`             |
| Drivers                | What outcomes matter?                            | `drivers.yaml`                 | `schema/json/drivers.schema.json`               |
| Questions              | How do you assess this?                          | `questions/{type}/`            | `schema/json/*-questions.schema.json`           |
| Organizational Context | What facts apply to this team?                   | `organizational-context.yaml`  | `schema/json/organizational-context.schema.json` |

Entity file locations are relative to your data directory — typically
`data/pathway/`, configurable via `npx fit-map validate --data=<path>`. Schema
paths are relative to `products/map/` in the monorepo.

---

## Skill Proficiencies

| Proficiency    | Index | Autonomy              | Scope                    |
| -------------- | ----- | --------------------- | ------------------------ |
| `awareness`    | 0     | with guidance         | team                     |
| `foundational` | 1     | with minimal guidance | team                     |
| `working`      | 2     | independently         | team                     |
| `practitioner` | 3     | lead, mentor          | area (2--5 teams)        |
| `expert`       | 4     | define, shape         | business unit / function |

---

## Behaviour Maturities

| Maturity        | Index | Description                                          |
| --------------- | ----- | ---------------------------------------------------- |
| `emerging`      | 0     | Shows interest, needs prompting                      |
| `developing`    | 1     | Regularly applies with some guidance                 |
| `practicing`    | 2     | Consistently demonstrates in daily work              |
| `role-modeling` | 3     | Influences the team's approach, others seek them out |
| `exemplifying`  | 4     | Shapes organizational culture in this area           |

---

## Co-located Content

All entities use `human:` and `agent:` sections in the same YAML file. The
`human:` section contains descriptions for people. The `agent:` section contains
instructions for AI coding agents. Skills with an `agent:` section render as
SKILL.md content via `npx fit-pathway skill <id> --agent`.

---

## Entity Examples

### Agent-Aligned Engineering Standard

```yaml
title: Acme Engineering Pathway
description: Agent-Aligned Engineering Standard for Acme Corp.
tag: acme
entityDefinitions:
  discipline:
    title: Discipline
    description: Engineering specialization
  skill:
    title: Skill
    description: Technical or professional capability
distribution:
  siteUrl: https://pathway.acme.com
```

### Level

```yaml
- id: L3
  professionalTitle: Senior Engineer
  managementTitle: Senior Manager
  ordinalRank: 3
  typicalExperienceRange: "5-8"
  baseSkillProficiencies:
    core: practitioner
    supporting: working
    broad: foundational
  baseBehaviourMaturity: developing
  expectations:
    impactScope: Cross-team technical leadership
    autonomyExpectation: Independently drives complex work
    influenceScope: Area of 2-5 teams
    complexityHandled: Multi-system, ambiguous requirements
```

### Discipline

```yaml
specialization: Software Engineering
roleTitle: Software Engineer
isProfessional: true
isManagement: false
validTracks: [null, platform, product]
minLevel: L1
coreSkills: [code-quality, testing, system-design]
supportingSkills: [ci-cd, documentation]
broadSkills: [security, observability]
behaviourModifiers:
  analytical-thinking: 1
human:
  roleSummary: >
    {roleTitle}s in {specialization} design, build, and maintain
    software systems.
agent:
  identity: >
    You are a {roleName} focused on writing clean, tested,
    well-documented code.
  priority: Code quality and test coverage
  constraints:
    - Never skip tests
```

### Track

```yaml
name: Platform
description: Infrastructure and platform engineering
roleContext: >
  Works on shared infrastructure, developer tooling,
  and platform reliability.
skillModifiers:
  reliability: 1
  delivery: -1
behaviourModifiers:
  systems-thinking: 1
agent:
  identity: >
    You are a {roleTitle} specializing in platform infrastructure.
  priority: Infrastructure reliability and developer experience
```

### Capability

```yaml
name: Delivery
description: Ship working software reliably.
ordinalRank: 1
professionalResponsibilities:
  awareness: Follow deployment checklists and team workflows
  foundational: Complete deployment tasks with minimal guidance
  working: Own the deployment pipeline for your team
  practitioner: Design deployment strategy across multiple teams
  expert: Define organization-wide delivery practices
managementResponsibilities:
  awareness: Understand the team's deployment process
  foundational: Ensure team follows deployment standards
  working: Optimize team delivery throughput
  practitioner: Coordinate delivery across multiple teams
  expert: Shape organizational delivery culture
skills:
  - id: ci-cd
    name: CI/CD
    human:
      description: Continuous integration and deployment pipelines
      proficiencyDescriptions:
        awareness: Follows existing pipeline configuration
        foundational: Creates basic pipeline steps
        working: Designs multi-stage pipelines
        practitioner: Optimizes pipeline performance
        expert: Architects CI/CD platform standards
    agent:
      description: CI/CD pipeline configuration and maintenance
      useWhen: Creating or modifying CI/CD pipelines
      focus: Implement pipeline changes safely with rollback awareness
      readChecklist:
        - Read existing pipeline configuration
        - Identify deployment targets and protected branches
      confirmChecklist:
        - Pipeline runs successfully on the feature branch
        - Rollback path is documented
    toolReferences:
      - name: GitHub Actions
        description: CI/CD workflow automation
        useWhen: Configuring automated builds and deployments
```

### Behaviour

```yaml
name: Analytical Thinking
human:
  description: Breaks down complex problems systematically
  maturityDescriptions:
    emerging: Shows interest in understanding problems before jumping to solutions
    developing: Regularly decomposes problems into smaller parts with guidance
    practicing: Consistently identifies root causes and considers multiple perspectives
    role-modeling: Influences the team's approach to systematic problem-solving
    exemplifying: Shapes organizational culture around evidence-based decisions
agent:
  title: Systematic Problem Decomposition
  workingStyle: >
    Break problems into smaller parts before proposing solutions.
    Identify assumptions, dependencies, and risks explicitly.
```

### Driver

```yaml
- id: quality
  name: Quality
  description: Delivering reliable, well-tested software
  contributingSkills:
    - testing
    - code-quality
  contributingBehaviours:
    - analytical-thinking
```

---

## ID Patterns

| Entity     | Pattern           | Example              |
| ---------- | ----------------- | -------------------- |
| Level      | `[A-Z][A-Z0-9]*`  | L1, L2, L3           |
| Discipline | `[a-z][a-z0-9-]*` | software-engineering |
| Track      | `[a-z][a-z0-9-]*` | platform             |
| Capability | `[a-z][a-z0-9-]*` | delivery             |
| Skill      | `[a-z][a-z0-9-]*` | ci-cd                |
| Behaviour  | `[a-z][a-z0-9-]*` | analytical-thinking  |
| Driver     | `[a-z][a-z0-9-]*` | quality              |

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

## What's next

<div class="grid">

<!-- part:card:../model -->
<!-- part:card:../lifecycle -->

</div>
