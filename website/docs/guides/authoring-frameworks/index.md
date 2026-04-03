---
title: "Authoring Frameworks"
description: "Write career framework definitions in YAML — disciplines, levels, tracks, capabilities, skills, behaviours, stages, and drivers."
---

A career framework is a set of YAML files that define what good engineering
looks like in your organization. These files are the single source of truth for
human job definitions, AI agent teams, interview question banks, and career
progression logic. Author them once and every product in the suite derives its
output from the same data.

## Data Directory Structure

Framework definitions live in a `data/` directory. Each entity type has a
specific location:

```
data/
├── framework.yaml              # Framework metadata and display config
├── levels.yaml                 # Career levels (collection file)
├── stages.yaml                 # Engineering lifecycle phases (collection file)
├── drivers.yaml                # Organizational outcomes (collection file)
├── disciplines/                # Engineering specialties (one file each)
│   ├── software_engineering.yaml
│   └── data_engineering.yaml
├── tracks/                     # Work context modifiers (one file each)
│   ├── platform.yaml
│   └── forward_deployed.yaml
├── behaviours/                 # Approaches to work (one file each)
│   ├── outcome_ownership.yaml
│   └── systems_thinking.yaml
├── capabilities/               # Skill groups (one file each)
│   ├── delivery.yaml
│   ├── reliability.yaml
│   └── ai.yaml
└── questions/                  # Interview question banks (by type)
```

Single-entity files (disciplines, tracks, behaviours, capabilities) are named by
identifier — `disciplines/software_engineering.yaml`. Collection files (levels,
stages, drivers) contain all entries in one file.

Initialize a data directory with example content:

```sh
npx fit-pathway init
```

Validate at any time:

```sh
npx fit-map validate
```

---

## Framework Configuration

Every framework needs a `framework.yaml` at the root of the data directory. It
defines metadata and display configuration for the Pathway web app.

```yaml
# data/framework.yaml
title: Acme Engineering Pathway
description: Engineering career framework for Acme Corp
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
  capability:
    title: Capability
    emojiIcon: "\U0001F4A1"
    description: Grouped skills with responsibilities
distribution:
  siteUrl: https://pathway.acme.com
```

**Required:** `title`

**Optional:** `description`, `tag`, `entityDefinitions`, `distribution`

The `entityDefinitions` object controls how each entity type is labelled in the
web app. The `distribution.siteUrl` is the base URL for the published static
site, used by `npx fit-pathway update` to download framework bundles.

---

## Levels

Levels define career progression with base expectations for skill proficiency
and behaviour maturity. Every level sets three baseline proficiencies
(`primary`, `secondary`, `broad`) that map to how a discipline classifies its
skills (`coreSkills`, `supportingSkills`, `broadSkills`). Disciplines and tracks
then modify these baselines.

### Proficiency Scale

All skills use the same five-level scale:

| Proficiency    | Autonomy              | Scope                    | Typical Verbs                     |
| -------------- | --------------------- | ------------------------ | --------------------------------- |
| `awareness`    | with guidance         | team                     | understand, follow, use, learn    |
| `foundational` | with minimal guidance | team                     | apply, create, explain, identify  |
| `working`      | independently         | team                     | design, own, troubleshoot, decide |
| `practitioner` | lead, mentor          | area (2–5 teams)         | lead, mentor, establish, evaluate |
| `expert`       | define, shape         | business unit / function | define, shape, innovate, pioneer  |

Use the vocabulary standards from this table when writing proficiency
descriptions. "Independently resolves incidents" belongs at `working`; "defines
incident response strategy" belongs at `expert`.

### Example

