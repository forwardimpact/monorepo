---
title: "Getting Started: Engineers"
description: "Browse career paths with Pathway, get AI guidance with Guide, and set up your knowledge base with Basecamp."
---

Get up and running with the Forward Impact CLI tools. This guide covers browsing
your career framework, generating AI agent teams, getting framework-aware
guidance, and managing your personal knowledge base.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/pathway @forwardimpact/guide @forwardimpact/basecamp
```

This gives you three CLI tools:

- `fit-pathway` — browse job definitions and generate agent teams
- `fit-guide` — AI agent that understands your engineering framework
- `fit-basecamp` — personal knowledge base with scheduled AI tasks

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
npx fit-pathway job software_engineering J040 --track=platform
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

The `--init` step generates:

- `.env` — service secrets and port assignments
- `config/config.json` — service configuration with agent, LLM, memory, and tool
  settings
- `config/agents/` — agent definitions (planner, researcher, editor)
- `config/tools.yml` — tool descriptors for the agent pipeline

### Configure LLM credentials

Guide needs access to an LLM provider. Open `.env` in your editor and append:

```
LLM_TOKEN=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
```

Replace the values with your actual API key and provider endpoint. Guide uses
the OpenAI-compatible `/chat/completions` and `/embeddings` endpoints, so any
compatible provider works (OpenAI, Azure, GitHub Models, etc.). Guide validates
these on startup and reports which variables are missing.

### Process data

Before starting the services, process the framework data and agent definitions
into the indexes that Guide's services read at runtime:

```sh
npx fit-process-agents
npx fit-process-resources
npx fit-process-graphs
```

These steps transform your `config/agents/` and `data/pathway/` into the
resource index, knowledge store, and graph index. Re-run them whenever you
update framework data or agent definitions.

### Start the service stack

```sh
npx fit-rc start
```

This supervises all required microservices (trace, vector, graph, llm, memory,
tool, agent, web) in dependency order. Configuration and secrets are read
automatically from `.env`. Stop them with `npx fit-rc stop`.

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

## Troubleshooting

### Guide: configuration errors on startup

Guide validates configuration before connecting. If you see errors about missing
`service.agent.agent`, `service.agent.model`, `LLM_TOKEN`, or `LLM_BASE_URL`,
check that:

1. You ran `npx fit-guide --init` (creates `config/config.json` with the
   `service` section)
2. Your `.env` file contains `LLM_TOKEN` and `LLM_BASE_URL`

### Guide: `Agent not found` error

An `Agent not found: common.Agent.planner` error means the resource index has
not been populated. Run the processing pipeline:

```sh
npx fit-process-agents
npx fit-process-resources
npx fit-process-graphs
```

Then restart the services.

### Guide: `13 INTERNAL` gRPC error

A `13 INTERNAL` error during a conversation usually means the LLM service cannot
reach the provider. Verify that `LLM_TOKEN` and `LLM_BASE_URL` are correct in
`.env`, then restart the services:

```sh
npx fit-rc stop && npx fit-rc start
```

### Guide: missing module errors after install

Run code generation first — Guide depends on generated gRPC clients:

```sh
npx fit-codegen --all
```

### Guide: service startup failures

Check service logs for the failing service:

```sh
ls data/logs/          # List available service log directories
cat data/logs/llm/current   # View the LLM service log (example)
```

Each microservice writes to `data/logs/{service}/current`. Common causes are
missing environment variables or port conflicts.

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
