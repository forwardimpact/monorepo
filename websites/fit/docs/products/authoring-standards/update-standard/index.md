---
title: "Validate and Update the Standard"
description: "Evolve your engineering standard with confidence — structural mistakes surface during validation, not after the team has adopted the change."
---

You need to update your agent-aligned engineering standard -- add a skill,
adjust a level description, rename a behaviour -- and confirm the result is
structurally sound before anyone else sees it.

## Prerequisites

Complete the
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
guide first -- this page assumes you have a working standard that already passes
validation.

## Edit the YAML

Open the file for the entity you want to change. The table below shows where
each entity lives:

| Entity     | Location                       |
| ---------- | ------------------------------ |
| Level      | `data/pathway/levels.yaml`     |
| Capability | `data/pathway/capabilities/`   |
| Discipline | `data/pathway/disciplines/`    |
| Track      | `data/pathway/tracks/`         |
| Behaviour  | `data/pathway/behaviours/`     |
| Driver     | `data/pathway/drivers.yaml`    |

Skills are defined inside capability files, not in their own directory.

Make your change. For example, to add a new skill to an existing capability:

```yaml
# data/pathway/capabilities/delivery.yaml
skills:
  - id: task_execution
    name: Task Execution
    human:
      description: Breaking down and completing engineering work
      proficiencyDescriptions:
        awareness: Follows guidance to complete assigned tasks
        foundational: Breaks work into steps with minimal guidance
        working: Independently plans and delivers work
        practitioner: Leads delivery across multiple workstreams
        expert: Defines delivery practices that scale across the organization

  - id: release_management
    name: Release Management
    human:
      description: Coordinating and shipping production releases
      proficiencyDescriptions:
        awareness: Follows release checklists with guidance
        foundational: Runs standard releases with minimal guidance
        working: Independently manages release cycles
        practitioner: Designs release processes across multiple products
        expert: Defines release strategy at the organizational level
```

Every skill requires `proficiencyDescriptions` at all five levels (`awareness`,
`foundational`, `working`, `practitioner`, `expert`). Missing levels cause a
schema error.

## Run validation

After editing, run Map validation against your data directory:

```sh
npx fit-map validate
```

A passing run prints the data summary:

```text
Validation passed

Data Summary
  Skills       — 3
  Behaviours   — 1
  Disciplines  — 1
  Tracks       — 2
  Levels       — 2
  Drivers      — 3
```

Check the Skills count -- it should reflect the skill you added or removed.

## Fix validation errors

If validation fails, the output names the error type and location:

```text
Validation failed

Errors
  - SCHEMA_VALIDATION: must have required property 'foundational' (capabilities/delivery.yaml/skills/1/human/proficiencyDescriptions)
```

Common error types and what they mean:

| Error type            | Cause                                                        | Fix                                                      |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `SCHEMA_VALIDATION`   | A YAML file does not match the JSON schema                   | Check required fields and allowed values                 |
| `INVALID_REFERENCE`   | An entity references an ID that does not exist               | Correct the ID or create the missing entity              |
| `DUPLICATE_ID`        | Two entities share the same ID                               | Rename one of the duplicates                             |
| `MISSING_REQUIRED`    | A required entity type has no entries                        | Add at least one entry for that entity type              |

After fixing, run `npx fit-map validate` again. Repeat until validation passes.

## Assign the new skill to a discipline

Skip this step if you did not add a new skill.

If you added a skill, it needs to appear in at least one discipline's tier
arrays. Otherwise Pathway cannot place it in a role. Open the relevant
discipline file and add the skill ID to `coreSkills`, `supportingSkills`, or
`broadSkills`:

```yaml
# data/pathway/disciplines/software-engineering.yaml
coreSkills:
  - architecture-design
  - code-quality
  - full-stack-development
  - release-management        # newly added
```

Run validation again -- Map checks that every skill ID referenced in a
discipline exists in your capability files:

```sh
npx fit-map validate
```

A misspelled skill ID produces an `INVALID_REFERENCE` error:

```text
Errors
  - INVALID_REFERENCE: Discipline 'software-engineering' references unknown skill 'release_managment' (disciplines/software-engineering)
```

## Preview the result

Once validation passes, preview the rendered standard to confirm the change
looks right:

```sh
npx fit-pathway dev
```

Browse the local development server and check that the updated entity appears
where you expect it -- correct proficiency levels, correct discipline
placement, correct track modifiers applied.

## Verify

The update is complete when all three conditions are true:

1. `npx fit-map validate` passes with no errors.
2. The Data Summary counts match what you expect (e.g., one more skill than
   before).
3. `npx fit-pathway dev` renders the change correctly in the browser.

For the full field reference -- required vs. optional fields, ID patterns, and
allowed values -- see the
[YAML Schema Reference](/docs/reference/yaml-schema/).

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