```yaml
# data/levels.yaml
- id: J040
  professionalTitle: Level I
  managementTitle: Associate
  typicalExperienceRange: "0-2 years"
  ordinalRank: 1
  qualificationSummary:
    Bachelor's degree in Computer Science, Engineering, or related
    field, or equivalent practical experience.
  baseSkillProficiencies:
    primary: foundational
    secondary: awareness
    broad: awareness
  baseBehaviourMaturity: emerging
  expectations:
    impactScope:
      Individual tasks and small features with guidance
    autonomyExpectation:
      Work with close supervision
    influenceScope:
      Contribute to team discussions and learn from colleagues
    complexityHandled:
      Standard tasks with established patterns

- id: J070
  professionalTitle: Level III
  managementTitle: Manager
  typicalExperienceRange: "5+ years"
  ordinalRank: 3
  baseSkillProficiencies:
    primary: working
    secondary: working
    broad: foundational
  baseBehaviourMaturity: emerging
  expectations:
    impactScope:
      Large features and technical initiatives
    autonomyExpectation:
      Self-directed work, seeks input on strategic decisions
    influenceScope:
      Shape team practices and mentor junior engineers
    complexityHandled:
      High complexity with comfort navigating ambiguity

- id: J090
  professionalTitle: Staff
  managementTitle: Senior Manager
  typicalExperienceRange: "9+ years"
  ordinalRank: 4
  baseSkillProficiencies:
    primary: practitioner
    secondary: practitioner
    broad: working
  baseBehaviourMaturity: developing
  breadthCriteria:
    practitioner: 4
  expectations:
    impactScope: Multi-team initiatives with area-wide impact
    autonomyExpectation: Set own direction within broader strategic goals
```

**Required:** `id`, `professionalTitle`, `managementTitle`, `ordinalRank`,
`baseSkillProficiencies` (with `primary`, `secondary`, `broad`),
`baseBehaviourMaturity`

**Optional:** `typicalExperienceRange`, `qualificationSummary`,
`breadthCriteria`, `expectations`

---

## Disciplines

Disciplines define engineering specialties with T-shaped skill profiles. Each
discipline classifies skills into three tiers (core, supporting, broad) and
optionally restricts which tracks and levels apply.

A discipline defines _role types_ through specialization. Tracks are pure
modifiers — they adjust expectations based on work context, not the role type
itself.

### Example

```yaml
# data/disciplines/software_engineering.yaml
specialization: Software Engineering
roleTitle: Software Engineer
isProfessional: true

validTracks:
  - null           # Allow trackless (generalist)
  - forward_deployed
  - platform
  - sre
  - dx

description:
  Builds and maintains software systems, focusing on code quality,
  architecture, and reliable delivery of business value.

coreSkills:
  - architecture_design
  - code_quality
  - full_stack_development
supportingSkills:
  - devops
  - cloud_platforms
  - ai_augmented_development
  - technical_debt_management
broadSkills:
  - data_modeling
  - stakeholder_management
  - technical_writing
  - ai_literacy

behaviourModifiers:
  outcome_ownership: 1
  systems_thinking: 1
  relentless_curiosity: 1
```

**Required:** `specialization`, `roleTitle`, `coreSkills` (at least one),
`validTracks`

**Optional:** `id`, `isProfessional` (default true), `isManagement` (default
false), `hidden`, `minLevel`, `description`, `supportingSkills`, `broadSkills`,
`behaviourModifiers`, `human`, `agent`

### Co-located Human and Agent Content

Disciplines include parallel `human:` and `agent:` sections. Variables in braces
(`{roleTitle}`, `{roleName}`, `{specialization}`) are substituted at render
time.

```yaml
# Continuation of data/disciplines/software_engineering.yaml
human:
  professionalRoleSummary:
    We are seeking a skilled {roleTitle} who will design, build, and
    maintain software systems that deliver business value.
  managementRoleSummary:
    We are seeking an experienced {specialization} leader to build and
    lead high-performing software engineering teams.

agent:
  identity: |
    You are a {roleTitle} agent. Your primary focus is writing
    correct, maintainable, well-tested code.
  priority: |
    Code review is more important than code generation. Every line
    of code you produce must be understood and verified.
  constraints:
    - Do not commit code without running tests
    - Do not make changes without understanding the existing codebase
    - Do not ignore error handling and edge cases
    - Do not over-engineer simple solutions
```

### Field Details

- `validTracks`: Array of valid track combinations. Use `null` to allow
  trackless (generalist) configurations. An empty array means no valid
  configurations.
- `behaviourModifiers`: Integer adjustments to behaviour maturity. Discipline
  modifiers are capped at ±1.
- `coreSkills` / `supportingSkills` / `broadSkills`: Skill IDs from capability
  files. These determine the T-shape of the discipline.

### How Derivation Uses Disciplines

When generating a job, the discipline's skill tiers map to the level's base
proficiencies:

- `coreSkills` → level's `primary` proficiency
- `supportingSkills` → level's `secondary` proficiency
- `broadSkills` → level's `broad` proficiency

