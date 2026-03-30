# Monorepo-Root Infrastructure — Unified Environment & Service Management

> Lift environment files, Makefile, config directory, data directory, and
> service management from `products/guide/` to the monorepo root, so all
> products and services are driven from a single location.

## Problem

The Guide product (`products/guide/`) owns all operational infrastructure:

- **Environment files** (`.env`, `.env.local`, `.env.storage.*`, `.env.auth.*`)
- **Makefile** (processing, service management, Docker, storage, auth, eval)
- **Config directory** (`config/config.json`, `config/tools.yml`,
  `config/agents/`)
- **Data directory** (`data/knowledge/`, `data/resources/`, `data/graphs/`,
  `data/vectors/`, `data/memories/`, `data/traces/`, `data/policies/`)
- **Scripts** (`scripts/env.sh`, `scripts/env-secrets.js`,
  `scripts/env-storage.js`, `scripts/env-github.js`)
- **docker-compose.yml**
- **Service supervision** (svscan socket, PID, logs in `data/`)

This infrastructure is generic — `libconfig`, `libstorage`, `librc`,
`libsupervise` are all library packages. Services live in `services/` at the
monorepo root. The Guide product's `Makefile` wraps library CLIs with
`npx --workspace=` invocations. Nothing is Guide-specific except the agent
configs and tool descriptors.

When Map, Pathway, or any future product needs the same processing pipeline,
service management, or storage backends, the current structure forces
duplication: each product would need its own `.env`, `Makefile`, `config/`,
`data/`, and `scripts/`.

## Design

### Principle: One Operational Root

All environment, configuration, data, and service management lives at the
monorepo root. Products contribute their own config fragments but never own the
operational shell. The root is the single place where an operator runs `make`
commands, manages secrets, starts services, and processes data.

### What Moves to the Root

| From `products/guide/`   | To monorepo root         | Notes                                     |
| ------------------------ | ------------------------ | ----------------------------------------- |
| `.env*` (all env files)  | `.env*`                  | Shared secrets, networking, storage, auth |
| `.env*.example`          | `.env*.example`          | Example files tracked in git              |
| `Makefile`               | `Makefile`               | Single operational Makefile               |
| `scripts/env.sh`         | `scripts/env.sh`         | Environment loader                        |
| `scripts/env-secrets.js` | `scripts/env-secrets.js` | Secret generator                          |
| `scripts/env-storage.js` | `scripts/env-storage.js` | Storage credential generator              |
| `scripts/env-github.js`  | `scripts/env-github.js`  | GitHub token configurator                 |
| `docker-compose.yml`     | `docker-compose.yml`     | Root-level compose                        |
| `Dockerfile`             | `Dockerfile`             | Already at root                           |
| `config/config.json`     | `config/config.json`     | Unified service + product config          |
| `config/tools.yml`       | `config/tools.yml`       | Tool descriptors                          |
| `config/agents/`         | `config/agents/`         | Agent definitions                         |
| `config/ingest.yml`      | `config/ingest.yml`      | Ingest pipeline config                    |
| `config/eval.yml`        | `config/eval.yml`        | Evaluation config                         |
| `config/*.example.*`     | `config/*.example.*`     | Example configs tracked in git            |
| `data/`                  | `data/`                  | All runtime data                          |
| `examples/`              | `examples/`              | Example datasets                          |

### What Stays in Products

Products keep only their source code, package definition, and product-specific
assets:

```
products/
  guide/
    bin/fit-guide.js          # Product CLI entry point
    package.json              # Product package (dependencies, bin)
  map/
    bin/                      # Map CLI
    src/                      # Map source
    schema/                   # Map schemas
    examples/                 # Map example data (YAML entities)
    package.json
  pathway/
    bin/                      # Pathway CLI
    src/                      # Pathway source
    templates/                # Pathway templates
    package.json
  basecamp/
    src/                      # Basecamp source
    template/                 # KB template
    package.json
```

Products are pure packages — no operational infrastructure, no data management,
no service orchestration.

### Root Directory Layout

