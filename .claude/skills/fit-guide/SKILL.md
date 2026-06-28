---
name: fit-guide
description: >
  Get career guidance and output review grounded in your organization's
  engineering standard. Use when a promotion conversation
  ended without specifics and you need evidence of what to improve, when
  reviewing agent output and you want a second opinion against the
  standard, or when asking about skills, levels, and career expectations.
  Also covers setting up the Guide service stack and ingesting knowledge
  content.
---

# Guide Product

AI agent that understands your organization's agent-aligned engineering standard
— skills, levels, behaviours, and expectations — and reasons about them in
context. Guide helps engineers onboard, find growth areas, and interpret
engineering artifacts against skill markers.

Guide runs on the Claude Agent SDK and exposes its knowledge through MCP, making
it accessible from three surfaces: `fit-guide` CLI, Claude Code, and Claude
Chat.

## When to Use

**Find growth areas:**

- Getting career guidance grounded in your organization's standard —
  `npx fit-guide "What should I focus on to reach the next level?"`
- Asking about skills, levels, behaviours, and expectations —
  `npx fit-guide "What does practitioner-level delivery look like?"`
- Checking whether recent work shows progress —
  `npx fit-guide "Does my recent PR show growth in code quality?"`

**Verify agent work:**

- Interpreting engineering artifacts against skill markers —
  `npx fit-guide "Review this diff against senior delivery expectations"`
- Getting a second opinion before approving a deliverable —
  `npx fit-guide "Does this design doc meet the standard for system design?"`

**Setup and operations:**

- Bootstrap a new project — `npx fit-guide --init` (safe to re-run; no-op on
  existing projects)
- Authenticate — `npx fit-guide login`
- Start the service stack — `npx fit-rc start`
- Check system readiness — `npx fit-guide status`
- Process knowledge content — `npx fit-process-resources`,
  `npx fit-process-graphs`, `npx fit-process-vectors`

---

## How It Works

### Agent Orchestration

The CLI sends user queries to the Claude Agent SDK, which orchestrates the
conversation using a single-agent `guide-default` prompt. The agent follows a
structured workflow: orient (explore the ontology), query (retrieve data via
tools), and synthesize (compose a grounded answer). The SDK handles context
compaction and session persistence automatically.

### Tool Execution

Guide exposes 10 tools via an MCP endpoint, each backed by a gRPC service:

| Tool                             | Backend | Purpose                      |
| -------------------------------- | ------- | ---------------------------- |
| `get_ontology`                   | graph   | Schema vocabulary            |
| `get_subjects`                   | graph   | Entity URIs by type          |
| `query_by_pattern`               | graph   | Triple-pattern graph queries |
| `search_content`                 | vector  | Semantic similarity search   |
| `pathway_list_jobs`              | pathway | Job combinations             |
| `pathway_describe_job`           | pathway | Full job description         |
| `pathway_list_agent_profiles`    | pathway | Agent profile definitions    |
| `pathway_describe_agent_profile` | pathway | Agent profile detail         |
| `pathway_describe_progression`   | pathway | Level progression deltas     |
| `pathway_list_job_software`      | pathway | Software toolkit per job     |

### Knowledge Pipeline

Content flows through three stages: HTML files in `data/knowledge/` are
processed into typed resources (`data/resources/`), then indexed as RDF triples
in the graph store (`data/graphs/`) for structured queries, and as vector
embeddings (`data/vectors/`) for similarity search. This dual index lets the
agent combine precise graph lookups with fuzzy semantic retrieval.

### Three Surfaces

- **`fit-guide` CLI** — Reference implementation on the Claude Agent SDK.
  Fetches the `guide-default` prompt from MCP and streams the response.
- **Claude Code** — Register the MCP endpoint as an MCP server. Guide's tools
  appear in the tool picker; Claude Code provides the harness.
- **Claude Chat** — Configure a Claude Connector backed by the MCP endpoint.
  Same tools, same knowledge, same answers.

