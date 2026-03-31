---
title: "Authoring Frameworks"
description: "Define your engineering framework in YAML — levels, disciplines, tracks, capabilities, skills, behaviours, stages, and drivers."
---

# Authoring Frameworks

Map is the data product that stores your engineering framework definitions.
Teams define what good engineering looks like once, in YAML files, and every
other product in the suite reads from that shared source of truth.

## Position in the Suite

Map separates three concerns that are often tangled together:

- **Storage** — Map owns the canonical definitions
- **Interpretation** — Guide reasons about those definitions in context
- **Presentation** — Pathway and Summit each present a focused view

## How Data is Organized

Framework definitions live in YAML files under a data directory:

```
data/
├── framework.yaml        # Framework metadata and display configuration
├── levels.yaml           # Career levels
├── stages.yaml           # Engineering lifecycle phases
├── drivers.yaml          # Organizational outcomes
├── disciplines/          # Engineering specialties (one file each)
├── tracks/               # Work context modifiers (one file each)
├── behaviours/           # Approaches to work (one file each)
├── capabilities/         # Skill groups with responsibilities (one file each)
└── questions/            # Interview questions (by type subdirectory)
```

Single-entity files (disciplines, tracks, behaviours, capabilities) are named by
identifier — `data/disciplines/software_engineering.yaml`. Collection files
(levels, stages, drivers) contain all entries in one file.

## Framework Configuration

Every framework needs a `framework.yaml` at the root of the data directory. It
defines metadata and display configuration for the Pathway web app.

```yaml
# data/framework.yaml
title: Acme Engineering Pathway
description: Engineering career framework for Acme Corp.
tag: acme
entityDefinitions:
  discipline:
    title: Discipline
    emojiIcon: "\U0001F3AF"
    description: Engineering specialization
  level:
    title: Level
    emojiIcon: "\U0001F4CA"
    description: Career level
  skill:
    title: Skill
    emojiIcon: "\U0001F527"
    description: Technical or professional capability
  behaviour:
    title: Behaviour
    emojiIcon: "\U0001F9E0"
    description: Approach to work
distribution:
  siteUrl: https://pathway.acme.com
```

**Required fields**: `title`.

**Optional fields**: `description`, `tag`, `emojiIcon`, `entityDefinitions`,
`distribution`.

The `entityDefinitions` object controls how each entity type is labelled in the
web app — its title, emoji icon, and description. The `distribution.siteUrl` is
the base URL for the published static site, used by `bunx fit-pathway update` to
download framework bundles.

## Levels

Levels define career progression with base expectations for skill proficiency
and behaviour maturity. Each level sets the baseline that disciplines and tracks
then modify.

```yaml
# data/levels.yaml
- id: L1
  professionalTitle: Engineer I
  managementTitle: Manager I
  ordinalRank: 1
  typicalExperienceRange: "0-2"
  baseSkillProficiencies:
    primary: foundational
    secondary: awareness
    broad: awareness
  baseBehaviourMaturity: emerging
  expectations:
    impactScope: Task-level contributions within a team
    autonomyExpectation: Works with guidance on well-defined tasks

- id: L2
  professionalTitle: Engineer II
  managementTitle: Manager II
  ordinalRank: 2
  typicalExperienceRange: "2-5"
  baseSkillProficiencies:
    primary: working
    secondary: foundational
    broad: awareness
  baseBehaviourMaturity: developing
  expectations:
    impactScope: Feature-level contributions within a team
    autonomyExpectation: Works independently on familiar problems
```

**Required fields**: `id`, `professionalTitle`, `managementTitle`,
`ordinalRank`, `baseSkillProficiencies` (with `primary`, `secondary`, `broad`),
`baseBehaviourMaturity`.

**Optional fields**: `typicalExperienceRange`, `qualificationSummary`,
`breadthCriteria`, `expectations`.

The three skill tiers (`primary`, `secondary`, `broad`) correspond to how a
discipline classifies its skills — core skills use `primary`, supporting skills
use `secondary`, and broad skills use `broad`.

## Disciplines

Disciplines define engineering specialties with T-shaped skill profiles. Each
discipline classifies skills into three tiers and optionally restricts which
tracks and levels apply.

