---
name: fit-guide
description: >
  Work with the @forwardimpact/guide product. Use when using the fit-guide CLI,
  configuring agents, managing the knowledge platform services, processing data,
  or working with the conversational agent interface.
---

# Guide Product

AI agent that understands your organization's engineering framework — skills,
levels, behaviours, and expectations — and reasons about them in context. Guide
helps engineers onboard, find growth areas, and interpret engineering artifacts
against skill markers.

## When to Use

**Using the conversational CLI:**

- Running the fit-guide REPL for interactive agent conversations
- Piping prompts to fit-guide for scripted queries
- Troubleshooting agent responses or connectivity

**Managing agents and tools:**

- Configuring agent definitions (`config/agents/*.agent.md`)
- Editing tool descriptors (`config/tools.yml`)
- Processing agents, resources, tools, vectors, or graphs

**Operating the service stack:**

- Starting, stopping, or checking service status via fit-rc
- Setting up environment files and secrets
- Initializing data directories and example knowledge
- Running evaluations against the agent platform

---

## How It Works

### Agent Orchestration

The CLI sends user messages to the Agent gRPC service, which orchestrates
multi-turn conversations. The default pipeline is **planner → researcher →
editor**: the planner analyzes the query and creates an execution plan, the
researcher retrieves relevant data using tools (graph queries, vector search),
and the editor synthesizes the final response. Agents hand off to each other via
configured `handoffs`.

### Tool Execution

Agents call tools during conversation turns. Available tools include graph
queries (`get_ontology`, `query_by_pattern`), vector similarity search
(`search_content`), and agent delegation (`run_sub_agent`, `run_handoff`). When
the LLM returns tool calls, each is executed via the Tool service, results are
appended to the conversation, and the LLM is called again with the new context.

### Knowledge Pipeline

Content flows through three stages: HTML files in `data/knowledge/` are
processed into typed resources (`data/resources/`), then indexed as RDF triples
in the graph store (`data/graphs/`) for structured queries, and as vector
embeddings (`data/vectors/`) for similarity search. This dual index lets agents
combine precise graph lookups with fuzzy semantic retrieval.

### Conversation Memory

Each conversation maintains a memory window — the most recent messages that fit
within the model's token budget. The window is built newest-first: it includes
system prompt, tool definitions, and as much conversation history as the budget
allows, ensuring tool call/response pairs are never split.

---

## CLI Reference

### Conversational Agent

```sh
make cli-chat                    # Interactive REPL — multi-turn conversations
make cli-chat ARGS="--help"      # Pass arguments via ARGS
echo "Tell me about X" | make cli-chat   # Piped single prompt
```

**Always use `make cli-chat`** — it loads the required environment
automatically. Running `npx fit-guide` directly requires env to be loaded first
(`. scripts/env.sh && npx fit-guide`).

The CLI connects to the Agent gRPC service, maintains conversation context
across turns, and persists session state locally.

### Supporting CLI Tools

```sh
make cli-search ARGS="query text"   # Vector similarity search
make cli-query ARGS="s p o"         # Graph triple pattern queries
make cli-subjects ARGS="type"       # List graph subjects by type
make cli-visualize                  # Trace visualization
make cli-window                     # Fetch memory window as JSON
make cli-completion                 # Send window to LLM API
make cli-tiktoken ARGS="text"       # Token counting
make cli-unary ARGS="service method"  # Unary gRPC calls
```

---

## Service Stack

Guide requires the gRPC service stack to be running. Services are supervised by
fit-rc and defined in `config/config.json`.

### Service Lifecycle

```sh
make env-setup          # Reset .env files from examples, generate secrets
make data-init          # Create data directories, copy example knowledge
make process            # Process agents, resources, tools, graphs, vectors
make process-fast       # Process without vectors (faster)
make rc-start           # Start all services
make rc-status          # Check service health
make rc-stop            # Stop all services
make rc-restart         # Restart all services
```

### Service Order

Services start in dependency order (defined in `config/config.json`):

1. **tei** — Text Embeddings Inference (local embeddings)
2. **trace** — Distributed tracing
3. **vector** — Embedding vector store
4. **graph** — RDF knowledge graph
5. **llm** — LLM completion proxy
6. **memory** — Conversation memory
7. **tool** — Tool dispatch
8. **agent** — Agent orchestration (fit-guide connects here)
9. **web** — HTTP API gateway

### TEI Setup (First Time)

```sh
make tei-install        # Install via cargo (one-time)
make tei-start          # Start TEI (downloads model on first run)
```

---

## Environment

### Layered Configuration

Environment is loaded by `scripts/env.sh` in layers:

| Layer   | File                     | Controls                  |
| ------- | ------------------------ | ------------------------- |
| Base    | `.env`                   | API credentials, secrets  |
| Network | `.env.{ENV}`             | localhost vs Docker DNS   |
| Storage | `.env.storage.{STORAGE}` | local, MinIO, or Supabase |
| Auth    | `.env.auth.{AUTH}`       | none, GoTrue, or Supabase |

Three variables control the stack:

| Variable  | Values                       | Default |
| --------- | ---------------------------- | ------- |
| `ENV`     | `local`, `docker`            | `local` |
| `STORAGE` | `local`, `minio`, `supabase` | `local` |
| `AUTH`    | `none`, `gotrue`, `supabase` | `none`  |

### Setup Commands

