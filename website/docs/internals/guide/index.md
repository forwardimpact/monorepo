---
title: Guide Internals
description: "Agent infrastructure — orchestration pipeline, tool execution, knowledge pipeline, and service stack."
---

> **Note:** Guide and its service stack (`fit-rc`, `fit-guide`) are
> monorepo-only tools not published to npm. Running Guide requires a full
> monorepo checkout.

## Architecture

Guide is an AI agent that understands your organization's engineering framework
and reasons about it in context. It operates through a multi-agent orchestration
pipeline backed by a service stack of specialized microservices.

The core orchestration follows a planner -> researcher -> editor pipeline:

1. **Planner** -- Analyzes the user's query, consults the ontology, classifies
   the query type, and defines success criteria for the researcher.
2. **Researcher** -- Executes the plan by calling tools (graph queries, vector
   search, agent delegation) to gather facts and evidence.
3. **Editor** -- Synthesizes the researcher's findings into a coherent response
   for the user.

---

## Tool Execution

Agents call tools during conversation turns. When the LLM returns tool calls,
each is executed via the Tool service. Available tool types include:

- **Graph queries** -- `get_ontology`, `get_subjects`, `query_by_pattern` for
  structured knowledge graph lookups
- **Vector search** -- Semantic similarity search across embedded documents
- **Agent delegation** -- `list_handoffs`, `run_handoff` for multi-agent
  coordination

Tool descriptors are defined in `config/tools.yml`, which maps tool names to
descriptions, parameters, and evaluation criteria. The Tool service resolves
tool calls to the appropriate backend (graph, vector, or agent service).

---

## Knowledge Pipeline

```
HTML files -> typed resources -> RDF triples (graph store)
                              + vector embeddings (vector store)
```

Documents are processed through a dual-index pipeline:

1. **Extraction** -- HTML files are parsed and typed as resources (articles,
   guides, FAQs, etc.)
2. **Graph indexing** -- Resources are converted to RDF triples and stored in
   the graph service for precise structured lookups
3. **Vector indexing** -- Resources are embedded via TEI (Text Embeddings
   Inference) and stored in the vector service for fuzzy semantic retrieval

This dual index enables both precise graph queries ("what skills does the
platform track modify?") and fuzzy semantic retrieval ("how should I approach
system design?").

---

## Conversation Memory

Memory is built newest-first within a token budget. The memory service maintains
conversation history per resource (session), and when constructing the context
window:

- Messages are added from newest to oldest until the token budget is exhausted
- Tool call/response pairs are never split -- both are included or both are
  excluded
- System messages and the current user message always fit within budget

---

## Service Stack

Guide requires the full service stack, supervised by `fit-rc`. Services start in
dependency order:

| Order | Service | Purpose                                  | Port |
| ----- | ------- | ---------------------------------------- | ---- |
| 1     | tei     | Text Embeddings Inference (local)        | 8090 |
| 2     | trace   | Distributed tracing                      | 3002 |
| 3     | vector  | Vector similarity search                 | 3003 |
| 4     | graph   | RDF triple store and SPARQL queries      | 3004 |
| 5     | llm     | LLM inference proxy                      | 3005 |
| 6     | memory  | Conversation history and token budgeting | 3006 |
| 7     | tool    | Tool call resolution and execution       | 3007 |
| 8     | agent   | Agent orchestration and handoffs         | 3008 |
| 9     | web     | HTTP API and web interface               | 3001 |

Start all services with `bunx fit-rc start` or `make rc-start`.

---

## Agent Configuration

Agent definitions live in `config/agents/` as Markdown files with YAML front
matter:

```markdown
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
    prompt: Execute the plan below.
---

# Planner Agent

You create execution plans for knowledge queries...
```

### Key Fields

| Field         | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `name`        | Agent identifier                                      |
| `infer`       | Whether to use tool inference (vs explicit tool list) |
| `tools`       | Explicit list of available tools                      |
| `handoffs`    | Other agents this agent can delegate to               |
| `description` | Short description for tool listings                   |

### Default Agents

| Agent      | File                  | Role                           |
| ---------- | --------------------- | ------------------------------ |
| planner    | `planner.agent.md`    | Query analysis, plan creation  |
| researcher | `researcher.agent.md` | Data retrieval, fact gathering |
| editor     | `editor.agent.md`     | Response synthesis, formatting |
| eval_judge | `eval_judge.agent.md` | Evaluation judging for evals   |

---

## Tool Descriptors

`config/tools.yml` maps tool names to their specifications:

```yaml
get_ontology:
  purpose: Returns the complete schema vocabulary...
  applicability: Required before constructing structured queries...
  instructions: No input parameters...
  evaluation: Complete schema showing available types and predicates.
  parameters: {}

get_subjects:
  purpose: Lists entity URIs in the graph, optionally filtered by type.
  parameters:
    type: Entity type URI to filter by
```

Each tool descriptor includes `purpose`, `applicability`, `instructions`,
`evaluation` criteria, and `parameters` -- providing the LLM with enough context
to select and call tools correctly.

---

## Data Directories

| Path                  | Purpose                          |
| --------------------- | -------------------------------- |
| `config/agents/`      | Agent prompt files (\*.agent.md) |
| `config/tools.yml`    | Tool endpoint definitions        |
| `config/config.json`  | Service and model configuration  |
| `data/knowledge/`     | Processed knowledge base content |
| `products/guide/bin/` | CLI entry point (fit-guide)      |

---

## Related Documentation

- [Map Internals](/docs/internals/map/) -- Data contracts consumed by Guide
- [Finding Your Bearing Guide](/docs/guides/finding-your-bearing/) --
  User-facing Guide documentation
