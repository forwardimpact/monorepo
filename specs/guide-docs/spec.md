# Guide Processing & Embedding — Draft Notes

> Input for writing the actual documentation. Covers the full processing
> pipeline from raw HTML knowledge files through resource extraction, graph
> indexing, and vector embedding.

## Pipeline Overview

```
HTML Knowledge Files (data/knowledge/)
  │
  ├─ process-agents ─── .agent.md configs ──→ common.Agent resources
  │
  ├─ process-resources ─ HTML+microdata ────→ common.Message resources (RDF)
  │     │
  │     ├─ process-graphs ──────────────────→ Graph index + ontology
  │     │
  │     └─ process-vectors ─────────────────→ Vector embeddings
  │
  └─ process-tools ──── proto + YAML ───────→ tool.ToolFunction resources

All output lands in data/resources/, data/graphs/, data/vectors/
```

### Make Targets

| Target | What it does |
|--------|-------------|
| `make data-init` | Create directories, copy example knowledge to `data/knowledge/` |
| `make data-clean` | Remove all generated data |
| `make process-agents` | Parse `config/agents/*.agent.md` into Agent resources |
| `make process-resources` | Parse HTML knowledge into Message resources |
| `make process-tools` | Generate tool schemas from protobuf + YAML descriptors |
| `make process-graphs` | Build RDF graph index and SHACL ontology from Messages |
| `make process-vectors` | Embed Message content via TEI, store in vector index |
| `make process-fast` | All of the above except vectors |
| `make process` | All of the above including vectors |

Run order matters: `process-resources` must complete before `process-graphs`
or `process-vectors`, since both read from the resource index.

---

## 1. Resource Processing

### Input

HTML files in `data/knowledge/` containing schema.org microdata. Each file may
contain multiple entities (Person, Organization, Drug, etc.) annotated with
`itemscope`, `itemtype`, and `itemprop` attributes.

### Processing Steps

1. **Sanitize** — Walk DOM text nodes, fix stray angle brackets (`<1`, `>9`),
   smart quotes, non-breaking spaces, stray ampersands. Prevents RDF parse
   failures downstream.

2. **Parse microdata → RDF** — `MicrodataRdfParser` extracts structured triples
   from HTML5 microdata. Blank nodes are skolemized to stable named nodes.

3. **Group by entity** — Quads are grouped by subject IRI. Only items with a
   `schema.org` type assertion (`rdf:type`) are kept.

4. **Serialize to Turtle** — Each entity's quads are serialized to Turtle RDF
   format. Type assertions are sorted first (canonical ordering for downstream
   graph processing).

5. **RDF union merge** — If the same entity IRI appears in multiple HTML files,
   its quads are merged using set union. The resource is only updated when the
   merged set is larger. This implements open-world semantics where each file
   contributes partial facts.

6. **Store** — Each entity becomes a `common.Message` resource with:
   - `role: "system"`
   - `content`: Turtle RDF string
   - `id.name`: SHA-256 hash of the entity IRI
   - `id.subjects`: array of entity IRIs in this resource

### Output

`data/resources/common.Message.{hash}.json` — one file per entity.

### Key Library

`@forwardimpact/libresource` — `ResourceProcessor`, `Parser`, `Skolemizer`,
`sanitizeDom`.

---

## 2. Agent Processing

### Input

Markdown files at `config/agents/*.agent.md` with YAML front matter:

```markdown
---
name: planner
description: Plans multi-step tasks
tools: [get_ontology, get_subjects, query_by_pattern, search_content]
infer: true
handoffs: []
---

You are a planning agent. You break down complex questions...
```

### Output

`data/resources/common.Agent.{name}.json` — one file per agent. The markdown
body becomes the agent's system prompt (`content` field).

### Key Library

`@forwardimpact/libagent` — `AgentProcessor`.

---

## 3. Tool Processing

### Input

Two configuration sources:

- `config/config.json` → `service.tool.endpoints` — maps tool names to gRPC
  methods (e.g., `graph.Graph.GetOntology`)
- `config/tools.yml` — human-authored descriptors with `purpose`,
  `applicability`, `instructions`, `evaluation`, and `parameters`

Protobuf definitions at `proto/{package}.proto` provide the request message
schema.

### Processing Steps

1. Load endpoints and descriptors in parallel.
2. For each tool, resolve its `.proto` file (`tools/` then `proto/` fallback).
3. Parse the protobuf service definition, find the request message type.
4. Generate OpenAI-compatible JSON schema from protobuf fields. Skip system
   fields (`llm_token`, `filter`, `resource_id`). Map protobuf types to JSON
   schema types. Repeated fields become arrays.
5. Build description from descriptor fields as structured text:
   `PURPOSE: ... WHEN TO USE: ... HOW TO USE: ... RETURNS: ...`
