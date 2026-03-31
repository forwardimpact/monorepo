---
title: "Getting Started: Leadership"
description: "Author your first engineering framework — create YAML definitions, validate, and preview."
---

# Getting Started: Leadership

This guide walks you through creating your first engineering framework. By the
end you will have a minimal set of YAML definitions that validate and preview in
the browser.

## Prerequisites

- Bun 1.0+

## Install

Install the packages directly:

```sh
bun install @forwardimpact/map @forwardimpact/pathway
```

Or clone the monorepo:

```sh
git clone https://github.com/forwardimpact/monorepo.git
cd monorepo
bun install
```

## Create your first framework

Framework definitions live in YAML files under a `data/` directory. You need
three files to get started: levels, a capability with at least one skill, and a
discipline that references it.

### Define levels

Create `data/levels.yaml` with your level definitions. Each level sets baseline
expectations for skill proficiency and behaviour maturity.

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

- id: L3
  professionalTitle: Senior Engineer
  managementTitle: Senior Manager
  ordinalRank: 3
  baseSkillProficiencies:
    primary: practitioner
    secondary: working
    broad: foundational
  baseBehaviourMaturity: practicing
```

### Define a capability and skill

Create `data/capabilities/delivery.yaml` with one capability containing a skill.
Each skill needs a `human:` section with a description and proficiency
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

### Define a discipline

Create `data/disciplines/software_engineering.yaml` referencing your capability
skill.

```yaml
specialization: Software Engineering
roleTitle: Software Engineer
coreSkills:
  - task_execution
validTracks:
  - null
```

Use `null` in `validTracks` to allow a trackless (generalist) configuration.

## Validate

Run the validator to check your YAML files against the schema:

```sh
bunx fit-map validate
```

Fix any errors the validator reports before moving on.

## Preview

Start the development server to see your framework in the browser:

```sh
bunx fit-pathway dev
# Open http://localhost:3000
```

Browse disciplines, levels, and skills to verify everything looks correct.

## Next steps

- [Authoring frameworks](/docs/guides/authoring-frameworks/) -- full guide to
  defining all entity types: levels, disciplines, tracks, capabilities, skills,
  behaviours, stages, and drivers
- [YAML schema reference](/docs/reference/yaml-schema/) -- complete file format
  documentation