Track modifiers then shift these proficiencies up or down per capability.

---

## Tracks

Tracks are pure modifiers that adjust skill and behaviour expectations based on
work context. They do not define role types — _disciplines_ define roles. A
track represents how you work (your context), not who you are.

"Platform Engineering" is a track. It applies modifiers to capabilities for
_any_ discipline. A Software Engineer on the platform track has different
expectations than the same discipline on the product track.

### Example

```yaml
# data/tracks/platform.yaml
name: Platform

description:
  Internal tooling and infrastructure focus. Builds shared
  capabilities that enable other engineering teams.
roleContext:
  In this platform-focused role, you build internal tooling and
  shared infrastructure. You treat the platform as a product —
  building golden paths and optimizing for developer experience.

skillModifiers:
  reliability: 1
  delivery: -1
behaviourModifiers:
  systems_thinking: 1
assessmentWeights:
  skillWeight: 0.6
  behaviourWeight: 0.4

agent:
  identity: |
    You are a Platform {roleTitle} agent focused on building
    self-service capabilities that enable other engineers.
  priority: |
    Developer experience is paramount. Design golden paths,
    maintain backward compatibility, and document everything.
  constraints:
    - Maintain backward compatibility
    - Document breaking changes with migration guides
    - Test changes against consumer use cases
  teamInstructions: |
    # Platform Team

    ## Conventions

    - **Task runner:** just (see justfile)
    - **Package manager:** pnpm
    - **Node version:** pinned in .mise.toml
    - **Test runner:** vitest

    ## Skill Coordination

    | Topic            | Canonical Skill   |
    | ---------------- | ----------------- |
    | Database schemas | data-modeling     |
    | API endpoints    | api-design        |
    | CI/CD pipelines  | ci-cd             |
    | Deployment       | deployment        |
```

**Required:** `name`

**Optional:** `description`, `roleContext`, `skillModifiers`,
`behaviourModifiers`, `assessmentWeights`, `minLevel`, `agent`

### Agent Section

The `agent:` section on a track controls what the exported agent team receives.
All subfields are optional:

- `identity`: Overrides the discipline's `agent.identity`. Use when the track
  fundamentally changes how the agent introduces itself. Supports `{roleTitle}`
  and `{specialization}` template variables.
- `priority`: Overrides the discipline's `agent.priority`.
- `constraints`: Appended to the discipline and stage constraints (not replacing
  them).
