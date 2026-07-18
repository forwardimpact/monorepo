---
title: "Getting Started: Guide for Engineers"
description: "Set up the AI agent that understands your agent-aligned engineering standard — onboarding, career advice, skill assessment, and contextual help."
---

Guide is a conversational AI agent that understands your organization's
agent-aligned engineering standard. It helps you onboard, find growth areas, and
interpret engineering artifacts against your skill markers.

## Prerequisites

- Node.js 22+
- npm

## Install

```sh
npm install @forwardimpact/guide
```

## Install and configure

```sh
npx fit-codegen generate --all    # provided by @forwardimpact/libcodegen (a dependency of guide)
npx fit-guide --init
```

The `fit-codegen` step generates gRPC service clients that Guide needs. Without
it, imports fail with a missing module error.

The `--init` step generates:

- `.env` — service secrets (`MCP_TOKEN`) and port assignments
- `config/config.json` — service startup configuration

## Configure credentials

Guide runs on the Anthropic API. Authenticate using one of:

```sh
npx fit-guide --login     # OAuth PKCE flow (recommended)
```

Or set `ANTHROPIC_API_KEY` in `.env` manually. Guide validates credentials on
startup and reports if they are missing.

## Process data

Before starting the services, process the standard data into the indexes that
Guide's services read at runtime:

```sh
npx fit-process resources # provided by @forwardimpact/librag
npx fit-process graphs    # provided by @forwardimpact/librag
```

These steps transform your `data/pathway/` into the resource index, knowledge
store, and graph index. Re-run them whenever you update standard data.

## Start the service stack

```sh
npx fit-rc start          # provided by @forwardimpact/librc
```

This supervises all required microservices (trace, vector, graph, pathway, map,
mcp) in dependency order. Configuration and secrets are read automatically from
`.env`. Stop them with `npx fit-rc stop`.

## Usage

```sh
npx fit-guide                                        # Start interactive conversation
echo "What skills should I focus on for J060?" | npx fit-guide  # Pipe a question
```

Example pipe-mode output:

```text
Level II engineers in your organization focus on three skill areas:

**System Design** — Design components that interact with other teams'
services, make technology choices within your domain, and document
architectural decisions.

**Technical Leadership** — Lead small cross-functional projects, unblock
peers on technical decisions, and mentor junior engineers on best
practices.

**Operational Awareness** — Own reliability for your services, set up
monitoring and alerting, and participate in incident response rotations.

Based on your current profile, prioritize System Design and Technical
Leadership to close the gap to Level II.
```

Guide reasons about your organization's specific skill definitions, behaviour
expectations, and markers — not generic career advice.

---

## Troubleshooting

### Configuration errors on startup

Guide validates configuration before connecting. If you see errors about missing
`ANTHROPIC_API_KEY` or `MCP_TOKEN`, check that:

1. You ran `npx fit-guide --init` (creates `.env` with `MCP_TOKEN`)
2. You ran `npx fit-guide --login` or set `ANTHROPIC_API_KEY` in `.env`

### `Not authenticated` error

Run `npx fit-guide --login` to authenticate with Anthropic, or set
`ANTHROPIC_API_KEY` in `.env`.

### Data not found

If Guide cannot answer questions, the knowledge indexes may not be populated.
Run the processing pipeline:

```sh
npx fit-process resources
npx fit-process graphs
```

Then restart the services.

### MCP endpoint unreachable

Verify the MCP service is running. Check `npx fit-guide --status` for health
information, then restart the services:

```sh
npx fit-rc stop && npx fit-rc start
```

### Missing module errors after install

Run code generation first — Guide depends on generated gRPC clients:

```sh
npx fit-codegen generate --all
```

### Service startup failures

Check service logs for the failing service:

```sh
npx fit-rc status                 # Identify the failing service
npx fit-rc logs <service>         # Print its current log (example: npx fit-rc logs trace)
```

Each microservice writes to `data/logs/{service}/current`. Common causes are
missing environment variables or port conflicts.

---

## What's next

<div class="grid">

<!-- part:card:../../../../guide -->
<!-- part:card:../../../products/growth-areas -->

</div>
