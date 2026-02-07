---
applyTo: "**"
---

# Domain Concepts

This document describes the **business domain**: entities, their relationships,
and semantics. For technical implementation details (job derivation, agent
generation mechanics), see `architecture.instructions.md`.

> **Data-Driven Model**: The model defines schema and derivation logic, but
> actual entities are defined in YAML files under `apps/schema/examples/`. Use
> `npx fit-pathway <entity> --list` to discover what's available.

## Core Entities

| Entity           | Question                  | File Location                       |
| ---------------- | ------------------------- | ----------------------------------- |
| **Disciplines**  | What kind of engineer?    | `disciplines/{id}.yaml`             |
| **Grades**       | What career level?        | `grades.yaml`                       |
| **Tracks**       | Where/how do you work?    | `tracks/{id}.yaml`                  |
| **Skills**       | What can you do?          | `capabilities/{id}.yaml` (skills:)  |
| **Behaviours**   | How do you approach work? | `behaviours/{id}.yaml`              |
| **Capabilities** | What capability area?     | `capabilities/{id}.yaml`            |
| **Stages**       | What lifecycle phase?     | `stages.yaml`                       |
| **Drivers**      | What outcomes matter?     | `drivers.yaml`                      |
| **Tools**        | What utilities to use?    | Derived from skill `toolReferences` |

All entities use **co-located files** with `human:` and `agent:` sections.

## Skill Levels

| Level          | Description                           |
| -------------- | ------------------------------------- |
| `awareness`    | Learning fundamentals, needs guidance |
| `foundational` | Can apply basics independently        |
| `working`      | Solid competence, handles ambiguity   |
| `practitioner` | Deep expertise, leads and mentors     |
| `expert`       | Authority, shapes org direction       |

## Skill Structure

Skills are defined within capability files and include:

| Property                  | Required | Description                                             |
| ------------------------- | -------- | ------------------------------------------------------- |
| `id`                      | Yes      | Unique identifier (snake_case)                          |
| `name`                    | Yes      | Human-readable name                                     |
| `human`                   | Yes      | Human-specific content (description, levelDescriptions) |
| `agent`                   | No       | Agent-specific content for AI skill generation          |
| `toolReferences`          | No       | Required tools with usage guidance                      |
| `implementationReference` | No       | Code examples shared by human and agent                 |
| `isHumanOnly`             | No       | If true, excluded from agent profiles                   |

### Agent Skill Sections

Skills with `agent:` sections generate SKILL.md files for AI coding agents:

```yaml
agent:
  name: skill-name-kebab-case # Required, kebab-case
  description: Brief description
  useWhen: When to apply this skill
  stages:
    plan:
      focus: What to accomplish
      activities: [...]
      ready: [...]
    code:
      focus: ...
```

Stage-specific guidance includes: `specify`, `plan`, `code`, `review`, `deploy`.

## Tools

Tools are derived from `toolReferences` arrays within skills. They aggregate
required utilities across all skills with guidance on when to use them.

| Property      | Required | Description                |
| ------------- | -------- | -------------------------- |
| `name`        | Yes      | Tool name                  |
| `description` | Yes      | What the tool does         |
| `useWhen`     | Yes      | When to use this tool      |
| `url`         | No       | Link to tool documentation |

```yaml
toolReferences:
  - name: Langfuse
    url: https://langfuse.com/docs
    description: LLM observability and evaluation platform
    useWhen: Instrumenting AI applications with tracing
```

Tools are not stored separately—they're extracted and aggregated from skills at
runtime via `npx fit-pathway tool`.

## Behaviour Maturities

| Maturity        | Description                       |
| --------------- | --------------------------------- |
| `emerging`      | Shows interest, needs prompting   |
| `developing`    | Regular practice with guidance    |
| `practicing`    | Consistent application, proactive |
| `role_modeling` | Influences team culture           |
| `exemplifying`  | Shapes organizational culture     |

## Capabilities

Capabilities group skills and define:

- **Track modifiers**: Level adjustments to all skills in a capability
- **Responsibilities**: Professional/management responsibilities by level
- **Checklists**: Transition criteria for stage handoffs

```yaml
transitionChecklists:
  plan_to_code:
    working:
      - Technical approach is documented
```

## Tracks

Tracks are pure modifiers—they adjust skill/behaviour expectations without
defining role types. Modifiers use capability names:

```yaml
skillModifiers:
  delivery: 1 # +1 to ALL delivery skills
  scale: -1 # -1 to ALL scale skills
```

## Disciplines

Disciplines define role types and valid tracks:

- `isProfessional: true` — IC roles, uses `professionalResponsibilities`
- `isManagement: true` — Manager roles, uses `managementResponsibilities`
- `validTracks: [...]` — Valid track configurations (`null` = trackless allowed)
- `minGrade: <grade_id>` — Minimum grade (optional)

### Skill Tiers (T-shaped profiles)

| Tier               | Expected Level    | Purpose                 |
| ------------------ | ----------------- | ----------------------- |
| `coreSkills`       | Highest for grade | Core expertise          |
| `supportingSkills` | Mid-level         | Supporting capabilities |
| `broadSkills`      | Lower level       | General awareness       |

## Stages

Stages define engineering lifecycle phases with:

- **constraints**: Restrictions on behaviour
- **handoffs**: Transitions to other stages with prompts
- **readChecklist/confirmChecklist**: Read-Then-Do and Do-Then-Confirm
  checklists

Checklists are derived at stage transitions by gathering items from relevant
capabilities at the job's skill level.

## Data Validation

Run `npx fit-schema validate` to check required fields, referential integrity,
valid enum values, and cross-entity consistency.