```
/                                  (monorepo root)
├── .env                           Secrets, API credentials
├── .env.local                     Local networking (service URLs)
├── .env.docker                    Docker networking (proxy, aliases)
├── .env.storage.local             Local storage config
├── .env.storage.minio             MinIO S3 config
├── .env.storage.supabase          Supabase storage config
├── .env.auth.none                 No-auth config
├── .env.auth.gotrue               GoTrue auth config
├── .env.auth.supabase             Supabase auth config
├── .env*.example                  Example files (tracked)
├── Makefile                       Unified operational Makefile
├── Dockerfile                     Service container build (already here)
├── docker-compose.yml             Full stack compose
├── package.json                   Monorepo package (workspaces)
├── scripts/
│   ├── env.sh                     Environment loader
│   ├── env-secrets.js             Secret generator
│   ├── env-storage.js             Storage credential generator
│   ├── env-github.js              GitHub token configurator
│   └── auth-user.js               Demo auth user creator
├── config/
│   ├── config.json                Unified config (services, evals, products)
│   ├── config.example.json        Example config (tracked)
│   ├── tools.yml                  Tool descriptors
│   ├── tools.example.yml          Example tool descriptors (tracked)
│   ├── ingest.yml                 Ingest pipeline config
│   ├── ingest.example.yml         Example ingest config (tracked)
│   ├── eval.yml                   Evaluation config
│   ├── eval.example.yml           Example eval config (tracked)
│   └── agents/
│       ├── planner.agent.md       Agent definitions
│       ├── researcher.agent.md
│       ├── editor.agent.md
│       ├── *.agent.example.md     Example agent files (tracked)
│       └── ...
├── data/
│   ├── cli/                       CLI session data
│   ├── eval/                      Evaluation results
│   ├── graphs/
│   │   ├── index.jsonl            RDF quad index
│   │   └── ontology.ttl           SHACL ontology
│   ├── ingest/
│   │   ├── in/                    Ingest input
│   │   ├── pipeline/              Ingest pipeline state
│   │   └── done/                  Completed ingestion
│   ├── knowledge/                 Input HTML files
│   ├── logs/                      Service logs
│   ├── memories/                  Conversation state
│   ├── policies/                  Access control policies
│   ├── resources/                 Processed resources
│   ├── traces/                    Distributed traces
│   ├── vectors/
│   │   └── index.jsonl            Embedding vectors
│   ├── svscan.sock                Supervision socket
│   ├── svscan.pid                 Supervision PID
│   └── svscan.log                 Supervision log
├── examples/
│   └── knowledge/                 Example BioNova dataset
├── generated/                     Code-generated types and services
├── proto/                         Protobuf definitions (already here)
├── services/                      gRPC services (already here)
│   ├── agent/
│   ├── graph/
│   ├── llm/
│   ├── memory/
│   ├── tool/
│   ├── trace/
│   ├── vector/
│   └── web/
├── libraries/                     Shared libraries (already here)
└── products/                      Product packages (source only)
```

---

## Environment Files

### Layered Loading

The environment loader (`scripts/env.sh`) composes configuration from layers:

```bash
ENV=local STORAGE=local AUTH=none ./scripts/env.sh <command>
```

Loading order (later files override earlier):

1. `.env` — Base secrets (LLM_TOKEN, SERVICE_SECRET, JWT_SECRET)
2. `.env.${ENV}` — Network config (`.env.local` or `.env.docker`)
3. `.env.storage.${STORAGE}` — Storage backend (`.env.storage.local`, etc.)
4. `.env.auth.${AUTH}` — Auth backend (`.env.auth.none`, etc.)

### STORAGE_ROOT Elimination

With infrastructure at the root, `STORAGE_ROOT` becomes unnecessary. The current
`env.sh` sets `STORAGE_ROOT=$(pwd)` to pin path resolution when
`npx --workspace=` changes cwd to a library directory. When the Makefile runs
from the monorepo root, `libstorage`'s `findUpward` from cwd naturally finds
`config/` at the root without any pinning.

The `STORAGE_ROOT` fallback in `libstorage` remains for backward compatibility
(external installations like Basecamp that run from arbitrary directories), but
the monorepo `env.sh` no longer needs to set it.

### Shared vs Product-Specific

All secrets, networking, storage, and auth configuration is shared. Products
don't own environment files. If a product needs product-specific environment
variables, they go in `config/config.json` under a product namespace, not in
separate env files.

