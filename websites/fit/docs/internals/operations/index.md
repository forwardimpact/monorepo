---
title: Operations Reference
description: "Environment configuration, service management, and common development tasks for the Forward Impact monorepo."
---

> **Note:** The commands on this page (`just` recipes, `fit-rc`, environment
> scripts) require a full monorepo checkout. For npm-based installs, see
> [Getting Started: Engineers](/docs/getting-started/engineers/).

This page is the day-to-day reference for environment setup, service
management, and common development tasks. For the PR workflow and contributing
guidelines, see
[CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md).

---

## Environment Management

Profile-based `.env` files configure the environment. `just env-setup` manages
these files:

```sh
# Available profiles (complete, self-contained):
.env.local.example            # Local dev: localhost, no auth, filesystem storage
.env.docker-native.example    # Docker networking with MinIO storage
.env.docker-supabase.example  # Docker networking with Supabase storage and auth
```

`just env-reset` copies a profile to `.env`. All `just` recipes automatically
load `.env` with `set dotenv-load`. Configure profiles with `just env-reset`:

```sh
bunx fit-rc start                          # local env, local storage, no auth
just env-reset docker-native && bunx fit-rc start  # docker networking, MinIO storage
```

### Environment Setup

```sh
just env-reset     # Copy .env.local.example → .env (wipes any existing values)
just env-setup     # Generate every secret in .env (idempotent across runs)
```

`ANTHROPIC_API_KEY` lives in the environment. The host platform, `.env`, or
`fit-guide --login` provides it. Any code that uses `libconfig` to access
Anthropic credentials works out of the box.

---

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- `init.services` — Ordered list of service objects (`name`, `command`,
  optional `optional: true`) for `fit-rc` to supervise (span, embedding,
  vector, graph, pathway, map). Add optional services such as `mcp` to the
  list when you work on those features
- `init.log_dir` / `init.shutdown_timeout` — Logs and shutdown
- `service.*` — Per-service settings (e.g. how MCP routes tools)

---

## Service Management

`fit-rc` supervises the services through `libraries/librc/`.
`config/config.json` defines the service list under `init.services`.

```sh
bunx fit-rc start              # Start all services
bunx fit-rc stop               # Graceful shutdown
bunx fit-rc restart            # Restart all
bunx fit-rc status             # Show service status
bunx fit-rc start embedding    # Start a single service
```

Services run on localhost in local mode. gRPC services use ports 3001–3005,
mcp uses 3011, and embedding uses 3015. Optional services use additional
ports. `.env.local.example` holds the port mapping.

TEI (Text Embeddings Inference) provides local embeddings:

```sh
just tei-install              # Install via cargo (first time)
just tei-start                # Start TEI service (downloads model on first run)
```

---

## Common Tasks

### Bootstrap (First Run)

```sh
bun install                   # Install all workspace dependencies
just quickstart               # Full bootstrap: env, generate, data, codegen, process
bunx fit-rc start             # Start services (supabase/tei skipped if not installed)
```

### Generation

```sh
just synthetic-deps           # Provision generation tools (Synthea, SDV, faker)
just synthetic                # Cached prose (default, no LLM needed)
just synthetic-update         # Generate new prose via LLM and update cache
```

By default, generation uses the cached prose in
`data/synthetic/prose-cache.json`. Use `just synthetic-update` to call the LLM
and refresh the cache.

The dataset tools (the Synthea JAR, the SDV Python package, and faker) are
heavy. Few tasks need them, so they live outside `package.json` and the
default `bun install`. Provision them on demand with `just synthetic-deps`
(`just synthetic-deps-check` reports status). The pipeline gracefully skips any
dataset whose tool is unavailable.

### Activity Seed (synthetic data)

Populate the activity database from synthetic data in one command:

```sh
bunx fit-map activity seed
```

Or use the full workflow from scratch:

```sh
just seed-full
```

This runs: `supabase-up → supabase-migrate → synthetic → seed`.

The seed command uploads the synthetic roster and raw documents (GitHub events,
GetDX responses) to Supabase Storage. It then runs all transforms and verifies
the result. The command is idempotent. You can run it repeatedly.

### Development

```sh
bun run dev                   # Development server
bunx fit-pathway dev          # Pathway dev server
bunx fit-pathway build --url=X # Static site + install bundle
bunx fit-pathway serve        # Serve build output with git smart HTTP
bunx fit-outpost init ~/Dir  # Initialize knowledge base
bunx fit-outpost daemon      # Run scheduler
```

### Processing & Services

```sh
just process                  # Process all resources (agents, tools, vectors, graphs)
just process-fast             # Process without vectors (no TEI required)
bunx fit-rc start             # Start all services
bunx fit-rc stop              # Stop all services
bunx fit-rc status            # Service health check
```

### Infrastructure

```sh
just codegen                  # Generate types, services, clients from proto/
just env-setup                # Initialize environment from examples
just data-init                # Create data dirs, copy example data to data/knowledge/
just config-reset             # Reset agent config files from examples
```

See each product's skill file for full CLI reference.

---

## What's next

<div class="grid">

<!-- part:card:../../getting-started/contributors -->

</div>
