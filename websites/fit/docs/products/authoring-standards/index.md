---
title: "Authoring Agent-Aligned Engineering Standards"
description: "Turn 'good engineering' into an operational definition so evaluations start from a shared foundation instead of private mental models."
---

Two managers disagree on what "senior" means and neither can point to a written
definition — this guide walks you through defining an engineering standard in
YAML that Map validates and Pathway renders, giving the organization a shared
foundation it can trust.

## Prerequisites

Complete the Map and Pathway getting-started guides before continuing:

- [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/) --
  install Map and initialize a `data/pathway/` directory with starter content.
- [Getting Started: Pathway for Leaders](/docs/getting-started/leaders/pathway/) --
  install Pathway and confirm you can preview the starter standard.

The rest of this guide assumes `npx fit-map validate` passes on the starter data
and `npx fit-pathway dev` renders it.

## How the pieces fit together

A standard is a set of YAML files that answer six questions:

| Question                          | Entity     | File                     |
| --------------------------------- | ---------- | ------------------------ |
| What career levels exist?         | Level      | `levels.yaml`            |
| What engineering specialties?     | Discipline | `disciplines/{id}.yaml`  |
| What work contexts modify roles?  | Track      | `tracks/{id}.yaml`       |
| What skill groups matter?         | Capability | `capabilities/{id}.yaml` |
| How should engineers approach it? | Behaviour  | `behaviours/{id}.yaml`   |
| What business outcomes result?    | Driver     | `drivers.yaml`           |

Skills are defined inside capability files. Every entity carries a `human:`
section for engineers, and most can include an `agent:` section for AI coding
agents. Skills can also carry `instructions`, `references`, and
`toolReferences` that flow into the generated SKILL.md files agents load at
runtime. A discipline classifies skills into three tiers (`coreSkills`,
`supportingSkills`, `broadSkills`), and a level sets the baseline proficiency
expected at each tier (`core`, `supporting`, `broad`). When Pathway generates a
role, these two dimensions combine into concrete expectations.

For complete field definitions, required vs. optional fields, and ID patterns,
see the [YAML Schema Reference](/docs/reference/yaml-schema/).

## Step 1: Define levels

Levels establish the career ladder. Each level sets baseline proficiency for
skills and baseline maturity for behaviours. Start here because every other
entity references levels.

Edit `data/pathway/levels.yaml`. Each entry needs an `id`, titles for
professional and management tracks, and base expectations:

```yaml
# data/pathway/levels.yaml
- id: J040
  professionalTitle: Level I
  managementTitle: Associate
  ordinalRank: 1
  baseSkillProficiencies:
    core: foundational
    supporting: awareness
    broad: awareness
  baseBehaviourMaturity: emerging

- id: J060
  professionalTitle: Level II
  managementTitle: Manager
  ordinalRank: 2
  baseSkillProficiencies:
    core: working
    supporting: foundational
    broad: awareness
  baseBehaviourMaturity: developing
```

Base proficiencies use the five-level skill scale:

| Proficiency    | Autonomy              | Scope                    |
| -------------- | --------------------- | ------------------------ |
| `awareness`    | with guidance         | team                     |
| `foundational` | with minimal guidance | team                     |
| `working`      | independently         | team                     |
| `practitioner` | lead, mentor          | area (2--5 teams)        |
| `expert`       | define, shape         | business unit / function |

Validate after editing:

```sh
npx fit-map validate
```

Expected output:

```text
Validation passed

Data Summary
  Skills       — 20
  ...
  Levels       — 2
```

## Level field conventions

Two fields on each level entry feed string composition in `fit-pathway job`
and have an unstated shape contract. This section names both. Standards
that violate either shape fail `fit-map validate` and `fit-pathway` startup
with a `ContractViolationError` pointing back here.

### `professionalTitle` — rank token

`professionalTitle` is the **rank** the engineer sits at, not the role.
The discipline supplies the role (e.g. `Software Engineer`); Pathway
composes the two into the job title via two branches:

- When `professionalTitle` starts with `Level`, the job title is
  `{roleTitle} {professionalTitle}` (e.g. `Software Engineer Level II`).
- Otherwise the job title is `{professionalTitle} {roleTitle}` (e.g.
  `Senior Software Engineer`).

The second branch produces a duplicated role token whenever the rank token
shares words with the discipline `roleTitle`. To avoid that, the contract
requires:

- A single capitalised word (`Associate`, `Senior`, `Staff`, `Principal`,
  `Distinguished`).
- `Level <roman>` (`Level I`, `Level II`) or `Level <digit>` (`Level 3`).
- The rank token must be **disjoint** (case- and punctuation-insensitive)
  from every discipline's `roleTitle` in the same standard.

Compliant: `professionalTitle: Senior` against
`discipline.roleTitle: Software Engineer` renders `Senior Software Engineer`.

Non-compliant: `professionalTitle: "Engineer"` against the same discipline
renders `Engineer Software Engineer` — `Engineer` is not disjoint from
`Software Engineer`.

### `autonomyExpectation` — base-form verb opener

`autonomyExpectation` is composed into the sentence `You will <value>`
(with the value lower-cased). The first word must be a base-form/imperative
verb so the sentence parses.

Compliant: `Work independently on familiar problems` →
`You will work independently on familiar problems.`

Non-compliant: `Works independently on routine tasks` →
`You will works independently on routine tasks.` Third-person openers
(`Works`, `Owns`, `Drives`, `Leads`, `Defines`) are rejected.

## Step 2: Define capabilities and skills

Capabilities group related skills. When a track modifier targets a capability,
all skills in the group shift together -- they are a cohesive unit.

Create one file per capability in `data/pathway/capabilities/`:

```yaml
# data/pathway/capabilities/delivery.yaml
name: Delivery
description: Ship working software reliably.
ordinalRank: 1

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
```

Every skill requires a `human:` section with `description` and
`proficiencyDescriptions` at all five levels. Use the proficiency scale from
Step 1 to calibrate your descriptions -- "independently resolves incidents"
belongs at `working`; "defines incident response strategy" belongs at `expert`.

### Adding agent content to skills

To make a skill available to AI coding agents, add an `agent:` section:

```yaml
    agent:
      name: task-execution
      description: Breaking down and completing engineering tasks
      useWhen: Implementing features, fixing bugs, or completing work
      focus: Complete implementation with tests
      readChecklist:
        - Read the requirements or issue description
        - Identify affected files and dependencies
      confirmChecklist:
        - All tests pass
        - Code follows project conventions
```

`readChecklist` is a read-do entry gate: the agent reads each item then acts on
it before starting work. `confirmChecklist` is a do-confirm exit gate: the agent
works from memory, then pauses to confirm each item before proceeding. Aim for
5--7 items per list. Each item is a single action starting with a verb -- if it
needs explanation, the `instructions` field is incomplete. Skills that cannot be
automated can be marked `isHumanOnly: true`. For the full skill schema, see the
[YAML Schema Reference](/docs/reference/yaml-schema/).

### Adding instructions to skills

When a skill needs a multi-step workflow beyond what the checklists convey, add
an `instructions:` field. This is a top-level skill field (a sibling of
`agent:`, not nested inside it) whose content renders directly into the
SKILL.md body.

`focus` is a one-line priority; checklists are entry and exit gates;
`instructions` is the procedural workflow the agent follows between those gates.

```yaml
  - id: code_review
    name: Code Review
    human: # ...
    agent:
      name: code-review
      # ... description, useWhen, focus, checklists
    instructions: |
      ## Workflow

      1. Read the PR description to understand intent.
      2. Scan the file list for scope — flag PRs that mix unrelated changes.
      3. Review each file for correctness, edge cases, and naming.
      4. Check test coverage for new behaviour.
      5. Write comments that state the problem, the reason, and a suggestion.
```

Keep instructions imperative. Do not restate what the checklists already cover.

### Adding references to skills

When a skill needs supporting documents the agent can consult -- runbooks,
templates, glossaries, or decision criteria -- add a `references:` array. Each
entry becomes a separate `references/{name}.md` file alongside the SKILL.md.

Each entry requires three fields:

| Field   | Type   | Constraints                                |
| ------- | ------ | ------------------------------------------ |
| `name`  | string | Lowercase with hyphens, 1--64 characters   |
| `title` | string | Human-readable heading for the document    |
| `body`  | string | Markdown content of the reference document |

Names must be unique within a skill and match the pattern
`^[a-z0-9][a-z0-9_-]*$`.