- `teamInstructions`: Markdown content written to `.claude/CLAUDE.md` in the
  exported agent team. This is the only field that produces team-level
  instructions. Use it for cross-cutting platform facts, conventions, and skill
  coordination tables — content every agent needs regardless of stage. See the
  [Agent Teams guide](/docs/guides/agent-teams/#layer-1-team-instructions-claudemd)
  for what to include and exclude.

### Modifier Mechanics

- `skillModifiers`: Keys are capability IDs, not individual skill IDs. A
  modifier of `+1` raises all skills in that capability by one proficiency
  level. A modifier of `-2` lowers them by two. Results are clamped to the valid
  proficiency range.
- `behaviourModifiers`: Integer adjustments to behaviour maturity. Track
  behaviour modifiers are not capped like discipline modifiers — they can exceed
  ±1.
- `minLevel`: If set, this track only applies at the specified level and above.

Skills from capabilities the track modifies positively — but that aren't in the
base discipline — are added as broad-type "track-added" skills.

---

## Capabilities

Capabilities group related skills and define responsibilities at each
proficiency level. When a track applies a modifier to a capability, all skills
in that capability shift together — they are a cohesive unit.

### Example

```yaml
# data/capabilities/delivery.yaml
id: delivery
name: Delivery
emojiIcon: 🚀
ordinalRank: 1
description: Ship working software reliably.

professionalResponsibilities:
  awareness:
    Follow deployment checklists and team workflows
  foundational:
    Complete deployment tasks with minimal guidance
  working:
    Own the deployment pipeline for your team
  practitioner:
    Design deployment strategy across multiple teams
  expert:
    Define organization-wide delivery practices

managementResponsibilities:
  awareness:
    Understand the team's deployment process
  foundational:
    Ensure team follows deployment standards
  working:
    Optimize team delivery throughput
  practitioner:
    Coordinate delivery across multiple teams
  expert:
    Shape organizational delivery culture

skills:
  - id: task_execution
    name: Task Execution
    # ... (see Skills section for full skill definitions)
  - id: ci_cd
    name: CI/CD
    # ...
```

**Required:** `name`

**Optional:** `id`, `description`, `emojiIcon`, `ordinalRank`,
`professionalResponsibilities`, `managementResponsibilities`, `skills`

---

## Skills

Skills are the most detailed entity in the framework. Each skill lives inside a
capability file and requires a `human:` section (for engineers) and optionally
an `agent:` section (for AI agents).

### Minimal Skill

Every skill requires a human section with a description and proficiency
descriptions at all five levels:

```yaml
skills:
  - id: task_execution
    name: Task Execution
    human:
      description:
        Breaking down and completing engineering work
      proficiencyDescriptions:
        awareness:
          Understands the team's delivery workflow and follows
          guidance to complete assigned tasks.
        foundational:
          Breaks work into steps, estimates effort, and completes
          tasks with minimal guidance.
        working:
          Independently plans and delivers work, adjusting approach
          when requirements change.
        practitioner:
          Leads delivery across multiple workstreams, mentoring
          others on effective execution.
        expert:
          Defines delivery practices that scale across the
          organization.
```

### Adding Agent Content

The `agent:` section turns a human skill definition into operational guidance
for AI agents. It includes a name, description, when to use the skill, and
stage-specific checklists:

```yaml
skills:
  - id: task_execution
    name: Task Execution
    human:
      description: Breaking down and completing engineering work
      proficiencyDescriptions:
        awareness: # ...
        foundational: # ...
        working: # ...
        practitioner: # ...
        expert: # ...
    agent:
      name: task-execution
      description: Breaking down and completing engineering tasks
      useWhen: Implementing features, fixing bugs, or completing work
      stages:
        code:
          focus: Complete implementation with tests
          readChecklist:
            - Read the requirements or issue description
            - Identify affected files and dependencies
          confirmChecklist:
            - All tests pass
            - Code follows project conventions
```

### Writing Good Checklists

Checklists are the skill's primary interface with agents. They must be scannable
and actionable — agents parse them mechanically.

**Good checklist items** — one action, one line:

```yaml
readChecklist:
  - Read the requirements or issue description
  - Identify affected files and dependencies
  - Understand the current test coverage
confirmChecklist:
  - All tests pass
  - Code follows project conventions
  - No security vulnerabilities introduced
```

**Bad checklist items** — narrative with the action buried inside:

```yaml
readChecklist:
  - "The cloud instance provisioned by the platform has pgvector
     already enabled. The CI/CD pipeline handles migrations
     automatically when it detects OIDC secrets — just ensure
     drizzle-kit is installed, drizzle.config.ts exists, and
     migration SQL files are committed"
```

**Rules:**

- One action per item, one line (≤ 120 chars ideal, ≤ 200 max)
- Start with a verb: Read, Create, Verify, Configure, Install
- Move explanatory context to the skill's `instructions` field
- Move code examples to `implementationReference`
- If an item contains "because," "note that," or "when X then Y" — it is too
  long. Split it or move the explanation.

For guidance on standardizing shared checklist items across skills and avoiding
common structural mistakes, see the
[Agent Teams guide](/docs/guides/agent-teams/#checklist-quality).

### Human-Only Skills

Skills that can't be automated (mentoring, cultural practices, physical
presence) should be marked `isHumanOnly: true`. They are excluded from agent
team export:

```yaml
skills:
  - id: mentoring
    name: Mentoring
    isHumanOnly: true
    human:
      description: Growing other engineers through guidance
      proficiencyDescriptions:
        awareness: # ...
```

### Tool References

Skills can declare tools that agents need. These are collected during derivation
and exported with the agent team:

```yaml
toolReferences:
  - name: GitHub Copilot
    url: https://docs.github.com/en/copilot
    simpleIcon: githubcopilot
    description: AI coding agent integrated into VS Code
    useWhen: AI-assisted code completion and generation
  - name: Claude Code
    url: https://docs.anthropic.com/en/docs/claude-code
    simpleIcon: claude
    description: Terminal-based AI coding agent
    useWhen: Terminal-based AI coding with agentic control
```

### Skill Markers

Markers define observable evidence of proficiency, for both humans and agents.
They answer: "How would you know someone has this skill at this level?"

```yaml
markers:
  awareness:
    human:
      - Follows existing pipeline configuration
      - Understands basic CI/CD terminology
    agent:
      - Uses existing CI config without modification
  working:
    human:
      - Designs multi-stage pipelines
      - Implements caching strategies
      - Troubleshoots pipeline failures independently
    agent:
      - Generates multi-stage pipeline configurations
      - Adds caching to pipeline definitions
  practitioner:
    human:
      - Optimizes pipeline performance
      - Designs deployment strategies across teams
```

Markers describe observable behavior, not effort. "Designs multi-stage
pipelines" — not "Tries hard to learn about pipelines."

### Advanced Skill Fields

For skills that need richer structure, additional fields support instructions,
install scripts, and implementation references:

```yaml
skills:
  - id: ai_evaluation
    name: AI Evaluation & Observability
    human:
      description: Building evaluation frameworks for AI/LLM systems
      proficiencyDescriptions:
        awareness: # ...
        foundational: # ...
        working: # ...
        practitioner: # ...
        expert: # ...
    agent:
      name: ai-evaluation-observability
      description: Guide for building AI evaluation systems
      useWhen: Instrumenting AI applications or creating evaluation datasets
      stages:
        specify:
          focus: Define evaluation requirements
          readChecklist:
            - Identify quality dimensions that matter
            - Document expected inputs, outputs, and criteria
          confirmChecklist:
            - Quality dimensions are documented
            - Evaluation criteria are clear
        scaffold:
          focus: Set up evaluation environment
          readChecklist:
            - Install evaluation tools
            - Configure API keys
          confirmChecklist:
            - SDK installed and connected
            - Environment is reproducible
        code:
          focus: Implement tracing, datasets, and evaluators
          readChecklist:
            - Instrument application with tracing
            - Create datasets from production data
          confirmChecklist:
            - Tracing captures execution flow
            - Evaluators produce consistent scores
    instructions: |
      Focus on tracing first — instrument the application before
      building evaluators. Create golden datasets from real
      production data, not synthetic examples.
    installScript: |
      uv sync
    implementationReference: |
      See the Langfuse Python SDK docs for tracing patterns.
```

---

## Behaviours

Behaviours describe mindsets and approaches to work, separate from technical
skills. They use five maturity levels instead of proficiency levels:

| Maturity        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `emerging`      | Shows interest, needs prompting                      |
| `developing`    | Regularly applies with some guidance                 |
| `practicing`    | Consistently demonstrates in daily work              |
| `role_modeling` | Influences the team's approach, others seek them out |
| `exemplifying`  | Shapes organizational culture in this area           |

### Example

```yaml
# data/behaviours/outcome_ownership.yaml
name: Own the Outcome
human:
  description:
    Business outcomes trump engineering elegance. Embrace extreme
    ownership of what you build — not just code quality, but business
    relationships, impact metrics, and end-to-end results.
  maturityDescriptions:
    emerging:
      Takes responsibility for assigned tasks with supervision;
      follows through when reminded; asks for help appropriately
    developing:
      Owns task completion independently; reviews AI-generated code
      critically; makes pragmatic trade-offs between speed and polish
    practicing:
      Takes end-to-end ownership of features and business outcomes;
      accepts technical debt intentionally when it accelerates value
    role_modeling:
      Drives accountability culture focused on outcomes not
      deliverables; owns business relationships and impact metrics
    exemplifying:
      Defines organizational accountability standards focused on
      business impact; shapes industry practices around outcome
      ownership

agent:
  title: Own the outcome end-to-end
  workingStyle: |
    At each step:
    1. Define success criteria before starting
    2. Verify the change achieves the criteria
    3. Don't hand off until you've validated the work
```

**Required:** `name`, `human` (with `description` and `maturityDescriptions` at
all five levels)

**Optional:** `id`, `agent` (with `title` and `workingStyle`)

---

## Stages

Stages define the engineering lifecycle — the phases work moves through from
specification to deployment. Agents use stages to understand what they should
and should not do at each phase.

### Standard Stages

| Stage      | Purpose                             |
| ---------- | ----------------------------------- |
| `specify`  | Author requirements and criteria    |
| `plan`     | Design solutions, create plans      |
| `scaffold` | Generate project structure          |
| `code`     | Implement solutions and write tests |
| `review`   | Review code for correctness         |
| `deploy`   | Ship changes to production          |

### Example

```yaml
# data/stages.yaml
- id: code
  name: Code
  emojiIcon: "💻"
  summary:
    Implements solutions and writes tests
  description:
    Your primary task is to implement the solution and write tests.
    Follow the plan from the previous stage.
  constraints:
    - Do not change architecture decisions made during planning
    - Implement exactly what the plan specifies
    - Do not change specs without consulting the planner
  readChecklist:
    - Read the plan or specification
    - Identify affected files and dependencies
    - Understand the current test coverage
  confirmChecklist:
    - All tests pass
    - Code follows project conventions
    - No security vulnerabilities introduced
    - Implementation matches the plan
  returnFormat:
    - List of files changed
    - Test results summary
    - Any deviations from the plan noted
  handoffs:
    - targetStage: review
      label: Request Review
      prompt:
        Implementation complete and all tests passing.
        Ready for code review.

- id: review
  name: Review
  emojiIcon: "🔍"
  summary:
    Reviews code for correctness and style
  description:
    You review code changes for correctness, style, and adherence
    to the plan. Provide constructive feedback.
  constraints:
    - Do not make implementation changes during review
    - Do not approve if tests fail
  readChecklist:
    - Read the plan or specification
    - Review the code changes
    - Check test coverage
  confirmChecklist:
    - Implementation matches the plan
    - No logical errors or edge cases missed
    - Code follows conventions
    - Tests pass
  handoffs:
    - targetStage: deploy
      label: Approve for Deploy
      prompt: Code review complete. Changes approved for deployment.
    - targetStage: code
      label: Request Changes
      prompt: Changes needed before approval.
```

**Required:** `id`, `name`

**Optional:** `emojiIcon`, `description`, `summary`, `handoffs`, `constraints`,
`readChecklist`, `confirmChecklist`, `returnFormat`

### Field Details

- `constraints`: What the agent must not do at this stage
- `readChecklist`: What to read or understand before starting
- `confirmChecklist`: What to verify before handoff
- `returnFormat`: What output the agent should provide
- `handoffs`: Transitions to next stages with labels and prompts

---

## Drivers

Drivers represent organizational outcomes — the business results that effective
engineering produces. They connect skills and behaviours to measurable goals.

```yaml
# data/drivers.yaml
- id: clear_direction
  name: Clear Direction
  description:
    The degree to which developers understand their team's mission,
    goals, and alignment with the greater organization
  contributingSkills:
    - service_management
    - stakeholder_management
    - product_thinking
  contributingBehaviours:
    - polymathic_knowledge
    - systems_thinking

- id: requirements_quality
  name: Requirements Quality
  description:
    How well specifications are defined for tasks and projects
  contributingSkills:
    - technical_writing
    - problem_discovery
  contributingBehaviours:
    - relentless_curiosity
    - precise_communication
```

**Required:** `id`, `name`

**Optional:** `description`, `contributingSkills`, `contributingBehaviours`

Aim for 3–7 drivers — fewer is better. Use business-friendly IDs, not technical
jargon.

---

## Validation

Validate framework data at any time:

```sh
npx fit-map validate
```

This checks that all YAML files conform to the expected schema — required fields
are present, identifiers are consistent, cross-references resolve, and
proficiency levels use valid values.

### Common Validation Errors

| Error                     | Typical Cause                                            | Fix                                                              |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Cross-reference mismatch  | Skill ID in `coreSkills` doesn't exist in any capability | Check spelling against actual skill IDs in capability files      |
| Invalid proficiency level | Using a non-standard level like `intermediate`           | Use only: awareness, foundational, working, practitioner, expert |
| Missing required field    | A skill is missing `human.proficiencyDescriptions`       | Add the missing field at all five proficiency levels             |
| Duplicate ID              | Two entities share the same identifier                   | Rename one to be unique                                          |

### Preview Changes

After editing YAML files, preview the results in the Pathway web app:

```sh
npx fit-pathway dev
```

This starts a local development server so you can see how your framework renders
before publishing.

---

## Related Guides

- [Agent Teams](/docs/guides/agent-teams/) — How to structure and maintain
  exported agent teams from your framework
- [Career Paths](/docs/guides/career-paths/) — Browse jobs, skills, and career
  progression between levels
