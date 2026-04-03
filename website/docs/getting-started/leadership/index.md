---
title: "Getting Started: Leadership"
description: "Define your engineering framework with Map, preview it with Pathway, analyze signals with Landmark, and plan team capability with Summit."
---

This guide walks you through setting up the FIT suite for engineering
leadership. By the end you will have a validated framework, a live preview,
signal analysis, and team capability planning.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/map @forwardimpact/pathway @forwardimpact/landmark @forwardimpact/summit
```

This gives you four CLI tools:

- `fit-map` — validate framework data against published schemas
- `fit-pathway` — browse, preview, and publish your framework
- `fit-landmark` — analyze engineering signals and team patterns
- `fit-summit` — model team capability, risks, and staffing scenarios

---

## Map

Map is the data product that defines your engineering framework in YAML and
stores operational signals — organization hierarchy, GitHub activity, and GetDX
snapshots.

### Initialize starter data

Bootstrap a complete framework skeleton with editable YAML files:

```sh
npx fit-pathway init
```

This creates `./data/pathway/` with starter definitions for levels, disciplines,
capabilities, skills, behaviours, stages, drivers, and tracks. The starter data
is a working framework you can customize to match your organization.

### Validate

Run the validator to check your YAML files against the schema:

```sh
npx fit-map validate
```

Fix any errors the validator reports before moving on.

### Customize your framework

The starter data gives you a complete foundation. Edit the YAML files under
`data/pathway/` to match your organization's engineering expectations.

#### Levels

Edit `data/pathway/levels.yaml` to define your level structure. Each level sets
baseline expectations for skill proficiency and behaviour maturity.

```yaml
- id: L1
  professionalTitle: Junior Engineer
  managementTitle: Junior Manager
  ordinalRank: 1
  baseSkillProficiencies:
    primary: foundational
    secondary: awareness
    broad: awareness
  baseBehaviourMaturity: emerging

- id: L2
  professionalTitle: Engineer
  managementTitle: Manager
  ordinalRank: 2
  baseSkillProficiencies:
    primary: working
    secondary: foundational
    broad: awareness
  baseBehaviourMaturity: developing
```

#### Capabilities and skills

Edit files under `data/pathway/capabilities/` to define capability groups
containing skills. Each skill needs a `human:` section with proficiency
descriptions at all five levels.

```yaml
name: Delivery
description: Ship working software reliably.
skills:
  - id: task_execution
    name: Task Execution
    human:
      description: Breaking down and completing engineering work
      proficiencyDescriptions:
        awareness: >
          Understands the team's delivery workflow and follows guidance
          to complete assigned tasks.
        foundational: >
          Breaks work into steps, estimates effort, and completes tasks
          with minimal guidance.
        working: >
          Independently plans and delivers work, adjusting approach when
          requirements change.
        practitioner: >
          Leads delivery across multiple workstreams, mentoring others
          on effective execution.
        expert: >
          Defines delivery practices that scale across the organization.
```

#### Disciplines

Edit files under `data/pathway/disciplines/` to define role types that reference
your capability skills.

```yaml
specialization: Software Engineering
roleTitle: Software Engineer
coreSkills:
  - task_execution
validTracks:
  - null
```

Use `null` in `validTracks` to allow a trackless (generalist) configuration.

After each change, re-validate with `npx fit-map validate`.

---

## Pathway

Pathway is your interface to the framework — browse roles, generate job
definitions, and preview everything in the browser.

### Preview

Start the development server to see your framework in the browser:

```sh
npx fit-pathway dev
# Open http://localhost:3000
```

Browse disciplines, levels, and skills to verify everything looks correct.

### Generate job definitions

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
npx fit-pathway job software_engineering L3 --track=platform
```

### Generate interview questions

Create role-specific interview question sets:

```sh
npx fit-pathway question software_engineering L3
```

---

## Landmark

Landmark is the analysis layer for engineering-system signals. It reads Map data
to show practice patterns, snapshot trends, and combined health views for
manager-defined teams.

### View practice patterns

See aggregate marker patterns across a team scope:

```sh
npx fit-landmark practice --skill system_design --manager platform_manager
```

This shows where your team has strong evidence of skill practice and where
evidence is weak — helping you identify coaching opportunities.

### Track snapshot trends

Compare GetDX snapshot scores over time:

```sh
npx fit-landmark snapshot trend --item MTQ2 --manager platform_manager
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager platform_manager
```

### View team health

Combine marker evidence and snapshot factors into a single health view:

```sh
npx fit-landmark health --manager platform_manager
```

---

## Summit

Summit treats a team as a system, not a collection of individuals. It aggregates
skill matrices into capability coverage, structural risks, and what-if staffing
scenarios.

### View capability coverage

See your team's collective proficiency across all skills:

```sh
npx fit-summit coverage platform
```

### Identify structural risks

Find single points of failure, critical gaps, and concentration risks:

```sh
npx fit-summit risks platform
```

### Run what-if scenarios

Simulate roster changes and see their impact before making a decision:

```sh
npx fit-summit what-if platform --add "{ discipline: se, level: L3, track: platform }"
```

---

## Next steps

- [Authoring frameworks](/docs/guides/authoring-frameworks/) — full guide to
  defining all entity types: levels, disciplines, tracks, capabilities, skills,
  behaviours, stages, and drivers
- [Team capability](/docs/guides/team-capability/) — deep dive into Summit
  coverage, risks, and scenario planning
- [YAML schema reference](/docs/reference/yaml-schema/) — complete file format
  documentation
