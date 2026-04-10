---
title: Operations Reference
description: "Environment configuration, service management, and common development tasks for the Forward Impact monorepo."
---

> **Note:** The commands on this page (`just` recipes, `fit-rc`, environment
> scripts) require a full monorepo checkout. For npm-based installs, see
> [Getting Started: Engineers](/docs/getting-started/engineers/).

Day-to-day reference for environment setup, service management, and common
development tasks. For the PR workflow and contributing guidelines, see
[CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md).

---

## Environment Management

Environment is configured via profile-based `.env` files, managed by
`just env-setup`:

```sh
# Available profiles (complete, self-contained):
.env.local.example            # Local dev: localhost, no auth, filesystem storage
.env.docker-native.example    # Docker networking with MinIO storage
.env.docker-supabase.example  # Docker networking with Supabase storage and auth
```

`just env-reset` copies a profile to `.env`. All `just` recipes automatically
load `.env` via `set dotenv-load`. Configure profiles via `just env-reset`:

```sh
just rc-start                              # local env, local storage, no auth
just env-reset docker-native && just rc-start  # docker networking, MinIO storage
```

### Environment Setup

```sh
just env-setup     # Reset from examples, generate secrets and storage creds
just env-reset     # Copy .env.local.example → .env
just env-secrets   # Generate SERVICE_SECRET, JWT_SECRET, JWT_ANON_KEY
just env-storage   # Generate storage backend credentials
just env-github    # GitHub token utility (LLM_TOKEN, LLM_BASE_URL)
```

`LLM_TOKEN` and `LLM_BASE_URL` are always set in the environment (provided by
the hosting platform or `.env`). Any code using `libconfig` to access LLM
credentials works out of the box.

---

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- `init.services` — Ordered list of services for `fit-rc` to supervise (tei,
  trace, vector, graph, llm, memory, tool, agent, web)
- `init.log_dir` / `init.shutdown_timeout` — Logging and shutdown
- `service.*` — Per-service settings (model, temperature, max_tokens, tool
  filter thresholds, tool endpoints)
- `evals` — Evaluation models and judge model

`config/tools.yml` — Tool endpoint definitions (purpose, parameters, evaluation
criteria) used by the tool service.

`config/agents/*.agent.md` — Agent prompt files (planner, researcher, editor,
eval_judge). Reset from examples with `just config-reset`.

---

## Service Management

Services are supervised by `fit-rc` (via `libraries/librc/`). The service list
is defined in `config/config.json` under `init.services`.

```sh
bunx fit-rc start              # Start all services (or: just rc-start)
bunx fit-rc stop               # Graceful shutdown    (or: just rc-stop)
bunx fit-rc restart            # Restart all          (or: just rc-restart)
bunx fit-rc status             # Show service status  (or: just rc-status)
bunx fit-rc start tei          # Start a single service
```

Services run on localhost in local mode (ports 3002–3008 for gRPC, 3001 for web,
8090 for TEI embeddings). Port mapping is in `.env.local`.

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
just rc-start                 # Start services (supabase/tei skipped if not installed)
```

### Generation

```sh
just synthetic                # Cached prose (default, no LLM needed)
just synthetic-update         # Generate new prose via LLM and update cache
just synthetic-no-prose       # Structural only, no prose (minimal data)
```

Generation uses cached prose by default from `data/synthetic/prose-cache.json`.
Use `just synthetic-update` to call the LLM and refresh the cache. The
`no-prose` mode produces minimal structural data without prose content.

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
GetDX responses) to Supabase Storage, then runs all transforms and verifies the
result. Idempotent — safe to run repeatedly.

### Development

```sh
bun run dev                   # Development server
bunx fit-pathway dev          # Pathway dev server
bunx fit-pathway build --url=X # Static site + install bundle
bunx fit-basecamp init ~/Dir  # Initialize knowledge base
bunx fit-basecamp daemon      # Run scheduler
```

### Processing & Services

```sh
just process                  # Process all resources (agents, tools, vectors, graphs)
just process-fast             # Process without vectors (no TEI required)
just rc-start                 # Start all services
just rc-stop                  # Stop all services
just rc-status                # Service health check
```

### Infrastructure

```sh
just codegen                  # Generate types, services, clients from proto/
just env-setup                # Initialize environment from examples
just data-init                # Create data dirs, copy example data to data/knowledge/
just config-reset             # Reset config files from examples
```

See each product's skill file for full CLI reference.

---

## CI Agent Authentication

The continuous improvement system authenticates to GitHub using a **GitHub App**
that generates short-lived installation tokens per workflow run. Two setup
options are available:

### Option 1: Forward Impact CI App (recommended)

The Forward Impact organization publishes a public GitHub App. Repositories
within the org (or trusted forks where the org manages secrets centrally)
install the App and use the org-managed credentials.

1. Install the **Forward Impact CI** App on your repository from its public
   listing.
2. Store the following as repository secrets:
   - `CI_APP_ID` — the App's numeric ID (provided by the App owner)
   - `CI_APP_PRIVATE_KEY` — the PEM-encoded private key (provided by the App
     owner)
3. Store `ANTHROPIC_API_KEY` as a repository secret.
4. The agent workflows will generate installation tokens automatically.

### Option 2: Create your own GitHub App

Organizations that want full control create their own GitHub App.

1. Create a GitHub App with these repository permissions:

   | Permission        | Access     | Used by                                       |
   | ----------------- | ---------- | --------------------------------------------- |
   | **Contents**      | Read/Write | All agent workflows (push commits, read code) |
   | **Pull requests** | Read/Write | Triage, backlog, release workflows            |
   | **Issues**        | Read/Write | Improvement coach (open issues for findings)  |
   | **Actions**       | Read       | Improvement coach (download trace artifacts)  |
   | **Metadata**      | Read       | All (granted by default)                      |

2. Disable webhooks (not needed — token-only usage).
3. Install the App on your repository.
4. Generate a private key and store as repository secrets:
   - `CI_APP_ID` — your App's numeric ID
   - `CI_APP_PRIVATE_KEY` — your App's PEM-encoded private key
5. Override the `app-slug` input in the composite action to match your App's
   slug. Each workflow passes `app-id` to the composite action; the `app-slug`
   input defaults to `forward-impact-ci` and must be changed to your App's slug.

Private keys are per-App, not per-installation. Only the App owner can generate
and distribute them.

---

## Related Documentation

- [CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md)
  -- Development workflow and quality guidelines
- [Getting Started: Contributors](/docs/getting-started/contributors/) --
  Environment setup walkthrough
