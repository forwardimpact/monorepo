---
title: Operations Reference
description:
  Environment configuration, service management, and common development tasks
  for the Forward Impact monorepo.
---

# Operations Reference

Day-to-day reference for environment setup, service management, and common
development tasks. For the PR workflow and contributing guidelines, see
[CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md).

## Environment Management

Environment is configured via layered `.env` files, loaded by `scripts/env.sh`:

```sh
# Load order (later files override earlier):
.env                      # Base: API credentials, service secrets
.env.{ENV}                # Network: local (localhost) or docker (container DNS)
.env.storage.{STORAGE}    # Storage: local, minio (S3), or supabase
.env.auth.{AUTH}           # Auth: none, gotrue, or supabase
```

Three variables control the environment stack:

| Variable  | Values                       | Default |
| --------- | ---------------------------- | ------- |
| `ENV`     | `local`, `docker`            | `local` |
| `STORAGE` | `local`, `minio`, `supabase` | `local` |
| `AUTH`    | `none`, `gotrue`, `supabase` | `none`  |

All `make` targets automatically load the correct env files. Pass overrides:

```sh
make rc-start                              # local env, local storage, no auth
make rc-start ENV=docker STORAGE=minio     # docker networking, MinIO storage
```

### Environment Setup

```sh
make env-setup     # Reset from examples, generate secrets and storage creds
make env-reset     # Reset .env* and config files from *.example counterparts
make env-secrets   # Generate SERVICE_SECRET, JWT_SECRET, JWT_ANON_KEY
make env-storage   # Generate storage backend credentials
make env-github    # GitHub token utility (LLM_TOKEN, LLM_BASE_URL)
```

`LLM_TOKEN` and `LLM_BASE_URL` are always set in the environment (provided by
the hosting platform or `.env`). Any code using `libconfig` to access LLM
credentials works out of the box.

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- **`init.services`** — Ordered list of services for `fit-rc` to supervise (tei,
  trace, vector, graph, llm, memory, tool, agent, web)
- **`init.log_dir`** / **`init.shutdown_timeout`** — Logging and shutdown
- **`service.*`** — Per-service settings (model, temperature, max_tokens, tool
  filter thresholds, tool endpoints)
- **`evals`** — Evaluation models and judge model

`config/tools.yml` — Tool endpoint definitions (purpose, parameters, evaluation
criteria) used by the tool service.

`config/agents/*.agent.md` — Agent prompt files (planner, researcher, editor,
eval_judge). Reset from examples with `make config-reset`.

## Service Management

Services are supervised by `fit-rc` (via `libraries/librc/`). The service list
is defined in `config/config.json` under `init.services`.

```sh
npx fit-rc start              # Start all services (or: make rc-start)
npx fit-rc stop               # Graceful shutdown    (or: make rc-stop)
npx fit-rc restart            # Restart all          (or: make rc-restart)
npx fit-rc status             # Show service status  (or: make rc-status)
npx fit-rc start tei          # Start a single service
```

Services run on localhost in local mode (ports 3002–3008 for gRPC, 3001 for web,
8090 for TEI embeddings). Port mapping is in `.env.local`.

TEI (Text Embeddings Inference) provides local embeddings:

```sh
make tei-install              # Install via cargo (first time)
make tei-start                # Start TEI service (downloads model on first run)
```

## Common Tasks

### Bootstrap (First Run)

```sh
npm install                   # Install all workspace dependencies
make quickstart               # Full bootstrap: env, generate, data, codegen, process
make rc-start                 # Start services (supabase/tei skipped if not installed)
```

### Generation

```sh
make synthetic                # Cached prose (default, no LLM needed)
make synthetic-update         # Generate new prose via LLM and update cache
make synthetic-no-prose       # Structural only, no prose (minimal data)
```

Generation uses cached prose by default from `data/synthetic/prose-cache.json`.
Use `make synthetic-update` to call the LLM and refresh the cache. The
`no-prose` mode produces minimal structural data without prose content.

### Development

```sh
npm run dev                   # Development server
npx fit-pathway dev           # Pathway dev server
npx fit-pathway build --url=X # Static site + install bundle
npx fit-basecamp --init ~/Dir # Initialize knowledge base
npx fit-basecamp --daemon     # Run scheduler
```

### Processing & Services

```sh
make process                  # Process all resources (agents, tools, vectors, graphs)
make process-fast             # Process without vectors (no TEI required)
make rc-start                 # Start all services
make rc-stop                  # Stop all services
make rc-status                # Service health check
```

### Infrastructure

```sh
make codegen                  # Generate types, services, clients from proto/
make env-setup                # Initialize environment from examples
make data-init                # Create data dirs, copy example data to data/knowledge/
make config-reset             # Reset config files from examples
```

See each product's skill file for full CLI reference.
