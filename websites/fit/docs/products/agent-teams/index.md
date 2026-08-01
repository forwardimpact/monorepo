---
title: "Configure Agents to Meet Your Engineering Standard"
description: "End the cycle where you reject agent output that follows generic practices. Configure agents to meet the expectations the organization holds for humans."
---

An agent's work was rejected. The code was not wrong. The work followed generic
practices instead of the organization's standards. The problem is the
configuration. The agent has no access to the skills, behaviours, and
conventions your engineering standard defines. This guide shows you how to
configure agents against that standard. Their output then reflects what the
organization expects from any contributor, human or AI. The other half of this
job is to see what the standard expects of you. For that half, see
[See What's Expected at Your Level](/docs/products/career-paths/).

## Prerequisites

Complete these guides before you continue:

- [Getting Started: Pathway for Engineers](/docs/getting-started/engineers/pathway/)
  -- install Pathway and initialize a `data/pathway/` directory with starter
  content or your organization's standard data.
- [Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
  -- if your organization does not yet define its standard, start there. This
  guide assumes a standard exists and `npx fit-pathway discipline --list`
  returns your disciplines.

## Identify the role to configure

Every agent configuration in Pathway maps to a **discipline** and a **track**.
Human role definitions use the same coordinates. Before you generate an agent,
identify which discipline and track describe the work the agent will do.

List the available discipline and track combinations:

```sh
npx fit-pathway agent --list
```

Expected output (your organization's values will differ):

```text
se-platform software-engineering platform, Software Engineering (Platform Engineering)
se-sre software-engineering sre, Software Engineering (Site Reliability Engineering)
de-platform data-engineering platform, Data Engineering (Platform Engineering)
...
```

Each row shows a short ID, the discipline ID, the track ID, and a human-readable
description. Note the discipline and track values for the role you want to
configure. You use them in the next step.

If the combination you need is missing, the standard data does not define an
agent section for that discipline or track. See
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
to add one.

## Preview the agent configuration

Before you write files, preview what Pathway will generate. Run the `agent`
command without `--output` to see the full configuration on screen:

```sh
npx fit-pathway agent software-engineering --track=platform
```

The output has three sections. Each section matches a layer in the generated
agent team:

1. **Team Instructions** (`.claude/CLAUDE.md`) -- cross-cutting context every
   agent needs: platform conventions, environment variables, and architectural
   decisions.
2. **Agent Profile** (`.claude/agents/*.md`) -- the agent's identity, working
   style, required skills, and constraints.
3. **Required Skills** (`.claude/skills/*/SKILL.md`) -- which skills the agent
   will load, with descriptions so the agent knows when each applies.

Review the output. Confirm it reflects your organization's expectations:

- Confirm the team instructions section captures the platform and conventions
  the agent needs to know.
- Confirm the identity describes the right specialization.
- Confirm the working style entries reflect the behaviours your standard
  emphasizes.
- Confirm the constraints match the boundaries you expect the agent to observe.
- Confirm the skill list suits the discipline and track.

If the content looks wrong, fix the standard data. Do not fix the generated
output. Pathway derives the configuration from the same YAML files that define
human roles. Update the source. The agent configuration updates with it.

### Calibrate the agent's level

The `--level` flag picks which level's expectations the generated agent
encodes. Without the flag, Pathway selects a default level from core-skill
proficiency.

```sh
npx fit-pathway agent software-engineering --track=platform --level=J060
```

Set `--level` explicitly when you generate agents that should meet different
expectations. For example, a J040 agent and a J060 agent on the same team need
separate profiles. When you omit the flag, the output is byte-identical to
today's default-resolved behaviour.

## Generate the agent team

Once the preview looks right, generate the files into your project:

```sh
npx fit-pathway agent software-engineering --track=platform --output=.
```

Pathway writes the following structure. The skill directories match your
discipline's tier arrays. The example below uses the starter:

```text
.claude/
  CLAUDE.md                                  # Team instructions
  settings.json                              # Tool permissions
  agents/
    software-engineer--platform.agent.md     # Agent profile
  skills/
    task-completion/SKILL.md                 # Skill files
    incident-response/SKILL.md
    incident-management/SKILL.md
```

Pathway derives the agent name from the discipline's `roleTitle`. It adds the
track as a suffix when you set one (e.g., `software-engineer--platform`).
Generalist configurations without a track omit the suffix.

## Confirm the generated skills

List the skill IDs the agent received to confirm they match the discipline:

```sh
npx fit-pathway agent software-engineering --track=platform --skills
```

Expected output (your organization's skills will differ). The starter ships
this shape for `software-engineering --track=platform`:

```text
task-completion
incident-response
incident-management
```

Each skill file under `.claude/skills/` contains procedural guidance for one
domain: what to prioritize, what outputs to produce, and which checklists to
follow. Pathway sets the proficiency level automatically so agents work at a
consistently capable level across all skills.

## Verify

Your agents are configured against your organization's standard when you can
confirm the following:

- **The generated files exist in your project.** Run `ls .claude/agents/*.md` to
  see the agent profile. Run `ls .claude/skills/*/SKILL.md` to see the skill
  files.
- **The team instructions reflect your platform.** Open `.claude/CLAUDE.md`.
  Verify it contains the conventions, environment, and coordination table your
  standard defines.
- **The agent profile matches the role.** Open the agent profile under
  `.claude/agents/`. Verify the identity, working style, and constraints
  describe the discipline and track you selected.
- **The skills match the discipline.** The skill files under `.claude/skills/`
  correspond to the skills your standard assigns to this discipline and track.
- **Pathway derives the configuration. Nobody hand-writes it.** Make any
  adjustment you need in the standard YAML data. Do not edit the generated files
  directly. See
  [Give Agents Organizational Context](/docs/products/agent-teams/organizational-context/)
  for where each type of guidance belongs and how to update agents when the
  standard changes.

## What's next

<div class="grid">

<!-- part:card:organizational-context -->
<!-- part:card:../career-paths -->
<!-- part:card:../authoring-standards -->

</div>
