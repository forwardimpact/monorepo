---
title: "Configure Agents to Meet Your Engineering Standard"
description: "End the cycle of rejecting agent output for following generic practices — configure agents to meet the expectations the organization holds for humans."
---

An agent's work was rejected -- not because the code was wrong, but because it
followed generic practices instead of the organization's standards. The problem is configuration: the agent has no access to the skills,
behaviours, and conventions your engineering standard defines. This guide walks
you through configuring agents against that standard so their output reflects
what the organization expects from any contributor, human or AI.

## Prerequisites

Complete these guides before continuing:

- [Getting Started: Pathway for Engineers](/docs/getting-started/engineers/pathway/)
  -- install Pathway and initialize a `data/pathway/` directory with starter
  content or your organization's standard data.
- [Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
  -- if your organization has not yet defined its standard, start there. This
  guide assumes a standard exists and `npx fit-pathway discipline --list`
  returns your disciplines.

## Identify the role to configure

Every agent configuration in Pathway maps to a **discipline** and **track** --
the same coordinates used for human role definitions. Before generating an agent,
identify which discipline and track describe the work the agent will do.

List the available discipline and track combinations:

```sh
npx fit-pathway agent --list
```

Expected output (your organization's values will differ):

```text
se-platform software_engineering platform, Software Engineering (Platform Engineering)
se-sre software_engineering sre, Software Engineering (Site Reliability Engineering)
de-platform data_engineering platform, Data Engineering (Platform Engineering)
...
```

Each row shows a short ID, the discipline ID, the track ID, and a human-readable
description. Note the discipline and track values for the role you want to
configure -- you will use them in the next step.

If the combination you need is missing, the standard data does not define an
agent section for that discipline or track. See
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
to add one.

## Preview the agent configuration

Before writing files, preview what Pathway will generate. Run the `agent`
command without `--output` to see the full configuration on screen:

```sh
npx fit-pathway agent software_engineering --track=platform
```

The output has three sections, each corresponding to a layer in the generated
agent team:

1. **Team Instructions** (`.claude/CLAUDE.md`) -- cross-cutting context every
   agent needs: platform conventions, environment variables, and architectural
   decisions.
2. **Agent Profile** (`.claude/agents/*.md`) -- the agent's identity, working
   style, required skills, and constraints.
3. **Required Skills** (`.claude/skills/*/SKILL.md`) -- which skills the agent
   will load, with descriptions so the agent knows when each applies.

Review the output and confirm it reflects your organization's expectations:

- Does the team instructions section capture the platform and conventions the
  agent needs to know?
- Does the identity describe the right specialization?
- Do the working style entries reflect the behaviours your standard emphasizes?
- Do the constraints match the boundaries you expect the agent to observe?
- Is the skill list appropriate for the discipline and track?

If the content looks wrong, the fix is in the standard data, not in the
generated output. The configuration is derived from the same YAML files that
define human roles -- update the source, and the agent configuration updates
with it.

### Calibrate the agent's level

The `--level` flag picks which level's expectations the generated agent
encodes. Without it, Pathway selects a default level based on core-skill
proficiency.

```sh
npx fit-pathway agent software_engineering --track=platform --level=J060
```

Set `--level` explicitly when generating agents that should meet different
expectations -- for example, a J040 agent and a J060 agent on the same team
need separate profiles. When omitted, the output is byte-identical to today's
default-resolved behaviour.

## Generate the agent team

Once the preview looks right, generate the files into your project:

```sh
npx fit-pathway agent software_engineering --track=platform --output=.
```

Pathway writes the following structure (the skill directories will match
your discipline's tier arrays — the example below uses the starter):

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

The agent name is derived from the discipline's `roleTitle`, suffixed with the
track when one is set (e.g., `software-engineer--platform`). Generalist
configurations without a track omit the suffix.

## Confirm the generated skills

List the skill IDs the agent received to confirm they match the discipline:

```sh
npx fit-pathway agent software_engineering --track=platform --skills
```

Expected output (your organization's skills will differ — the starter ships
this shape for `software_engineering --track=platform`):

```text
task_completion
incident_response
incident_management
```

Each skill file under `.claude/skills/` contains procedural guidance for one
domain: what to prioritize, what outputs to produce, and which checklists to
follow. Pathway sets the proficiency level automatically so agents work at a
consistently capable level across all skills.

## Verify

Your agents are configured against your organization's standard when you can
confirm the following:

- **The generated files exist in your project.** Running
  `ls .claude/agents/*.md` shows the agent profile and
  `ls .claude/skills/*/SKILL.md` shows the skill files.
- **The team instructions reflect your platform.** Open `.claude/CLAUDE.md` and
  verify it contains the conventions, environment, and coordination table your
  standard defines.
- **The agent profile matches the role.** Open the agent profile under
  `.claude/agents/` and verify the identity, working style, and constraints
  describe the discipline and track you selected.
- **The skills match the discipline.** The skill files under `.claude/skills/`
  correspond to the skills your standard assigns to this discipline and track.
- **The configuration is derived, not hand-written.** Any adjustment you need
  should be made in the standard YAML data, not by editing generated files
  directly. See
  [Give Agents Organizational Context](/docs/products/agent-teams/organizational-context/)
  for where each type of guidance belongs and how to update agents when the
  standard changes.

## What's next

<div class="grid">

<!-- part:card:organizational-context -->
<!-- part:card:../authoring-standards -->

</div>