```yaml
  - id: incident_response
    name: Incident Response
    human: # ...
    agent:
      name: incident-response
      # ... description, useWhen, focus, checklists
    references:
      - name: runbooks
        title: Incident Runbooks
        body: |
          Step-by-step procedures for the top recurring incident
          classes. Each runbook lists detection signals, immediate
          mitigations, and the data sources to capture for the
          post-incident review.
      - name: postmortem-template
        title: Postmortem Template
        body: |
          Fields expected in every postmortem:

          - Summary — one paragraph anyone in the company can read.
          - Timeline — UTC timestamps, who did what.
          - Root cause — proximate failure and systemic factor.
          - Corrective actions — owner, due date, tracking link.
```

Instructions describe the workflow; references supply the data that workflow
consults -- templates, examples, and lookup tables. References are declarative
(what the data is), not procedural (what to do with it).

### Adding tool references to skills

When your organization has standardized on specific tools for a skill, declare
them in a `toolReferences:` array. These render as a mandatory tools table in
the generated SKILL.md -- agents are expected to use them and document any
deviation.

Each entry requires `name`, `description`, and `useWhen`. The optional `url`
links to documentation and `simpleIcon` specifies a
[Simple Icons](https://simpleicons.org/) slug for display.

```yaml
    toolReferences:
      - name: GitHub Actions
        url: https://docs.github.com/en/actions
        description: CI/CD workflow automation
        useWhen: Configuring automated builds and deployments
      - name: Terraform
        url: https://developer.hashicorp.com/terraform
        simpleIcon: terraform
        description: Infrastructure as code
        useWhen: Provisioning or modifying cloud infrastructure
```

Only declare tools the team has decided on. If using a different tool is
acceptable, it does not belong in `toolReferences`.

## Step 3: Define disciplines

Disciplines define engineering specialties with T-shaped skill profiles. Each
discipline classifies skills from your capability files into three tiers:

- `coreSkills` -- deep expertise expected (maps to the level's `core`
  proficiency)
- `supportingSkills` -- solid competence expected (maps to `supporting`)
- `broadSkills` -- general awareness expected (maps to `broad`)

```yaml
# data/pathway/disciplines/software_engineering.yaml
specialization: Software Engineering
roleTitle: Software Engineer
isProfessional: true

validTracks:
  - null           # allow trackless (generalist)
  - platform
  - forward_deployed

coreSkills:
  - architecture_design
  - code_quality
  - full_stack_development
supportingSkills:
  - devops
  - cloud_platforms
broadSkills:
  - data_modeling
  - stakeholder_management
```

The `validTracks` array is required. Use `null` to allow a generalist
configuration with no track applied.

Optionally add `behaviourModifiers` (capped at +/-1 for disciplines) and
parallel `human:` / `agent:` sections for role summaries and agent identity.
See the [YAML Schema Reference](/docs/reference/yaml-schema/) for all
discipline fields.

## Step 4: Define tracks

Tracks are pure modifiers -- they adjust expectations based on work context, not
the role itself. "Platform Engineering" is a track; it applies modifiers to
capabilities for any discipline.

Create one file per track in `data/pathway/tracks/`:

```yaml
# data/pathway/tracks/platform.yaml
name: Platform

description: >
  Internal tooling and infrastructure focus. Builds shared
  capabilities that enable other engineering teams.

skillModifiers:
  reliability: 1
  delivery: -1
behaviourModifiers:
  systems_thinking: 1
```

Track `skillModifiers` target capability IDs (not individual skill IDs). A
modifier of `+1` raises all skills in that capability by one proficiency level;
`-1` lowers them by one. Results are clamped to the valid proficiency range.
Track `behaviourModifiers` are not capped like discipline modifiers -- they can
exceed +/-1.

### Adding agent team instructions to tracks

Tracks can carry an `agent:` section with `teamInstructions`:

```yaml
agent:
  teamInstructions: |
    # Platform Team

    ## Conventions
    - **Task runner:** just (see justfile)
    - **Package manager:** pnpm
    - **Test runner:** vitest
```

For guidance on structuring exported agent teams, see the
[Agent Teams guide](/docs/products/agent-teams/).

## Step 5: Define behaviours

Behaviours describe mindsets and approaches to work. They use a five-level
maturity scale:

| Maturity        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `emerging`      | Shows interest, needs prompting                      |
| `developing`    | Regularly applies with some guidance                 |
| `practicing`    | Consistently demonstrates in daily work              |
| `role_modeling` | Influences the team's approach, others seek them out |
| `exemplifying`  | Shapes organizational culture in this area           |

Create one file per behaviour in `data/pathway/behaviours/`:

```yaml
# data/pathway/behaviours/outcome_ownership.yaml
name: Own the Outcome
human:
  description: >
    Business outcomes trump engineering elegance. Embrace extreme
    ownership of what you build -- not just code quality, but
    business relationships, impact metrics, and end-to-end results.
  maturityDescriptions:
    emerging: >
      Takes responsibility for assigned tasks with supervision;
      follows through when reminded
    developing: >
      Owns task completion independently; makes pragmatic
      trade-offs between speed and polish
    practicing: >
      Takes end-to-end ownership of features and business outcomes
    role_modeling: >
      Drives accountability culture focused on outcomes not
      deliverables
    exemplifying: >
      Defines organizational accountability standards focused on
      business impact
```

Every behaviour requires a `human:` section with `description` and
`maturityDescriptions` at all five levels.

## Step 6: Define drivers

Drivers connect your standard to business outcomes. They link skills and
behaviours to the organizational results that effective engineering produces.

Edit `data/pathway/drivers.yaml`:

```yaml
# data/pathway/drivers.yaml
- id: clear_direction
  name: Clear Direction
  description: The degree to which developers understand their team's mission and goals
  contributingSkills:
    - stakeholder_management
    - product_thinking
  contributingBehaviours:
    - systems_thinking

- id: requirements_quality
  name: Requirements Quality
  description: How well specifications are defined for tasks and projects
  contributingSkills:
    - technical_writing
  contributingBehaviours:
    - relentless_curiosity
```

Aim for 3--7 drivers. Each needs an `id` and `name`; the links to skills and
behaviours are optional but make the standard's rationale visible.

## Step 7: Add organizational context (optional)

The organizational context slot carries installation-scoped per-team facts
that do not belong on a track shared across teams. Sibling of the
`claude-settings.yaml` file, the slot is optional -- skip this step if your
installation has no per-team facts to add. When populated, the slot flows
into the rendered `.claude/CLAUDE.md` that `npx fit-pathway agent` writes.

Edit `data/pathway/organizational-context.yaml`:

```yaml
# data/pathway/organizational-context.yaml
repositories: [molecularforge, data-lake-infra, api-gateway]
team: pharma-platform
manager: athena
adjacentLeads:
  - handle: iris
    role: DX
  - handle: prometheus
    role: DS/AI
projects: [drug-discovery-pipeline, lab-data-portal]
escalationPaths:
  - trigger: production page after hours
    destination: pagerduty://pharma-platform-oncall
  - trigger: security incident
    destination: security@pharma.example.com
```

Each top-level concern is optional, so partial population is valid (a team
may know its repos and manager before its escalation paths). The
[Give Agents Organizational Context](/docs/products/agent-teams/organizational-context/)
guide describes the rendered output and the marker contract downstream
tooling depends on. Run `bunx fit-map validate` to confirm the slot parses.

## Step 8: Configure the standard

The `standard.yaml` file at the root of your data directory sets metadata and
display configuration:

```yaml
# data/pathway/standard.yaml
title: Acme Engineering Pathway
description: Agent-aligned engineering standard for Acme Corp
tag: acme
distribution:
  siteUrl: https://pathway.acme.com
```

Only `title` is required. The `distribution.siteUrl` is used by
`npx fit-pathway update` to download standard bundles for installation.

## Verify

Run validation and preview to confirm the standard is complete and correct.

**Validate the structure:**

```sh
npx fit-map validate
```

A passing run confirms all YAML files match the schema, all cross-references
between entities resolve (e.g., skill IDs in `coreSkills` exist in your
capability files), and proficiency levels use valid values.

**Preview in the browser:**

```sh
npx fit-pathway dev
```

Browse the local development server and verify that roles render the T-shape you
expect for each discipline.

**Generate a role to confirm derivation:**

```sh
npx fit-pathway job software_engineering J060 --track=platform
```

Expected output (abbreviated):

```text
Software Engineer II — Platform

Core Skills
  architecture_design      working
  code_quality             working
  full_stack_development   working

Supporting Skills (adjusted by track)
  reliability              working (+1 from platform)
  ...
```

For common validation errors and their fixes, see the
[YAML Schema Reference](/docs/reference/yaml-schema/).

## What's next

<div class="grid">

<!-- part:card:update-standard -->
<!-- part:card:define-role -->
<!-- part:card:../career-paths -->

</div>
