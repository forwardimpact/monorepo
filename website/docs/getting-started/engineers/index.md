---
title: "Getting Started: Engineers"
description: "Install CLI tools, browse job definitions, generate agent teams, set up Guide, and configure Basecamp."
---

Get up and running with the Forward Impact CLI tools. This guide covers browsing
your career framework, generating AI agent teams, interpreting engineering
artifacts with Guide, and setting up your personal knowledge base.

## Install Pathway

```sh
npm install @forwardimpact/pathway
```

## Initialize framework data

If your organization hasn't provided a framework data bundle, bootstrap starter
data to explore with:

```sh
npx fit-pathway init
```

This creates `./data/pathway/` with a complete starter framework. If your
organization distributes a framework bundle, follow their installation
instructions instead — typically a one-line `curl | bash` install script that
places data at `~/.fit/data/pathway/`.

### Data directory resolution

The CLI resolves the data directory by walking upward from the current working
directory looking for a `data/pathway/` folder. To override, use the `--data`
flag:

```sh
npx fit-pathway discipline --list --data=./my-data/pathway
```

## Browse your job definition

Use the Pathway CLI to explore the engineering framework your organization has
defined.

```sh
npx fit-pathway discipline --list    # See available disciplines
npx fit-pathway level --list         # See available levels
npx fit-pathway track --list         # See available tracks
```

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
npx fit-pathway job software_engineering L3 --track=platform
```

This produces a full view of the skills, behaviours, and expectations for that
role.

## Generate agent teams

Create AI agent definitions matched to your role's skill profile:

```sh
npx fit-pathway agent software_engineering --track=platform --output=./agents
```

This generates a set of `.agent.md` files and a `skills/` directory. Each agent
file defines a persona with specific capabilities. The skills directory contains
`SKILL.md` files that agents use as operational context — the same skill
definitions humans reference, formatted for AI consumption.

Copy the output into your project's `.claude/` or equivalent agent configuration
directory.

## Set up Guide

Guide is a conversational AI agent that understands your organization's
engineering framework. It helps you onboard, find growth areas, and interpret
engineering artifacts against your skill markers.

### Install

```sh
npm install @forwardimpact/guide
npx fit-codegen --all
```

The `fit-codegen` step generates gRPC service clients that Guide needs. Without
it, imports fail with a missing module error.

### Prerequisites

Guide connects to the Forward Impact knowledge platform services. You need a
running service stack and a service secret:

```sh
export SERVICE_SECRET=<your-secret>
```

If your organization hosts the platform, they will provide the service secret
and endpoint configuration. If `SERVICE_SECRET` is not set, the CLI prints
onboarding instructions.

### Usage

```sh
npx fit-guide                                        # Start interactive conversation
echo "What skills should I focus on for L3?" | npx fit-guide  # Pipe a question
```

Guide reasons about your organization's specific skill definitions, behaviour
expectations, and markers — not generic career advice.

## Set up Basecamp

Basecamp is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings.

### Install

```sh
npm install @forwardimpact/basecamp
```

### Initialize a knowledge base

```sh
npx fit-basecamp --init ~/Documents/Personal
```

### Check status

```sh
npx fit-basecamp --status
```

### Run the scheduler

```sh
npx fit-basecamp --daemon
```

Basecamp runs as a macOS status menu app with scheduled AI tasks handling
background work. The CLI scheduler works on any platform.

## Next steps

- [Agent teams](/docs/guides/agent-teams/) -- configure and customize generated
  agents
- [Finding your bearing](/docs/guides/finding-your-bearing/) -- Guide usage and
  configuration
- [Knowledge systems](/docs/guides/knowledge-systems/) -- deep dive into
  Basecamp features
- [Career paths](/docs/guides/career-paths/) -- understand progression and skill
  development
- [CLI reference](/docs/reference/cli/) -- full command documentation for all
  tools