6. Store as `tool.ToolFunction` resource.

### Output

`data/resources/tool.ToolFunction.{name}.json` — one file per tool endpoint.

### Default Tools

| Tool | gRPC Method | Purpose |
|------|-------------|---------|
| `get_ontology` | `graph.Graph.GetOntology` | Schema vocabulary (types + predicates) |
| `get_subjects` | `graph.Graph.GetSubjects` | List entity URIs by type |
| `query_by_pattern` | `graph.Graph.QueryByPattern` | Triple pattern queries |
| `search_content` | `vector.Vector.SearchContent` | Semantic similarity search |
| `list_sub_agents` | `agent.Agent.ListSubAgents` | Discover available sub-agents |
| `run_sub_agent` | `agent.Agent.RunSubAgent` | Delegate task to sub-agent |
| `list_handoffs` | `agent.Agent.ListHandoffs` | Discover handoff targets |
| `run_handoff` | `agent.Agent.RunHandoff` | Transfer conversation control |

### Key Library

`@forwardimpact/libtool` — `ToolProcessor`. CLI: `fit-process-tools`.

---

## 4. Graph Processing

### Input

`common.Message` resources containing Turtle RDF in their `content` field.

### Processing Steps

1. Load all resource identifiers, filter out Conversations, ToolFunctions, and
   Agents (no RDF content).
2. Skip resources already in the graph index (incremental processing).
3. Parse Turtle content back to RDF quads.
4. Sort quads: `rdf:type` assertions first. The OntologyProcessor needs type
   information before processing property triples to detect inverse
   relationships.
5. Add quads to the N3 Store (in-memory triple store).
6. Feed each quad to the OntologyProcessor to build SHACL shapes.
7. After all items: serialize ontology as Turtle and save.

### Output

- `data/graphs/index.jsonl` — one JSON line per resource, containing `id`,
  `identifier` (with subjects and token count), and `quads` array.
- `data/graphs/ontology.ttl` — SHACL shapes describing all entity types,
  their properties, instance counts, and relationships. Used by agents to
  understand the graph vocabulary before querying.

### Graph Queries

The graph index supports SPARQL-like triple pattern queries:

```
(subject, predicate, object)
```

Any position can be a wildcard (`?`, `*`, `null`). Prefixed terms (e.g.,
`schema:Person`) are expanded to full URIs. Type synonym resolution uses
`skos:altLabel` from the ontology.

### Key Library

`@forwardimpact/libgraph` — `GraphProcessor`, `GraphIndex`,
`OntologyProcessor`, `ShaclSerializer`.

---

## 5. Vector Embedding

### Input

`common.Message` resources (same as graph processing). The `content` field
(Turtle RDF text) is what gets embedded.

### Processing Steps

1. Load all resource identifiers, filter out Conversations, ToolFunctions,
   and Agents.
2. Skip resources already in the vector index (incremental).
3. Batch embed via TEI service — `POST /embed` with `{ inputs: [text, ...] }`.
   Batches of 4 items processed concurrently.
4. Store each embedding vector with its resource identifier.

### Output

`data/vectors/index.jsonl` — one JSON line per resource, containing `id`,
`identifier` (with subjects and token count), and `vector` (384-dimensional
float array).

### Similarity Search

Query flow:

1. Embed query text via TEI → 384-dim vector.
2. Calculate dot product against every stored vector (loop-unrolled 8x for
   performance). For normalized vectors this equals cosine similarity.
3. Filter by threshold, apply prefix/limit/max_tokens constraints.
4. Return ranked `resource.Identifier[]` with scores.

### Key Library

`@forwardimpact/libvector` — `VectorProcessor`, `VectorIndex`,
`calculateDotProduct`.

---

## TEI (Text Embeddings Inference)

The embedding service that converts text to vectors.

### Model

`BAAI/bge-small-en-v1.5` — 384-dimensional, normalized embeddings. Small
footprint, runs on CPU. Well-suited for semantic search over structured
knowledge.

### API

```
POST /embed
Content-Type: application/json

{ "inputs": ["text one", "text two"] }

→ [[0.015, -0.022, ...], [0.031, -0.041, ...]]
```

Health check: `GET /health`

### Local Setup

Install via Rust:
```bash
cargo install --git https://github.com/huggingface/text-embeddings-inference \
  --features candle text-embeddings-router
```

Or use Makefile:
```bash
make tei-install   # Install TEI binary
make tei-start     # Start on port 8090
```

Config in `config/config.json`:
```json
{
  "name": "tei",
  "command": "text-embeddings-router --model-id BAAI/bge-small-en-v1.5 --port 8090 --json-output --auto-truncate --max-concurrent-requests 32 --tokenization-workers 4"
}
```

### Docker Setup