---

## Unified Config

### config.json Structure

The config file merges what was Guide-specific into a unified structure:

```json
{
  "init": {
    "log_dir": "data/logs",
    "shutdown_timeout": 3000,
    "services": [
      { "name": "tei", "command": "text-embeddings-router ..." },
      { "name": "trace", "command": "npm run dev -w @forwardimpact/svctrace" },
      { "name": "vector", "command": "npm run dev -w @forwardimpact/svcvector" },
      { "name": "graph", "command": "npm run dev -w @forwardimpact/svcgraph" },
      { "name": "llm", "command": "npm run dev -w @forwardimpact/svcllm" },
      { "name": "memory", "command": "npm run dev -w @forwardimpact/svcmemory" },
      { "name": "tool", "command": "npm run dev -w @forwardimpact/svctool" },
      { "name": "agent", "command": "npm run dev -w @forwardimpact/svcagent" },
      { "name": "web", "command": "npm run dev -w @forwardimpact/svcweb" }
    ]
  },
  "evals": {
    "models": ["openai/gpt-4o", "openai/gpt-4.1"],
    "judge_model": "openai/gpt-4o"
  },
  "service": {
    "agent": { "agent": "common.Agent.planner", "model": "openai/gpt-4o" },
    "llm": { "temperature": 0.32 },
    "memory": { "max_tokens": 4096 },
    "tool": {
      "filter": { "threshold": 0.64, "max_tokens": 8000 },
      "endpoints": { "..." : "..." }
    }
  }
}
```

This is identical to the current Guide `config.json`. The structure already uses
namespaces (`init`, `service`, `evals`) that make it product-agnostic. Service
commands use `npm run dev -w` which resolves correctly from any directory in the
monorepo.

### Agent Configs

Agent definitions (`config/agents/*.agent.md`) stay as Markdown+YAML front
matter files. These are operational config, not product source code — they
define what agents are available at runtime.

### Tool Descriptors

`config/tools.yml` maps tool names to human-authored descriptions. The
processing step reads this alongside protobuf definitions to generate
`tool.ToolFunction` resources. Product-agnostic by nature.

---

## Makefile

### Design

One Makefile at the monorepo root replaces the Guide Makefile. The `ENVLOAD`
helper stays the same but points to `./scripts/env.sh` at root:

```makefile
ENV ?= local
STORAGE ?= local
AUTH ?= none

ENVLOAD = ENV=$(ENV) STORAGE=$(STORAGE) AUTH=$(AUTH) ./scripts/env.sh
```

### Target Categories

All existing targets carry over. The `npx --workspace=` idiom works from root
because npm workspace commands resolve from the monorepo root by design.

| Category    | Targets                                                              |
| ----------- | -------------------------------------------------------------------- |
| Data        | `data-init`, `data-clean`, `data-reset`                              |
| Codegen     | `codegen`, `codegen-type`, `codegen-client`, `codegen-service`       |
| Processing  | `process`, `process-fast`, `process-agents`, `process-resources`,    |
|             | `process-tools`, `process-vectors`, `process-graphs`                 |
| Ingest      | `ingest`, `ingest-load`, `ingest-pipeline`, `transform`              |
| Services    | `rc-start`, `rc-stop`, `rc-restart`, `rc-status`                     |
| TEI         | `tei-install`, `tei-start`                                           |
| Docker      | `docker`, `docker-build`, `docker-up`, `docker-down`                 |
| Storage     | `storage-setup`, `storage-start`, `storage-stop`, `storage-init`,    |
|             | `storage-upload`, `storage-download`, `storage-list`                 |
| Auth        | `auth-start`, `auth-stop`, `auth-user`                               |
| Eval        | `eval`, `eval-report`, `eval-reset`                                  |
| Environment | `env-setup`, `env-reset`, `env-secrets`, `env-storage`, `env-github` |
| CLI         | `cli-chat`, `cli-search`, `cli-query`, `cli-subjects`                |

### process-tools Path Fix

Currently `process-tools` uses `--proto-root=../../` to navigate from
`products/guide/` to the monorepo root where `proto/` lives. From the root, this
becomes:

