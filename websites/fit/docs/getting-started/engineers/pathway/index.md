---
title: "Getting Started: Pathway for Engineers"
description: "Browse career paths, generate AI agent teams, and explore job definitions from the CLI and web app."
---

Pathway is your interface to the agent-aligned engineering standard. Browse job
definitions, explore career progression, and generate AI agent teams matched to
your role.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/pathway
```

## Initialize standard data

If your organization hasn't provided a standard data bundle, bootstrap starter
data to explore with:

```sh
npx fit-map init
```

This creates `./data/pathway/` with a complete starter agent-aligned engineering
standard. If your organization distributes an agent-aligned engineering standard
bundle, follow their installation instructions instead — typically a one-line
`curl | bash` install script that places data at `~/.fit/data/pathway/`.

### Data directory resolution

The CLI resolves the data directory by walking upward from the current working
directory looking for a `data/pathway/` folder. To override, use the `--data`
flag:

```sh
npx fit-pathway discipline --list --data=./my-data/pathway
```

## Browse your job definition

Use the Pathway CLI to explore the agent-aligned engineering standard your
organization has defined.

```sh
npx fit-pathway discipline --list    # See available disciplines
npx fit-pathway level --list         # See available levels
npx fit-pathway track --list         # See available tracks
```

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
npx fit-pathway job software_engineering J040 --track=platform
```

This produces a full view of the skills, behaviours, and expectations for that
role.

## Generate agent teams

Create AI agent definitions matched to your role's skill profile:

```sh
npx fit-pathway agent software_engineering --track=platform --output=./agents
```

This generates a `.claude/` directory (and a matching `.vscode/`) under
`./agents/` containing one `<persona>.md` per agent profile under
`.claude/agents/`, a `SKILL.md` per skill under `.claude/skills/<skill>/`,
shared team instructions at `.claude/CLAUDE.md`, and matching editor settings.
The skill files are the same skill definitions humans reference, formatted for
AI consumption.

To install into a project, copy the generated `.claude/` and `.vscode/`
directories from `./agents/` into your project root — or re-run with
`--output=<your-project-root>` so they land there directly.

---

## What's next

<div class="grid">

<!-- part:card:../../../../pathway -->
<!-- part:card:../../../products/career-paths -->

</div>