---

## Initialization

Run `npx fit-guide --init` in a fresh project directory. It produces `.env`
(token and port assignments) and `config/config.json` (service composition).
Re-runs are byte-stable no-ops — generated `SERVICE_SECRET` and `MCP_TOKEN`
are preserved across invocations, so running init again to pick up a starter
update never rotates credentials. Then authenticate and set up the stack:

```sh
npx fit-guide --init        # Bootstrap .env + config/config.json (idempotent)
npx fit-codegen --all       # Generate gRPC stubs and field metadata
npx fit-guide --login       # OAuth PKCE login (or set ANTHROPIC_API_KEY in .env)
npx fit-process-resources   # Process starter knowledge HTML
npx fit-process-graphs      # Build the RDF index
npx fit-process-vectors     # Build the vector index (skip if no embeddings backend)
npx fit-rc start            # Launch the service stack
npx fit-guide "What skills does a senior engineer need?"
```

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Service Stack

Guide requires the service stack to be running. Services are supervised by
`fit-rc` and defined in `config/config.json`.

| Order | Service | Protocol        | Purpose                     | Port |
| ----- | ------- | --------------- | --------------------------- | ---- |
| 1     | trace   | gRPC            | Distributed tracing         | 3001 |
| 2     | vector  | gRPC            | Vector similarity search    | 3002 |
| 3     | graph   | gRPC            | RDF triple store            | 3003 |
| 4     | pathway | gRPC            | Standard data service       | 3004 |
| 5     | mcp     | Streamable HTTP | MCP tool and prompt gateway | 3005 |

### MCP Endpoint Configuration

For Claude Code, register the MCP endpoint in your MCP server config:

```json
{
  "guide": {
    "url": "http://localhost:3005",
    "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
  }
}
```

### Authentication

| Surface         | LLM auth                     | MCP auth           |
| --------------- | ---------------------------- | ------------------ |
| `fit-guide` CLI | `ANTHROPIC_API_KEY` or OAuth | Bearer `MCP_TOKEN` |
| Claude Code     | Host credential              | Bearer `MCP_TOKEN` |
| Claude Chat     | Host credential              | Bearer `MCP_TOKEN` |

---

## Data Pipeline

See [`references/data.md`](references/data.md) for processing steps and
directory layout.

---

## Verification

```sh
npx fit-guide status                    # All services should show "ok"
echo "hello" | npx fit-guide            # Should return an agent response
```

## Documentation

- [Guide Overview](https://www.forwardimpact.team/guide/index.md) — Product
  overview, audience model, and key concepts
- [Getting Started: Guide for Engineers](https://www.forwardimpact.team/docs/getting-started/engineers/guide/index.md)
  — Set up the AI agent that understands your engineering standard
- [See What's Expected at Your Level](https://www.forwardimpact.team/docs/products/career-paths/index.md)
  — Stop guessing what your level requires
- [Understand Autonomy and Scope](https://www.forwardimpact.team/docs/products/career-paths/autonomy-scope/index.md)
  — What each level implies for decision-making and ownership
- [Get Career Guidance Grounded in the Standard](https://www.forwardimpact.team/docs/products/growth-areas/index.md)
  — Identify gaps and track progress toward the next level
- [Ask a Growth Question](https://www.forwardimpact.team/docs/products/growth-areas/growth-question/index.md)
  — Get context-specific guidance grounded in your standard
- [Check Progress Toward Next Level](https://www.forwardimpact.team/docs/products/growth-areas/check-progress/index.md)
  — See where you stand against level expectations
- [Get Output Review Grounded in the Standard](https://www.forwardimpact.team/docs/products/trust-output/index.md)
  — Know what to expect from agent output
- [Get a Second Opinion on a Deliverable](https://www.forwardimpact.team/docs/products/trust-output/second-opinion/index.md)
  — Have the Guide review work against quality criteria
