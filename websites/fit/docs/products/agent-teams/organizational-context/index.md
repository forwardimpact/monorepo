---
title: "Give Agents Organizational Context"
description: "Keep agents aligned as your engineering standard evolves — guidance stays clear and non-conflicting without manual reconciliation."
---

You generated an agent team and it works -- now you need to add organizational
context like deployment targets, platform conventions, and team-specific
constraints. This guide shows where each type of guidance belongs and how to keep
it consistent as the standard evolves.

## Prerequisites

Complete the
[Configure Agents to Meet Your Engineering Standard](/docs/products/agent-teams/)
guide first -- this page assumes you have a working agent team generated with
`npx fit-pathway agent`.

## Use the organizational context slot

The organizational context slot carries **installation-scoped** per-team facts
that do not belong on a track shared across teams: the repository names this
team works in, the manager handle, adjacent leads on neighbouring teams, the
active project list, and the escalation paths. Edit
`data/pathway/organizational-context.yaml` (sibling of `claude-settings.yaml`)
and the section reaches every agent the next time you regenerate. The starter
template ships a populated example; replace the placeholder values or delete
the file if your installation has no per-team facts to add.

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

After `npx fit-pathway agent`, the rendered `.claude/CLAUDE.md` carries the
section:

```markdown
## Organizational Context

- **Repositories:** molecularforge, data-lake-infra, api-gateway
- **Team:** pharma-platform
- **Manager:** athena
- **Adjacent leads:** iris (DX), prometheus (DS/AI)
- **Projects:** drug-discovery-pipeline, lab-data-portal
- **Escalation paths:**
  - production page after hours → pagerduty://pharma-platform-oncall
  - security incident → security@pharma.example.com
```

A top-level concern that has no value (or is an empty list) suppresses its
bullet — partial population is valid. An entirely empty or absent slot
suppresses the whole section, so the generator produces the same bytes it
produced before the slot existed.

Use the slot for facts that change with the team. Use the track-scoped
`teamInstructions` for facts that match the track everywhere it is used. The
slot lives at the installation level; `teamInstructions` lives on the track
and contaminates every other team that hires that track. Run `bunx fit-map
validate` to confirm your slot parses.

## Marker contract for downstream tooling

Tooling that consumes the rendered `.claude/CLAUDE.md` locates the
organizational context section by string match. The contract:

- The section opens with the literal line `## Organizational Context`.
- Downstream tools detect the section by exact-string match on that line.
- **Tooling that needs the unique occurrence MUST match the LAST occurrence
  of `## Organizational Context` in the file.** The section is always appended
  last; the final match is robust against the unlikely case that a track author
  writes that heading inside `teamInstructions` prose.

A worked example:

```sh
awk '/^## Organizational Context$/{i=NR} END{print i}' .claude/CLAUDE.md
```

prints the line number of the section in any CLAUDE.md that has one.

## Understand the architecture

Pathway generates agent configurations into three layers backed by the
installation-scoped slot above. Each layer has a distinct purpose, and
information flows downward -- never upward.

```text
.claude/
  CLAUDE.md                              # Layer 1: Team Instructions
  agents/
    software-engineer--platform.agent.md  # Layer 2: Agent Profile
  skills/
    task-completion/SKILL.md             # Layer 3: Skills
    incident-response/SKILL.md
```

| Layer               | File                          | Loaded by              | Contains                                                  |
| ------------------- | ----------------------------- | ---------------------- | --------------------------------------------------------- |
| Team Instructions   | `.claude/CLAUDE.md`           | Every agent, every run | Platform conventions, environment, architectural decisions |
| Agent Profile       | `.claude/agents/<name>.md`    | One agent at a time    | Identity, working style, constraints, skill index         |
| Skills              | `.claude/skills/*/SKILL.md`   | On demand              | Procedure, references, and verification checklists        |

The rules for what goes where follow from how these files are loaded:

- **Team Instructions** -- content that every agent on the project must know
  regardless of their specialization. Environment variables, repository
  conventions, deployment targets, shared architectural decisions. The
  track-scoped `teamInstructions` body carries shared-across-teams content;
  the installation-scoped organizational-context slot (above) carries the
  per-team facts (repos, manager, adjacent leads, projects, escalation
  paths). Both layers render into the same `.claude/CLAUDE.md`.
- **Agent Profile** -- content that distinguishes this agent from others.
  Identity, working style derived from emphasized behaviours, constraints
  specific to the discipline and track.
- **Skills** -- each skill folder holds a procedure (sequencing and decisions),
  references (data the procedure consults), and checklists (entry and exit
  verification). Each skill fires independently and should be self-contained.

