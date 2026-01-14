---
applyTo: "**"
---

# Domain Concepts

> **Data-Driven Model**: This application is data-driven. The model defines the
> schema and derivation logic, but the actual entities are defined in YAML files
> under `data/`. Different installations will have different disciplines,
> tracks, skills, grades, and behaviours. Always use
> `npx pathway <entity> --list` to discover what's available in the current
> installation.

## Core Entities

Each entity answers a specific question about an engineering role:

| Entity           | Question                  | File Location                      |
| ---------------- | ------------------------- | ---------------------------------- |
| **Disciplines**  | What kind of engineer?    | `disciplines/{id}.yaml`            |
| **Grades**       | What career level?        | `grades.yaml`                      |
| **Tracks**       | Where/how do you work?    | `tracks/{id}.yaml`                 |
| **Skills**       | What can you do?          | `capabilities/{id}.yaml` (skills:) |
| **Behaviours**   | How do you approach work? | `behaviours/{id}.yaml`             |
| **Capabilities** | What capability area?     | `capabilities/{id}.yaml`           |
| **Stages**       | What lifecycle phase?     | `stages.yaml`                      |
| **Drivers**      | What outcomes matter?     | `drivers.yaml`                     |
| **Agents**       | How does AI assist?       | `agent:` section in files          |

All entities use **co-located files**: human and agent definitions are in the
same file with `human:` and `agent:` sections. Skills are embedded within
capability files under the `skills:` array.

## Skill Levels (5 levels)

Progression aligned with grades. The five level names are fixed in the model:

| Level          | Description                            |
| -------------- | -------------------------------------- |
| `awareness`    | Learning fundamentals, needs guidance  |
| `foundational` | Can apply basics independently         |
| `working`      | Solid competence, handles ambiguity    |
| `practitioner` | Deep expertise, leads and mentors      |
| `expert`       | Authority, shapes direction across org |

Grades and their mappings to levels are defined in `grades.yaml` and vary per
installation. Use `npx pathway grade --list` to see available grades.

## Behaviour Maturities (5 levels)

| Maturity        | Description                       |
| --------------- | --------------------------------- |
| `emerging`      | Shows interest, needs prompting   |
| `developing`    | Regular practice with guidance    |
| `practicing`    | Consistent application, proactive |
| `role_modeling` | Influences team culture           |
| `exemplifying`  | Shapes organizational culture     |

## Capabilities

Capabilities group skills and define:

- **Track modifiers**: Apply level adjustments to all skills in a capability
- **Responsibilities**: Professional and management responsibilities by level
- **Checklists**: Transition criteria for each lifecycle stage handoff

Capabilities are defined in `data/capabilities/` and vary per installation. Use
`npx pathway capability --list` to see available capabilities.

**Example capabilities** (for illustration only—actual values vary):

| Capability | Description                                         |
| ---------- | --------------------------------------------------- |
| `delivery` | Building and shipping solutions                     |
| `data`     | Working with data at all lifecycle stages           |
| `scale`    | Architecture, quality, and technical sustainability |

Capabilities include `transitionChecklists` with transition criteria for each
handoff:

```yaml
transitionChecklists:
  plan_to_code:
    foundational:
      - Requirements are understood and documented
    working:
      - Technical approach is documented
    practitioner:
      - Cross-team dependencies are coordinated
```

## Track Types

Tracks have two boolean properties that determine responsibility source:

- `isProfessional: true` - IC roles, uses `professionalResponsibilities`
- `isManagement: true` - Manager roles, uses `managementResponsibilities`

Track modifiers use **capability names** to modify all skills in that
capability:

```yaml
skillModifiers:
  delivery: 1 # +1 to ALL delivery skills
  scale: -1 # -1 to ALL scale skills
```

## Stages

Stages define the engineering lifecycle phases. Each stage has specific modes,
tools, constraints, and handoffs to other stages. Stages are defined in
`stages.yaml` and can be customized per installation.

**Example stages** (for illustration only—actual values vary):

| Stage    | Purpose                          |
| -------- | -------------------------------- |
| `plan`   | Research, gather context, design |
| `code`   | Implement, test, iterate         |
| `review` | Verify, approve, document        |

### Stage Properties

- **availableTools**: Available tools in this stage (search, read, edit,
  terminal)
- **constraints**: Restrictions on behaviour in this stage
- **handoffs**: Transitions to other stages with prompts
- **entryCriteria/exitCriteria**: Conditions for entering/leaving the stage