```makefile
process-tools:
	@$(ENVLOAD) npx fit-process-tools
```

No `--proto-root` needed — `proto/` is already adjacent.

### CLI Targets Change

CLI targets that reference `./bin/fit-guide.js` and `./scripts/*.js` change to
use the product's bin via npx, or reference scripts at root:

```makefile
cli-chat:
	@$(ENVLOAD) npx fit-guide $(ARGS)
```

### Coexistence with Root package.json Scripts

The root `package.json` already has scripts for Pathway (`dev`, `start`,
`check`, `test`). The Makefile targets for those NPM scripts pass through:

```makefile
dev:
	@npm run dev

check:
	@npm run check
```

The Makefile adds operational targets that npm scripts don't cover (processing,
services, Docker, storage, environment). No conflict.

---

## docker-compose.yml

### Changes

Moves from `products/guide/docker-compose.yml` to root. Build context changes:

```yaml
# Before (from products/guide/):
agent:
  build:
    context: ../..
    dockerfile: Dockerfile
    args:
      TARGET_PATH: services/agent

# After (from root):
agent:
  build:
    context: .
    dockerfile: Dockerfile
    args:
      TARGET_PATH: services/agent
```

Network aliases change from `*.guide.local` to product-agnostic names:

```yaml
networks:
  internal:
    driver: bridge

services:
  agent:
    networks:
      internal:
        aliases:
          - agent.local
```

The `.env.docker` file updates proxy and embedding URLs accordingly:

```
HTTPS_PROXY=http://gateway.local:3128
EMBEDDING_BASE_URL=http://tei.local:8080
```

### Infrastructure Containers

Gateway, DB, TEI, MinIO, Supabase storage — all generic. No product-specific
container configuration needed.

---

## scripts/env.sh

### Simplified

Since the Makefile runs from root, `STORAGE_ROOT` pinning is no longer needed:

```bash
#!/usr/bin/env bash
set -e

ENV="${ENV:-local}"
STORAGE="${STORAGE:-local}"
AUTH="${AUTH:-none}"

set -a
[ -f .env ] && source .env
[ -f ".env.${ENV}" ] && source ".env.${ENV}"
[ -f ".env.storage.${STORAGE}" ] && source ".env.storage.${STORAGE}"
[ -f ".env.auth.${AUTH}" ] && source ".env.auth.${AUTH}"
set +a

exec "$@"
```

The `STORAGE_ROOT` line is removed. `libstorage`'s `findUpward` from cwd (the
monorepo root) finds `config/` directly.

---

## libconfig / libstorage Path Resolution

### How It Works Today

1. `createStorage("config")` in `libstorage` checks `STORAGE_ROOT` env var
2. If not set, uses `Finder.findUpward(cwd, "config")` to walk up from cwd
3. `Config.rootDir` returns the parent of the resolved config directory

### After the Move

From the monorepo root:

- `cwd` = monorepo root
- `findUpward(root, "config")` finds `./config/` immediately
- `rootDir` = monorepo root
- `data/`, `generated/`, `config/` all resolve relative to root

No library changes needed. The path resolution already works — the Guide's
`STORAGE_ROOT` hack was only necessary because the Makefile ran from
`products/guide/` while libraries resolved from their own package directories.

---

## Service Management

### No Changes to librc

`fit-rc` reads `config.json` via `createInitConfig()`, which uses
`createStorage("config")`. With `config/` at root, `fit-rc` finds it naturally.

Runtime files (`svscan.sock`, `svscan.pid`, `svscan.log`) land in `data/` at
root, exactly where they land today (relative to `config.rootDir`).

Service commands like `npm run dev -w @forwardimpact/svcagent` work from any
directory in the monorepo — npm resolves workspaces from the root
`package.json`.

### Service Startup

```bash
make rc-start                    # Start all services
make rc-start SERVICE=agent      # Start up to agent
make rc-status                   # Show status
make rc-stop                     # Stop all
```

Equivalent to today's flow but from root instead of `products/guide/`.

---

## Migration Path

### Phase 1: Copy Infrastructure to Root

