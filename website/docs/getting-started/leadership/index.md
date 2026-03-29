---
title: "Getting Started: Leadership"
description: "Author your first engineering framework — create YAML definitions, validate, and preview."
---

# Getting Started: Leadership

This guide walks you through creating your first engineering framework. By the
end you will have a minimal set of YAML definitions that validate and preview in
the browser.

## Prerequisites

- Node.js 18+
- npm

## Install

Install the packages directly:

```sh
npm install @forwardimpact/map @forwardimpact/pathway
```

Or clone the monorepo:

```sh
git clone https://github.com/forwardimpact/monorepo.git
cd monorepo
npm install
```

## Create your first framework

Framework definitions live in YAML files under a `data/` directory. You need
three files to get started: levels, a capability with at least one skill, and a
discipline that references it.

### Define levels

Create `data/levels.yaml` with your level definitions. Each level sets baseline
expectations for skill proficiency and behaviour maturity.

```yaml
levels:
  - id: L1
    title: Junior Engineer
    baseSkillProficiencies:
      core: foundational
      supporting: awareness
      broad: awareness
    baseBehaviourMaturity: emerging

  - id: L2
    title: Engineer
    baseSkillProficiencies:
      core: working
      supporting: foundational
      broad: awareness
    baseBehaviourMaturity: developing

  - id: L3
    title: Senior Engineer
    baseSkillProficiencies:
      core: practitioner
      supporting: working
      broad: foundational
    baseBehaviourMaturity: practicing
```

### Define a capability and skill

Create `data/capabilities/delivery.yaml` with one capability containing a skill.
Each skill has a `human:` section describing what the proficiency levels mean
for people.

```yaml
id: delivery
title: Delivery
description: Ship working software reliably.
skills:
  - id: task_execution
    title: Task Execution
    human:
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

Create `data/disciplines/software_engineering.yaml` referencing your capability.

```yaml
id: software_engineering
title: Software Engineering
type: professional
coreSkills:
  - delivery/task_execution
```

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

## Next steps

- [Authoring frameworks](/docs/guides/authoring-frameworks/) -- full guide to
  defining skills, behaviours, tracks, and stages
- [YAML schema reference](/docs/reference/yaml-schema/) -- complete file format
  documentation
