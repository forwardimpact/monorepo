---
title: "Getting Started: Leadership"
description: "Install the CLI tools, author your first engineering framework, validate, and preview."
---

This guide walks you through creating your first engineering framework. By the
end you will have a working set of YAML definitions that validate and preview in
the browser.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/map @forwardimpact/pathway
```

This gives you two CLI tools:

- `fit-pathway` — browse, preview, and publish your framework
- `fit-map` — validate framework data against published schemas

## Initialize starter data

Bootstrap a complete framework skeleton with editable YAML files:

```sh
npx fit-pathway init
```

This creates `./data/pathway/` with starter definitions for levels, disciplines,
capabilities, skills, behaviours, stages, drivers, and tracks. The starter data
is a working framework you can customize to match your organization.

## Validate

Run the validator to check your YAML files against the schema:

```sh
npx fit-map validate
```

Fix any errors the validator reports before moving on.

## Preview

Start the development server to see your framework in the browser:

```sh
npx fit-pathway dev
# Open http://localhost:3000
```

Browse disciplines, levels, and skills to verify everything looks correct.

## Customize your framework

The starter data gives you a complete foundation. Edit the YAML files under
`data/pathway/` to match your organization's engineering expectations.

### Levels

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

### Capabilities and skills

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

### Disciplines

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

After each change, re-validate with `npx fit-map validate` and preview with
`npx fit-pathway dev`.

## Next steps

- [Authoring frameworks](/docs/guides/authoring-frameworks/) -- full guide to
  defining all entity types: levels, disciplines, tracks, capabilities, skills,
  behaviours, stages, and drivers
- [YAML schema reference](/docs/reference/yaml-schema/) -- complete file format
  documentation