## Place guidance in the correct layer

When you need to add organizational context, ask: "Who needs to know this?"

| Who needs it                 | Where it goes        | Example                                                    |
| ---------------------------- | -------------------- | ---------------------------------------------------------- |
| Every agent on the project   | Team Instructions    | "All services deploy to AWS eu-west-1"                     |
| One role specialization      | Agent Profile        | "Platform engineers own backward compatibility"            |
| Anyone doing a specific task | Skill                | "Code review follows the four-step checklist in REVIEW.md" |

The `--level` flag is the per-invocation calibration surface — distinct from
`teamInstructions` (shared across every agent on a track) and the
organizational-context slot (shared across every installation):

```sh
npx fit-pathway agent software-engineering --track=platform --level=J060
```

Set `--level` explicitly when two agents on the same team must reflect
different role-level expectations. Run the command once per level rather than
encoding the difference inside `teamInstructions`, which contaminates every
team using the track.

Preview what Pathway generates for a given role to confirm placement:

```sh
npx fit-pathway agent software-engineering --track=platform
```

The output shows all three layers in order. Verify that the content you added
appears in the correct section.

## Avoid common anti-patterns

Three patterns cause agents to produce inconsistent output. Each stems from
violating the layer boundaries.

### Duplicated facts

The same fact stated in both team instructions and a skill file. When the fact
changes, one copy gets updated and the other does not. The agent receives
contradictory guidance depending on which file it reads first.

**Wrong** -- deployment target repeated in two layers:

```yaml
# data/pathway/tracks/platform.yaml
agent:
  teamInstructions: |
    All services deploy to AWS eu-west-1 using ECS Fargate.
```

```yaml
# data/pathway/capabilities/cloud-platforms.yaml
skills:
  - id: cloud-platforms
    agent:
      focus: |
        Deploy all services to AWS eu-west-1 using ECS Fargate.
```

**Right** -- state the fact once in `teamInstructions` and have the skill
reference it: `focus: Follow the deployment conventions defined in team
instructions.`

### Contradictory guidance

Two layers give conflicting instructions because they were written at different
times -- for example, team instructions say "use REST" while a skill says
"prefer gRPC." The agent has no way to resolve the conflict. Decide which layer
owns the decision, state it there, and remove the conflicting statement.

### Narrative in checklists

Skill checklists work because agents execute them item by item. Narrative
explanations inside checklist items dilute the signal. Put explanations in the
skill's `focus` or `instructions` field; keep checklist items imperative.

**Wrong:**

```yaml
readChecklist:
  - >-
    Review the PR description carefully. This matters because context is often
    lost between the author's intent and the reviewer's interpretation, so
    reading the description ensures alignment before reviewing code.
```

**Right:**

```yaml
readChecklist:
  - Read the PR description and confirm it states the change's intent.
```

## Update agents when the standard changes

Agent configurations are derived from your engineering standard data. When the
standard changes, regenerate the agent files to pick up those changes:

```sh
npx fit-pathway agent software-engineering --track=platform --output=.
```

Pathway overwrites `.claude/` with the latest derived configuration. Verify the
updated skill list:

```sh
npx fit-pathway agent software-engineering --track=platform --skills
```

If a skill was added to the discipline's tier arrays, it appears here. If one
was removed, it disappears. To see all available combinations:

```sh
npx fit-pathway agent --list
```

```text
se-platform software-engineering platform, Software Engineering (Platform Engineering)
se-sre software-engineering sre, Software Engineering (Site Reliability Engineering)
```

Then run the `agent` command for each combination that your project uses.

After regenerating, check three things:

1. **Team instructions are current.** Open `.claude/CLAUDE.md` and confirm the
   conventions still match your platform.
2. **No hand-edits were lost.** Regeneration overwrites generated files. Move
   hand-edits into the YAML source so they survive.
3. **Skills match the discipline.** Run
   `npx fit-pathway agent <discipline> --track=<track> --skills` and confirm.

## Verify

Your organizational context is well-structured when:

- **Each fact lives in exactly one layer.** No team instruction is duplicated in
  a skill file. No agent profile restates what team instructions already say.
- **No layer contradicts another.** Running
  `npx fit-pathway agent <discipline> --track=<track>` and reading the output
  top to bottom, every statement is consistent.
- **Checklist items are imperative and verifiable.** No narrative explanations
  inside checklist arrays.
- **Regeneration produces the expected output.** After updating the standard
  and running `npx fit-pathway agent ... --output=.`, the generated files
  reflect the change.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../../authoring-standards -->

</div>