### Checklist Derivation

Checklists are derived from capabilities and applied at stage transitions:

```
Checklist = Handoff × Skills Matrix × Capability Checklists
```

For example, transitioning from Plan to Code at the Working level gathers all
`plan_to_code.working` checklist items from capabilities relevant to the job.

## Job Derivation Formula

```
Job = Discipline x Track x Grade
```

A job's requirements are derived by:

1. Getting base skill levels from Grade (by skill type: primary/secondary/broad)
2. Applying Track modifiers (+1, 0, -1) to capabilities
3. Combining Discipline and Track behaviour modifiers
4. Selecting responsibilities based on track type (professional/management)

## Unified Profile Derivation

Both human jobs and AI agents share the same core derivation logic through
`profile.js`. The key difference is post-processing:

| Consumer  | Filtering                         | Sorting             |
| --------- | --------------------------------- | ------------------- |
| **Jobs**  | None (all skills/behaviours)      | By type, then name  |
| **Agent** | Exclude isHumanOnly, filter broad | By level/maturity ↓ |

### Profile Module (`model/profile.js`)

Provides unified functions used by both job and agent derivation:

```javascript
// Filter functions
filterSkillsForAgent(skillMatrix, track); // Exclude isHumanOnly + broad without positive modifier
filterHumanOnlySkills(skillMatrix); // Exclude isHumanOnly skills
filterBroadWithoutPositiveModifier(skillMatrix, positiveCapabilities);

// Sort functions
sortByLevelDescending(skillMatrix); // Expert first → Awareness last
sortByMaturityDescending(behaviourProfile); // Exemplifying first → Emerging last

// Unified derivation
prepareBaseProfile({ discipline, track, grade, skills, behaviours, options });
prepareAgentProfile({ discipline, track, grade, skills, behaviours }); // Uses AGENT_PROFILE_OPTIONS
```

### Profile Options

```javascript
const AGENT_PROFILE_OPTIONS = {
  excludeHumanOnly: true, // Filter skills with isHumanOnly: true
  excludeBroadWithoutPositiveModifier: true, // Filter broad skills unless capability has positive modifier
  sortByLevel: true, // Sort skills by level descending
  sortByMaturity: true, // Sort behaviours by maturity descending
};
```

## Discipline Skill Tiers

Disciplines define T-shaped profiles with three skill tiers:

| Tier               | Expected Level    | Purpose                 |
| ------------------ | ----------------- | ----------------------- |
| `coreSkills`       | Highest for grade | Core expertise          |
| `supportingSkills` | Mid-level         | Supporting capabilities |
| `broadSkills`      | Lower level       | General awareness       |

## Agent Generation

The pathway generates AI coding agents from the same data that defines human
roles. All entity files use **co-located structure** with `human:` and `agent:`
sections in the same file.

### Co-located File Structure

All entities (skills, disciplines, tracks, behaviours) follow this pattern.

**Example structure** (for illustration only—actual skill IDs and capabilities
vary per installation):

```yaml
id: example_skill
name: Example Skill Name
capability: example_capability
human:
  description: Description of what this skill covers...
  levelDescriptions:
    awareness: ...
    expert: ...
agent:
  name: example-skill-name
  description: Guide for applying this skill...
  body: |
    # Example Skill Name
    ...
```

### Agent Profile Generation

Profiles are generated from discipline × track × stage combinations:

```
Agent Profile = Discipline × Track × Stage
```

Stage determines the agent's available tools and constraints.

Agent profiles include:

- **Core identity**: From track's `agent.coreInstructions` (falls back to
  discipline's `agent.coreInstructions` with template substitution)
- **Capabilities**: Derived from skill matrix
- **Stage context**: Tools, constraints from stage
- **Operational context**: From track's root-level `roleContext`
- **Working style**: From behaviour `agent.workflow` (or `agent.principles`)
- **Constraints**: From discipline, track, and stage
- **Tools**: Defined by stage

### Agent Skill Generation

Skills with an `agent:` section generate SKILL.md files containing:

- **Frontmatter**: name, description (triggering conditions)
- **Body**: Contextual guidance for applying the skill

## Data Validation

Run `npm run validate` to check:

- Required fields on all entities
- Referential integrity (skill/behaviour IDs exist)
- Valid enum values (levels, capabilities, maturities)
- Cross-entity consistency (disciplines reference valid skills)