```yaml
tei:
  image: ghcr.io/huggingface/text-embeddings-inference:cpu-1.5
  command: --model-id BAAI/bge-small-en-v1.5 --port 8080 --json-output
  volumes:
    - tei_data:/data
  environment:
    - HF_HOME=/data
```

Network alias: `tei.guide.local:8080`

### Environment Variable

| Variable | Local | Docker |
|----------|-------|--------|
| `EMBEDDING_BASE_URL` | `http://localhost:8090` | `http://tei.guide.local:8080` |

---

## Environment Configuration

### Required Variables

| Variable | Purpose |
|----------|---------|
| `LLM_TOKEN` | GitHub Models API token (needs `models` scope) |
| `LLM_BASE_URL` | GitHub Models endpoint (org or user level) |
| `SERVICE_SECRET` | HMAC secret for inter-service auth |
| `EMBEDDING_BASE_URL` | TEI endpoint URL |

### Env Files

| File | Contents |
|------|----------|
| `.env` | Base secrets: API tokens, service secret, JWT keys |
| `.env.local` | Local networking: service URLs on localhost |
| `.env.docker` | Docker networking: proxy config, container hostnames |
| `.env.storage.local` | Local filesystem storage paths |
| `.env.storage.minio` | MinIO S3-compatible storage credentials |
| `.env.storage.supabase` | Supabase storage credentials |

Loaded by `scripts/env.sh` based on `ENV`, `STORAGE`, and `AUTH` variables.

---

## Storage Layout

```
products/guide/
├── config/
│   ├── config.json          # Service config (from config.example.json)
│   ├── tools.yml            # Tool descriptors (from tools.example.yml)
│   ├── ingest.yml           # Ingest pipeline config
│   └── agents/
│       ├── planner.agent.md
│       ├── researcher.agent.md
│       └── editor.agent.md
├── data/
│   ├── knowledge/           # Input HTML files (copied from examples/)
│   ├── resources/           # Processed resources (Agent, Message, Tool)
│   ├── graphs/
│   │   ├── index.jsonl      # RDF quad index
│   │   └── ontology.ttl     # SHACL ontology
│   ├── vectors/
│   │   └── index.jsonl      # Embedding vectors (384-dim)
│   ├── memories/            # Conversation state
│   ├── traces/              # Distributed traces
│   └── policies/            # Access control policies
└── examples/
    └── knowledge/           # Example BioNova dataset (22 HTML files)
```

All `data/` and `config/*.json` / `config/*.yml` are gitignored. Only
`examples/` and `config/*.example.*` are tracked.

---

## Example Dataset: BioNova

The example knowledge base represents a fictional pharmaceutical company with
500+ entities across 22 HTML files.

### Entity Types (27 total)

Person (199), ScholarlyArticle (73), BlogPosting (67), Comment (55),
Organization (44), Review (35), Rating (35), FAQPage (35), SoftwareApplication
(28), Role (25), MedicalTrial (22), HowTo (20), Question (19), Answer (18),
DigitalDocument (17), Course (16), MedicalOrganization (15), Project (14),
CreativeWork (12), Drug (10), Policy (9), Event (8), Place (5), Service (3),
PostalAddress (3), Blog (1), Platform (1).

### Key Relationships

- People → Organizations (worksFor, member)
- Organizations → Projects (manages)
- Projects → Drugs (develops)
- Drugs → MedicalTrials (studySubject)
- SoftwareApplications → Dependencies (softwareRequirements)
- Courses → Prerequisites (coursePrerequisites)

### Processing Results

| Step | Count |
|------|-------|
| Input HTML files | 22 |
| Message resources | 888 |
| Agent resources | 4 |
| Tool resources | 8 |
| Graph entries | 888 |
| Ontology types | 27 |
| Vector embeddings | 888 |
| Total resources | 900 |

---

## Quickstart (for docs)

```bash
# From products/guide/

# 1. Set up config
cp config/config.example.json config/config.json
cp config/tools.example.yml config/tools.yml
for f in config/agents/*.agent.example.md; do
  cp "$f" "${f%.example.md}.md"
done

# 2. Set up environment
cp .env.example .env
cp .env.local.example .env.local
# Edit .env with your LLM_TOKEN, LLM_BASE_URL, SERVICE_SECRET

# 3. Initialize data (copies example knowledge)
make data-init

# 4. Process everything (except vectors)
make process-fast

# 5. Start TEI and process vectors
make tei-start
make process-vectors

# 6. Start services and chat
make rc-start
make cli-chat
```

---

## Open Questions for Documentation

- Should the docs cover the ingest pipeline (PDF → HTML) or just the
  processing pipeline?
- How much detail on the agent/tool interaction at query time? The current
  spec focuses on the offline processing, not the runtime query flow.
- Should we document the gRPC service layer or keep it as internal?
- The evaluation framework (`make eval`) is mentioned in config but not
  covered here.
