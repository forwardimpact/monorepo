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
| Levels       | What career level?        | `levels.yaml`            | `schema/json/levels.schema.json`      |
| Disciplines  | What kind of engineer?    | `disciplines/{id}.yaml`  | `schema/json/discipline.schema.json`  |
| Tracks       | Where/how do you work?    | `tracks/{id}.yaml`       | `schema/json/track.schema.json`       |
| Capabilities | What capability area?     | `capabilities/{id}.yaml` | `schema/json/capability.schema.json`  |
| Skills       | What can you do?          | `capabilities/{id}.yaml` | (within capability schema)            |
| Behaviours   | How do you approach work? | `behaviours/{id}.yaml`   | `schema/json/behaviour.schema.json`   |
| Stages       | What lifecycle phase?     | `stages.yaml`            | `schema/json/stages.schema.json`      |
| Drivers      | What outcomes matter?     | `drivers.yaml`           | `schema/json/drivers.schema.json`     |
| Questions    | How do you assess this?   | `questions/{type}/`      | `schema/json/*-questions.schema.json` |

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

## Entity Examples

### Level

```yaml
- id: L3
  professionalTitle: Senior Engineer
  managementTitle: Senior Manager
  ordinalRank: 3
  typicalExperienceRange: "5-8"
  baseSkillProficiencies:
    primary: practitioner
    secondary: working
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
coreSkills: [code_quality, testing, system_design]
supportingSkills: [ci_cd, documentation]
broadSkills: [security, observability]
behaviourModifiers:
  analytical_thinking: 1
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
  systems_thinking: 1
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
  - id: ci_cd
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
      name: ci-cd
      description: CI/CD pipeline configuration and maintenance
      useWhen: Creating or modifying CI/CD pipelines
      stages:
        code:
          focus: Implement pipeline changes
          readChecklist:
            - Read existing pipeline configuration
          confirmChecklist:
            - Pipeline runs successfully
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
    role_modeling: Influences the team's approach to systematic problem-solving
    exemplifying: Shapes organizational culture around evidence-based decisions
agent:
  title: Systematic Problem Decomposition
  workingStyle: >
    Break problems into smaller parts before proposing solutions.
    Identify assumptions, dependencies, and risks explicitly.
```

### Stage

```yaml
- id: code
  name: Code
  emojiIcon: "\U0001F4BB"
  description: >
    You implement the solution and write tests. Follow the plan
    from the previous stage.
  summary: Implements solutions and writes tests
  constraints:
    - Do not change architecture decisions made during planning
  readChecklist:
    - Read the plan or specification
    - Identify affected files and dependencies
  confirmChecklist:
    - All tests pass
    - Code follows project conventions
  returnFormat:
    - List of files changed
    - Test results summary
  handoffs:
    - targetStage: review
      label: Request Review
      prompt: Implementation complete and tests passing.
```

### Driver

```yaml
- id: quality
  name: Quality
  description: Delivering reliable, well-tested software
  contributingSkills:
    - testing
    - code_quality
  contributingBehaviours:
    - analytical_thinking
```

---

## ID Patterns

| Entity     | Pattern           | Example                                       |
| ---------- | ----------------- | --------------------------------------------- |
| Level      | `[A-Z][A-Z0-9]*`  | L1, L2, L3                                    |
| Discipline | `[a-z][a-z0-9_]*` | software_engineering                          |
| Track      | `[a-z][a-z0-9_]*` | platform                                      |
| Capability | `[a-z][a-z0-9_]*` | delivery                                      |
| Skill      | `[a-z][a-z0-9_]*` | ci_cd                                         |
| Behaviour  | `[a-z][a-z0-9_]*` | analytical_thinking                           |
| Driver     | `[a-z][a-z0-9_]*` | quality                                       |
| Stage      | Fixed enum        | specify, plan, scaffold, code, review, deploy |
| Agent name | `[a-z][a-z0-9-]*` | ci-cd (kebab-case)                            |

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