1. Copy `products/guide/.env*.example` → root `.env*.example`
2. Copy `products/guide/scripts/` → root `scripts/`
3. Copy `products/guide/config/*.example.*` → root `config/*.example.*`
4. Copy `products/guide/config/agents/*.example.md` → root
   `config/agents/*.example.md`
5. Copy `products/guide/Makefile` → root `Makefile` (adapt paths)
6. Move `products/guide/docker-compose.yml` → root `docker-compose.yml` (adapt
   build contexts)
7. Move `products/guide/examples/` → root `examples/`

### Phase 2: Adapt Makefile

1. Remove `--proto-root` from `process-tools`
2. Update CLI targets to use `npx fit-guide` instead of `./bin/fit-guide.js`
3. Remove `STORAGE_ROOT` from `env.sh`
4. Update docker-compose network aliases (drop `guide.` prefix)
5. Test all targets from root

### Phase 3: Initialize & Verify

```bash
make env-setup          # Reset .env files from examples
make env-secrets        # Generate secrets
make data-init          # Create data directories, copy example knowledge
make process-fast       # Process agents, resources, tools, graphs
make rc-start           # Start services
make cli-chat           # Verify end-to-end
```

### Phase 4: Clean Up Guide

1. Remove `products/guide/.env*`, `Makefile`, `scripts/`, `config/`, `data/`,
   `examples/`, `docker-compose.yml`, `infrastructure/`
2. Guide's `package.json` keeps only `bin` and dependencies
3. Guide becomes a thin product package: `bin/fit-guide.js` + `package.json`

### Phase 5: .gitignore

Root `.gitignore` adds:

```
# Environment and runtime
.env
.env.local
.env.docker
.env.storage.*
.env.auth.*
!.env*.example

# Config (generated from examples)
config/config.json
config/tools.yml
config/ingest.yml
config/eval.yml
config/agents/*.agent.md
!config/agents/*.agent.example.md

# Runtime data
data/
```

---

## What This Enables

### Multi-Product Operation

Any product that needs processing, services, or storage uses the same root
infrastructure. A future Map product needing graph and vector processing adds
config entries — no new Makefile, no new env files.

### Single Secret Set

One `.env` file for the entire monorepo. No secret duplication across products.

### Unified Service Stack

All services (agent, graph, llm, memory, tool, trace, vector, web) run once and
serve all products. No per-product service instances.

### Consistent Developer Experience

```bash
# From monorepo root — all operations
make env-setup
make data-init
make process
make rc-start
make cli-chat

# Product CLIs still work
npx fit-guide
npx fit-pathway dev
npx fit-map validate
npx fit-basecamp --init ~/Documents
```

### Docker from Root

```bash
# Build and run with storage backend
make docker-build
make docker-up-minio STORAGE=minio
```

Build context is `.` (root), which is what the `Dockerfile` already expects — it
copies `libraries/`, `services/`, and `package*.json` from root.

---

## Non-Goals

- **Product-specific configs**: Each product doesn't get its own `config.json`.
  One unified config with namespaces.
- **Per-product data directories**: One `data/` tree. Products share the
  resource, graph, and vector stores.
- **Multiple service stacks**: One set of gRPC services serves all products.
- **Backward compatibility shim**: Guide's `Makefile` is removed, not wrapped.
  Clean break.

---

## Risks

| Risk                           | Mitigation                                          |
| ------------------------------ | --------------------------------------------------- |
| Guide Makefile entrenchment    | Phase 4 removes it completely — clean break         |
| `STORAGE_ROOT` still needed    | Keep fallback in `libstorage` for external installs |
| Docker alias breakage          | Update all `.env.docker` references in one commit   |
| Root `Makefile` conflicts      | No existing root Makefile; root `package.json`      |
|                                | scripts are pass-through only, no overlap           |
| `findUpward` from library dirs | Tested: from `libraries/*/`, walks up to root and   |
|                                | finds `config/` at depth 2 — within default max 3   |

---

## Summary

The Guide's operational infrastructure is generic. Moving it to the monorepo
root eliminates duplication, creates a single operational surface, and enables
all products to share environment, services, and data. No library changes needed
— `libconfig`, `libstorage`, and `librc` already resolve paths relative to
wherever `config/` is found. The Makefile, env files, and scripts move as-is
with minor path adjustments.