```yaml
# data/disciplines/software_engineering.yaml
specialization: Software Engineering
roleTitle: Software Engineer
isProfessional: true
isManagement: false
coreSkills:
  - code_quality
  - testing
  - system_design
supportingSkills:
  - ci_cd
  - documentation
broadSkills:
  - security
  - observability
validTracks:
  - null
  - platform
  - product
behaviourModifiers:
  analytical_thinking: 1
human:
  roleSummary: >
    {roleTitle}s in {specialization} design, build, and maintain
    software systems.
  professionalRoleSummary: >
    As a {roleName}, you design and build software systems that
    serve your team and organization.
agent:
  identity: >
    You are a {roleName} focused on writing clean, tested,
    well-documented code.
  priority: Code quality and test coverage
  constraints:
    - Never skip tests
    - Never commit secrets
```

**Required fields**: `specialization`, `roleTitle`, `coreSkills` (at least one),
`validTracks`.

**Optional fields**: `isProfessional` (default true), `isManagement` (default
false), `hidden`, `minLevel`, `description`, `supportingSkills`, `broadSkills`,
`behaviourModifiers`, `human`, `agent`.

Use `null` in `validTracks` to allow a trackless (generalist) configuration. An
empty array means no valid track combinations exist.

Skill references in `coreSkills`, `supportingSkills`, and `broadSkills` are
skill IDs defined within capability files. The tier determines which base
proficiency from the level applies during derivation.

## Tracks

Tracks are pure modifiers that adjust skill and behaviour expectations based on
work context. They do not define role types — disciplines do that.

```yaml
# data/tracks/platform.yaml
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
  priority: Infrastructure reliability and developer experience
  constraints:
    - Prefer infrastructure-as-code over manual configuration
```

**Required fields**: `name`.

**Optional fields**: `description`, `roleContext`, `skillModifiers`,
`behaviourModifiers`, `assessmentWeights`, `minLevel`, `agent`.

`skillModifiers` keys are **capability IDs**, not individual skill IDs. A
modifier of `+1` raises the proficiency of every skill in that capability by one
step; `-1` lowers it. Track modifiers can be any integer, while discipline
`behaviourModifiers` are restricted to -1, 0, or 1. Positive skill modifiers are
capped at the level's maximum base proficiency to prevent unrealistic inflation.

## Capabilities

Capabilities group related skills and define responsibilities at each
proficiency level. Track modifiers apply to all skills in a capability at once.

```yaml
# data/capabilities/delivery.yaml
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
    agent:
      name: task-execution
      description: Breaking down and completing engineering tasks
      useWhen: Implementing features, fixing bugs, or completing assigned work
      stages:
        code:
          focus: Complete implementation with tests
          readChecklist:
            - Read the requirements or issue description
            - Identify affected files and dependencies
          confirmChecklist:
            - All tests pass
            - Code follows project conventions
  - id: ci_cd
    name: CI/CD
    human:
      description: Continuous integration and deployment pipelines
      proficiencyDescriptions:
        awareness: >
          Follows existing pipeline configuration and understands
          basic CI/CD concepts.
        foundational: >
          Creates basic pipeline steps and configures standard
          test runners.
        working: >
          Designs multi-stage pipelines and implements caching
          strategies.
        practitioner: >
          Optimizes pipeline performance and designs deployment
          strategies across teams.
        expert: >
          Architects CI/CD platform standards for the organization.
```

**Required fields** (capability): `name`.

**Optional fields** (capability): `id`, `description`, `emojiIcon`,
`ordinalRank`, `professionalResponsibilities`, `managementResponsibilities`,
`skills`.

**Required fields** (skill): `id`, `name`, `human` (with `description` and
`proficiencyDescriptions`).

**Optional fields** (skill): `isHumanOnly`, `agent`, `toolReferences`,
`instructions`, `installScript`, `implementationReference`, `markers`.

### Human and Agent Skill Content

Every skill requires a `human:` section with a `description` and
`proficiencyDescriptions` at all five levels. The optional `agent:` section
defines how AI coding agents apply the skill, with stage-specific checklists
tied to the lifecycle stages.

Skills marked `isHumanOnly: true` are excluded from agent profile generation.

### Tool References

Skills can declare tools that agents need:

```yaml
toolReferences:
  - name: Terraform
    description: Infrastructure as code provisioning
    useWhen: Creating or modifying cloud infrastructure
    url: https://www.terraform.io
    simpleIcon: terraform
```

### Skill Markers

Markers define observable evidence of proficiency at each level, for both humans
and agents:

