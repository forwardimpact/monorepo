---
title: "Getting Started: Engineers"
description: "Browse career paths with Pathway, get AI guidance with Guide, set up your knowledge base with Basecamp, and review evidence with Landmark."
---

Get up and running with the Forward Impact CLI tools. This guide covers browsing
your career framework, generating AI agent teams, getting framework-aware
guidance, managing your personal knowledge base, and reviewing your engineering
evidence.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/pathway @forwardimpact/guide @forwardimpact/basecamp @forwardimpact/landmark
```

This gives you four CLI tools:

- `fit-pathway` — browse job definitions and generate agent teams
- `fit-guide` — AI agent that understands your engineering framework
- `fit-basecamp` — personal knowledge base with scheduled AI tasks
- `fit-landmark` — review your engineering evidence and readiness

---

## Pathway

Pathway is your interface to the engineering framework. Browse job definitions,
explore career progression, and generate AI agent teams matched to your role.

### Initialize framework data

If your organization hasn't provided a framework data bundle, bootstrap starter
data to explore with:

```sh
npx fit-pathway init
```

This creates `./data/pathway/` with a complete starter framework. If your
organization distributes a framework bundle, follow their installation
instructions instead — typically a one-line `curl | bash` install script that
places data at `~/.fit/data/pathway/`.

#### Data directory resolution

The CLI resolves the data directory by walking upward from the current working
directory looking for a `data/pathway/` folder. To override, use the `--data`
flag:

```sh
npx fit-pathway discipline --list --data=./my-data/pathway
```

### Browse your job definition

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

### Generate agent teams

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

---

## Guide

Guide is a conversational AI agent that understands your organization's
engineering framework. It helps you onboard, find growth areas, and interpret
engineering artifacts against your skill markers.

### Install and configure

```sh
npx fit-codegen --all
npx fit-guide --init
```

The `fit-codegen` step generates gRPC service clients that Guide needs. Without
it, imports fail with a missing module error.

### Start the service stack

Guide requires a running service stack. Start it before launching Guide:

```sh
npx fit-rc start
```

This supervises all required microservices (trace, vector, graph, llm, memory,
tool, agent, web) in dependency order. Stop them with `npx fit-rc stop`.

### Usage

```sh
npx fit-guide                                        # Start interactive conversation
echo "What skills should I focus on for L3?" | npx fit-guide  # Pipe a question
```

Guide reasons about your organization's specific skill definitions, behaviour
expectations, and markers — not generic career advice.

---

## Basecamp

Basecamp is your personal operations center. It syncs email and calendar, builds
a knowledge graph, drafts responses, and prepares meeting briefings.

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

---

## Landmark

Landmark helps you review your engineering evidence — artifacts linked to
specific skill markers from your framework. Use it to see where you have strong
evidence of skill practice and where gaps remain.

### View your evidence

Review recent artifacts linked to specific skill markers:

```sh
npx fit-landmark evidence --skill system_design
```

This shows pull requests, review threads, and other artifacts that demonstrate
your skill proficiency, each traced to observable markers from your framework.

### Check readiness

See how your evidence maps to the next level's expectations:

```sh
npx fit-landmark readiness
```

### View your timeline

Track how your evidence has accumulated over time:

```sh
npx fit-landmark timeline
```

---

## Next steps

- [Agent teams](/docs/guides/agent-teams/) — configure and customize generated
  agents
- [Finding your bearing](/docs/guides/finding-your-bearing/) — Guide usage and
  configuration
- [Knowledge systems](/docs/guides/knowledge-systems/) — deep dive into Basecamp
  features
- [Career paths](/docs/guides/career-paths/) — understand progression and skill
  development
- [CLI reference](/docs/reference/cli/) — full command documentation for all
  tools