```sh
make env-setup          # Full setup: reset + secrets + storage credentials
make env-reset          # Reset .env and config files from examples
make env-secrets        # Generate SERVICE_SECRET, JWT_SECRET, JWT_ANON_KEY
make env-storage        # Generate storage backend credentials
make env-github         # Configure GitHub token (LLM_TOKEN, LLM_BASE_URL)
```

---

## Data Pipeline

### Processing

All processing runs from the monorepo root via `make` targets:

```sh
make process            # All: agents + resources + tools + graphs + vectors
make process-fast       # All except vectors (faster iteration)
make process-agents     # Process agent definitions from config/agents/
make process-resources  # Process knowledge resources from data/knowledge/
make process-tools      # Process tool definitions from config/tools.yml + proto/
make process-vectors    # Build vector indices from data/resources/
make process-graphs     # Build graph indices from data/resources/
```

### Data Directories

| Path              | Contents                                   |
| ----------------- | ------------------------------------------ |
| `data/knowledge/` | Input HTML files                           |
| `data/resources/` | Processed resources                        |
| `data/vectors/`   | Embedding vector indices                   |
| `data/graphs/`    | RDF quad index + ontology                  |
| `data/memories/`  | Conversation state                         |
| `data/traces/`    | Distributed traces                         |
| `data/policies/`  | Access control policies                    |
| `data/logs/`      | Service logs                               |
| `data/cli/`       | CLI session data                           |
| `data/eval/`      | Evaluation results                         |
| `data/ingest/`    | Ingestion pipeline (in/pipeline/done)      |
| `examples/`       | Example datasets (copied to data/ on init) |

---

## Agent Configuration

### Agent Definitions (`config/agents/`)

Agent files use YAML front matter + Markdown body:

```yaml
---
name: planner
description: Analyzes queries and creates execution plans.
infer: false
tools:
  - get_ontology
  - list_handoffs
  - run_handoff
handoffs:
  - label: researcher
    agent: researcher
    prompt: |
      Execute the plan below.
---

# Planner Agent

[Agent instructions in Markdown...]
```

Key fields:

| Field      | Purpose                                   |
| ---------- | ----------------------------------------- |
| `name`     | Agent identifier                          |
| `infer`    | Whether agent can be spawned as sub-agent |
| `tools`    | List of tool names this agent can call    |
| `handoffs` | Agents this agent can hand off to         |

Default agents: **planner** (creates plans), **researcher** (retrieves data),
**editor** (synthesizes responses).

Reset from examples: `make config-reset`

### Tool Descriptors (`config/tools.yml`)

Maps tool names to descriptions and parameters. Tools include graph queries
(`get_ontology`, `get_subjects`, `query_by_pattern`), search (`search_content`),
agent delegation (`run_sub_agent`, `list_sub_agents`), and handoff control
(`list_handoffs`, `run_handoff`).

---

## Docker

```sh
make docker-build       # Build images only
make docker-up          # Start core services
make docker-up-minio    # Start with MinIO storage
make docker-up-supabase # Start with Supabase
make docker-down        # Stop all containers
```

Docker networking uses `.env.docker` with service aliases (`agent.local`,
`tei.local`, etc.).

---

## Storage Backends

```sh
make storage-setup      # Full: start + wait + init + upload
make storage-start      # Start storage containers
make storage-stop       # Stop storage containers
make storage-init       # Create bucket
make storage-upload     # Upload data to backend
make storage-download   # Download data from backend
make storage-list       # List storage contents
```

---

## Common Tasks

### Quick Start (New Setup)

```sh
npm install             # Install all workspace dependencies
make quickstart         # Bootstrap: env, generate, data, codegen, process
make rc-start           # Start services (supabase/tei auto-skipped if not installed)
make cli-chat           # Verify end-to-end
```

`make quickstart` chains: `env-setup` → `generate-cached` → `data-init` →
`codegen` → `process-fast`. It generates synthetic organizational content from
the prose cache directly into `data/`, and processes all resources.

For individual steps or custom generation:

```sh
make synthetic-update   # Generate with LLM prose (requires LLM_TOKEN)
make data-init          # Create data directories
make process            # Full processing including vectors (requires TEI)
```

### Reset Everything

```sh
make rc-stop
make data-reset
make process
make rc-start
```

### Add a New Agent

1. Create `config/agents/{name}.agent.example.md` with YAML front matter
2. Copy to `config/agents/{name}.agent.md` (or run `make config-reset`)
3. Run `make process-agents` to register it
4. Reference from other agents' `handoffs` list

### Add a New Tool

1. Add tool definition to `config/tools.example.yml`
2. Copy to `config/tools.yml` (or run `make config-reset`)
3. Run `make process-tools` to register it
4. Add tool name to agent definitions that should use it

### Ingest New Knowledge

1. Generate HTML files (e.g., `npx fit-universe --cached` writes directly to
   `data/knowledge/`)
2. Run `make process-resources` to create resources
3. Run `make process-graphs` to build graph index
4. Run `make process-vectors` to build vector index (requires TEI)

## Verification

```sh
make rc-status          # All services should show "running"
make cli-chat           # Should get agent responses
make cli-search ARGS="test query"  # Should return search results
make cli-subjects       # Should list graph entities
```

## Documentation

For deeper context beyond this skill's scope:

- [Finding Your Bearing Guide](https://www.forwardimpact.team/docs/guides/finding-your-bearing/index.md)
  — How Guide helps engineers navigate their engineering framework
