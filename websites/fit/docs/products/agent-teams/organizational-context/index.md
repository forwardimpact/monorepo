---
title: "Give Agents Organizational Context"
description: "Keep agents aligned as your engineering standard evolves. The guidance stays clear and free of conflicts, and you reconcile nothing by hand."
---

You generated an agent team. It works. Now you need to add organizational
context like deployment targets, platform conventions, and team-specific
constraints. This guide shows where each type of guidance belongs. It also shows
how to keep the guidance consistent as the standard evolves.

## Prerequisites

Complete the
[Configure Agents to Meet Your Engineering Standard](/docs/products/agent-teams/)
guide first. This page assumes you have an agent team that works. You generated
it with `npx fit-pathway agent`.

## Use the organizational context slot

The organizational context slot carries **installation-scoped** per-team facts.
These facts do not belong on a track that teams share. They are the repository
names this team works in, the manager handle, adjacent leads on neighbouring
teams, the active project list, and the escalation paths. Edit
`data/pathway/organizational-context.yaml`, a sibling of `claude-settings.yaml`.
The section then reaches every agent the next time you regenerate. The starter
template ships a populated example. Replace the placeholder values. Delete the
file instead if your installation has no per-team facts to add.

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

A top-level concern with no value or an empty list suppresses its
bullet. You can populate the slot in part. An entirely empty or absent slot
suppresses the whole section. The generator then produces the same bytes it
produced before the slot existed.

Use the slot for facts that change with the team. Use the track-scoped
`teamInstructions` for facts that match the track everywhere you use it. The
slot lives at the installation level. `teamInstructions` lives on the track. It
contaminates every other team that hires that track. Run
`bunx fit-map validate` to confirm your slot parses.

## Marker contract for downstream tooling

Tooling that consumes the rendered `.claude/CLAUDE.md` locates the
organizational context section by string match. The contract:

- The section opens with the literal line `## Organizational Context`.
- Downstream tools detect the section by exact-string match on that line.
- **Tooling that needs the unique occurrence MUST match the LAST occurrence
  of `## Organizational Context` in the file.** The generator always appends the
  section last. The final match stays correct in the unlikely case that a track
  author writes that heading inside `teamInstructions` prose.

A worked example:

```sh
awk '/^## Organizational Context$/{i=NR} END{print i}' .claude/CLAUDE.md
```

The command prints the line number of the section in any CLAUDE.md that has
one.

## Understand the architecture

Pathway generates agent configurations into three layers. The
installation-scoped slot above backs those layers. Each layer has a distinct
purpose. Information flows downward. It never flows upward.

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

The rules for what goes where follow from how the agent loads these files:

- **Team Instructions** hold content that every agent on the project must
  know, regardless of specialization. Examples are environment variables,
  repository conventions, deployment targets, and shared architectural
  decisions. The track-scoped `teamInstructions` body carries
  shared-across-teams content. The installation-scoped organizational-context
  slot (above) carries the per-team facts: repos, manager, adjacent leads,
  projects, and escalation paths. Both layers render into the same
  `.claude/CLAUDE.md`.
- **Agent Profile** holds content that distinguishes this agent from others.
  It holds the identity, the working style derived from emphasized
  behaviours, and the constraints specific to the discipline and track.
- **Skills** load on demand. Each skill folder holds a procedure (the
  sequence and the decisions), references (data the procedure consults), and
  checklists (entry and exit verification). Each skill fires independently.
  Each skill should be self-contained.

## Place guidance in the correct layer

When you add organizational context, first decide who needs to know the fact.

| Who needs it                    | Where it goes        | Example                                                    |
| ------------------------------- | -------------------- | ---------------------------------------------------------- |
| Every agent on the project      | Team Instructions    | "All services deploy to AWS eu-west-1"                     |
| One role specialization         | Agent Profile        | "Platform engineers own backward compatibility"            |
| Anyone who does a specific task | Skill                | "Code review follows the four-step checklist in REVIEW.md" |

The `--level` flag is the per-invocation calibration surface. It differs from
`teamInstructions`, which every agent on a track shares. It also differs from
the organizational-context slot, which every installation shares:

```sh
npx fit-pathway agent software-engineering --track=platform --level=J060
```

Set `--level` explicitly when two agents on the same team must reflect
different role-level expectations. Run the command once per level. Do not encode
the difference inside `teamInstructions`. That contaminates every team that uses
the track.

Preview what Pathway generates for a given role to confirm placement:

```sh
npx fit-pathway agent software-engineering --track=platform
```

The output shows all three layers in order. Verify that the content you added
appears in the correct section.

## Avoid common anti-patterns

Three patterns cause agents to produce inconsistent output. Each pattern breaks
the layer boundaries.

### Duplicated facts

The same fact appears in both team instructions and a skill file. When the fact
changes, one copy changes and the other does not. The agent then receives
contradictory guidance. The guidance depends on which file it reads first.

**Wrong.** The deployment target appears in two layers:

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

**Right.** State the fact once in `teamInstructions`. Have the skill
reference it: `focus: Follow the deployment conventions defined in team
instructions.`

### Contradictory guidance

Two layers give instructions that conflict because their authors wrote them at
different times. For example, team instructions say "use REST" while a skill
says "prefer gRPC." The agent has no way to resolve the conflict. Decide which
layer owns the decision. State the decision there. Remove the statement that
conflicts.

### Narrative in checklists

Skill checklists work because agents execute them item by item. Narrative
explanations inside checklist items dilute the signal. Put explanations in the
skill's `focus` or `instructions` field. Keep checklist items imperative.

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

Pathway derives agent configurations from your engineering standard data. When
the standard changes, regenerate the agent files to pick up those changes:

```sh
npx fit-pathway agent software-engineering --track=platform --output=.
```

Pathway overwrites `.claude/` with the latest derived configuration. Verify the
updated skill list:

```sh
npx fit-pathway agent software-engineering --track=platform --skills
```

If you added a skill to the discipline's tier arrays, it appears here. If you
removed one, it disappears. To see all available combinations:

```sh
npx fit-pathway agent --list
```

```text
se-platform software-engineering platform, Software Engineering (Platform Engineering)
se-sre software-engineering sre, Software Engineering (Site Reliability Engineering)
```

Then run the `agent` command for each combination that your project uses.

After you regenerate, check three things:

1. **Team instructions are current.** Open `.claude/CLAUDE.md`. Confirm the
   conventions still match your platform.
2. **You lost no hand-edits.** Pathway overwrites the generated files each time
   you regenerate. Move hand-edits into the YAML source so they survive.
3. **Skills match the discipline.** Run
   `npx fit-pathway agent <discipline> --track=<track> --skills` and confirm.

## Verify

Your organizational context is well-structured when:

- **Each fact lives in exactly one layer.** No skill file duplicates a team
  instruction. No agent profile restates what team instructions already say.
- **No layer contradicts another.** Run
  `npx fit-pathway agent <discipline> --track=<track>`. Read the output top to
  bottom. Every statement is consistent.
- **Checklist items are imperative and verifiable.** No narrative explanations
  inside checklist arrays.
- **Regeneration produces the expected output.** After you update the standard
  and run `npx fit-pathway agent ... --output=.`, the generated files reflect
  the change.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../../authoring-standards -->

</div>
