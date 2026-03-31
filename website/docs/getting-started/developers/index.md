---
title: "Getting Started: Developers"
description: "Install CLI tools, generate agent teams, browse job definitions, and set up Basecamp."
---

# Getting Started: Developers

Get up and running with the Forward Impact CLI tools. This guide covers browsing
your career framework, generating AI agent teams, and setting up your personal
knowledge base.

## Install

Install the packages directly:

```sh
bun install @forwardimpact/pathway @forwardimpact/basecamp
```

Or from the monorepo:

```sh
git clone https://github.com/forwardimpact/monorepo.git
cd monorepo
bun install
```

## Data directory convention

The Pathway and Map CLIs expect framework data at `./data/pathway/`, not
`./data/` directly. The CLI resolves the data directory by walking upward from
the current working directory looking for a `data/` folder, then appends
`/pathway`.

To override, use the `--data` flag pointing to the `pathway` subdirectory
directly:

```sh
bunx fit-pathway discipline --list --data=./my-data/pathway
```

## Browse your job definition

Use the Pathway CLI to explore the engineering framework your organization has
defined.

```sh
bunx fit-pathway discipline --list    # See available disciplines
bunx fit-pathway level --list         # See available levels
bunx fit-pathway track --list         # See available tracks
```

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
bunx fit-pathway job software_engineering L3 --track=platform
```

This produces a full view of the skills, behaviours, and expectations for that
role.

## Generate agent teams

Create AI agent definitions matched to your role's skill profile:

```sh
bunx fit-pathway agent software_engineering --track=platform --output=./agents
```

This generates a set of `.agent.md` files and a `skills/` directory. Each agent
file defines a persona with specific capabilities. The skills directory contains
`SKILL.md` files that agents use as operational context -- the same skill
definitions humans reference, formatted for AI consumption.

Copy the output into your project's `.claude/` or equivalent agent configuration
directory.

## Set up Basecamp

Basecamp is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings. The full
desktop experience (macOS status menu app) requires macOS; the CLI scheduler
works on any platform.

Initialize a knowledge base in a directory of your choice:

```sh
bunx fit-basecamp --init ~/Documents/Personal
```

Check the status of your knowledge base:

```sh
bunx fit-basecamp --status
```

Run the scheduler in the background to keep everything up to date:

```sh
bunx fit-basecamp --daemon
```

Basecamp runs as a macOS status menu app with scheduled AI tasks handling the
background work.

## Next steps

- [Agent teams](/docs/guides/agent-teams/) -- configure and customize generated
  agents
- [Knowledge systems](/docs/guides/knowledge-systems/) -- deep dive into
  Basecamp features
- [Career paths](/docs/guides/career-paths/) -- understand progression and skill
  development
- [CLI reference](/docs/reference/cli/) -- full command documentation for all
  tools