```yaml
markers:
  awareness:
    human:
      - Follows existing pipeline configuration
    agent:
      - Uses existing CI config without modification
  working:
    human:
      - Designs multi-stage pipelines
      - Implements caching strategies
    agent:
      - Generates multi-stage pipeline configurations
      - Adds caching to pipeline definitions
```

## Behaviours

Behaviours describe mindsets and approaches to work, separate from technical
skills. They use maturity levels instead of proficiency levels.

```yaml
# data/behaviours/analytical_thinking.yaml
name: Analytical Thinking
human:
  description: Breaks down complex problems systematically
  maturityDescriptions:
    emerging: >
      Shows interest in understanding problems before jumping to
      solutions; needs prompting to break down complexity.
    developing: >
      Regularly decomposes problems into smaller parts with some
      guidance; identifies obvious dependencies.
    practicing: >
      Consistently breaks down complex problems, identifies
      root causes, and considers multiple perspectives.
    role_modeling: >
      Influences the team's approach to problem-solving;
      others seek out their analytical perspective.
    exemplifying: >
      Shapes organizational culture around evidence-based
      decision making and systematic analysis.
agent:
  title: Systematic Problem Decomposition
  workingStyle: >
    Break problems into smaller parts before proposing solutions.
    Identify assumptions, dependencies, and risks explicitly.
```

**Required fields**: `name`, `human` (with `description` and
`maturityDescriptions` at all five levels).

**Optional fields**: `agent` (with `title` and `workingStyle`).

## Stages

Stages define the engineering lifecycle — the phases that work moves through
from specification to deployment. Agents use stages to constrain their behaviour
to what is appropriate at each phase.

```yaml
# data/stages.yaml
- id: code
  name: Code
  description: >
    You implement the solution and write tests. Follow the plan
    from the previous stage.
  summary: Implements solutions and writes tests
  constraints:
    - Do not change architecture decisions made during planning
    - Follow the plan from the previous stage
  readChecklist:
    - Read the plan or specification
    - Identify affected files and dependencies
  confirmChecklist:
    - All tests pass
    - Code follows project conventions
    - No security vulnerabilities introduced
  returnFormat:
    - List of files changed
    - Test results summary
  handoffs:
    - targetStage: review
      label: Request Review
      prompt: >
        Implementation complete and tests passing.
        Ready for code review.

- id: review
  name: Review
  description: >
    You review code changes for correctness, style, and
    adherence to the plan.
  summary: Reviews code for correctness and style
  constraints:
    - Do not make implementation changes during review
  handoffs:
    - targetStage: deploy
      label: Approve for Deploy
      prompt: Review complete, changes approved.
    - targetStage: code
      label: Request Changes
      prompt: Changes needed before approval.
```

**Required fields**: `id` (one of: specify, plan, scaffold, code, review,
deploy), `name`.

**Optional fields**: `emojiIcon`, `description`, `summary`, `handoffs`,
`constraints`, `readChecklist`, `confirmChecklist`, `returnFormat`.

## Drivers

Drivers represent organizational outcomes — the business results that effective
engineering produces. They connect skills and behaviours to measurable goals.

```yaml
# data/drivers.yaml
- id: quality
  name: Quality
  description: Delivering reliable, well-tested software
  contributingSkills:
    - testing
    - code_quality
  contributingBehaviours:
    - analytical_thinking

- id: velocity
  name: Velocity
  description: Shipping features at a sustainable pace
  contributingSkills:
    - task_execution
    - ci_cd
  contributingBehaviours:
    - ownership
```

**Required fields**: `id`, `name`.

**Optional fields**: `description`, `contributingSkills`,
`contributingBehaviours`.

## Validation

Validate your framework data at any time:

```sh
bunx fit-map validate
```

This checks that all YAML files conform to the expected schema — required fields
are present, identifiers are consistent, cross-references resolve, and
proficiency levels use valid values.

For additional schema validation including SHACL syntax checks:

```sh
bunx fit-map validate --shacl
```

Run validation before committing changes to catch structural issues early.

## Related Documentation

- [YAML Schema Reference](/docs/reference/yaml-schema/) — full schema
  specification for all entity types
- [Data Model Reference](/docs/reference/model/) — how entities relate to each
  other and how derivation works
- [Getting Started: Leadership](/docs/getting-started/leadership/) — create your
  first framework step by step
- [CLI Reference](/docs/reference/cli/) — complete command documentation for
  `fit-map`
