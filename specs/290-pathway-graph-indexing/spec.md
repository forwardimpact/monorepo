# 290: Make Pathway Framework Data Queryable from fit-guide

## Problem

When a user asks fit-guide about the engineering framework — skills,
capabilities, levels, behaviours, jobs, agents — the agent returns sparse or
empty results. Graph queries like `get_subjects("fit:Skill")` return nothing
because pathway framework data never enters the RDF graph, and no tool exists
that lets the agent ask libskill to derive a job or agent profile.

The knowledge pipeline has one working flow and two gaps:

1. **HTML knowledge flow** (working): `data/knowledge/*.html` → resource
   processor (microdata extraction) → `data/resources/` → graph processor →
   `data/graphs/` (RDF quads). Agents can query articles, courses, and org
   content successfully.

2. **Framework data — base entities** (gap): `data/pathway/*.yaml` is loaded
   by fit-map for validation and by libskill for derivation, but it never
   enters the knowledge pipeline. No HTML representation exists, so the
   resource processor has nothing to extract.

3. **Framework data — derived entities** (gap): jobs, agent profiles, career
   progressions, and toolkits are computed on demand by libskill from
   discipline × level × track combinations. fit-guide has no way to invoke
   libskill, so it cannot answer questions like "what does the FDE software
   engineer at L3 need?" even when the base entities are available.

The RDF schemas already exist (`products/map/schema/rdf/` — `capability.ttl`,
`defs.ttl`, `discipline.ttl`, `levels.ttl`, etc.) but are only used for SHACL
validation, never for instance generation.

### Evidence

Running fit-guide after a full `just quickstart`:

```
> "What skills are defined in the engineering framework?"
→ "No explicit skills were defined or linked to the engineering framework"
→ "The ontology does not include a schema:Skill type"

> "What does a senior software engineer need to demonstrate at L3?"
→ "No specific details about what a senior software engineer needs to
    demonstrate at this level were retrieved"
```

Meanwhile, content queries work fine:

```
> "Tell me about drug discovery processes"
→ [comprehensive 6-section answer with projects, leadership, platforms]
```

## Design Rationale

Framework data has two distinct shapes and each calls for a different
mechanism.

**Base entities** (skills, capabilities, levels, behaviours, disciplines,
tracks, stages, drivers, tools) are *defined* in YAML. They have stable
identity, are bounded in number, and benefit from graph traversal — agents
should be able to enumerate types, walk relationships, and pattern-match
across them. These belong in the RDF graph.

Map is the data product: it owns the YAML data, the schema, and the RDF/SHACL
definitions. Exporting base entities for downstream consumption is therefore
Map's responsibility, not the knowledge pipeline's. Rather than building a
separate pathway-to-RDF converter, Map exports each entity as an HTML file
with embedded microdata — the same format the resource processor already
consumes. This avoids adding framework-specific logic to the resource
processor or graph processor and keeps Map as the single owner of how
framework data is represented.

**Derived entities** (jobs, agent profiles, career progressions, toolkits) are
*computed* by libskill from `discipline × level × track` combinations. The
combinatorial space is large and grows with framework size, so materializing
every combination as a graph instance would explode the graph with
near-duplicate triples and degrade query precision. More importantly,
libskill's derivation logic continues to evolve — any materialized snapshot
would drift from the live algorithm. Derivation should therefore be exposed
as gRPC tool endpoints that fit-guide calls on demand, executing the same
libskill code path that powers Pathway. This guarantees Guide and Pathway
never disagree.

A new `services/pathway/` gRPC service hosts these endpoints, mirroring the
shape of `services/graph/` and `services/vector/`. It is wired into
fit-guide's tool router via `config/tools.yml` and the `tool.endpoints`
section of `config/config.json`, and registered in fit-guide's starter
configuration so external installations get it automatically when they run
`npx fit-guide --init`.

Interview questions are intentionally **not** exposed as a tool in this spec.
The question-bank schema is the least mature part of Map and is expected to
change soon; introducing a tool surface for it now would lock in an unstable
contract.

## Scope

Two coordinated changes:

1. Add a `fit-map export` command that reads `data/pathway/` YAML, renders HTML
   microdata files via templates, and writes them to `data/knowledge/` so the
   resource processor picks them up alongside all other HTML content.
2. Add a new `services/pathway/` gRPC service that exposes libskill derivation
   as fit-guide tool endpoints, and register it in fit-guide's runtime
   configuration.

### Included — Base entity export from Map

- New `fit-map export` CLI command that loads framework data and renders HTML
  microdata files to `data/knowledge/`
- Templates in `products/map/templates/` — one per base entity type:
  capability (with nested skills), level, behaviour, discipline, track, stage,
  driver, tool
- Templates use the `fit:` vocabulary from `products/map/schema/rdf/` for
  `itemtype` and `itemprop` values
- New `just export-framework` recipe that runs `fit-map export`
- Integration into `just process` and `just process-fast` pipelines (before
  `process-resources`)
- `just quickstart` includes the new step

### Included — Pathway derivation service

- New `services/pathway/` package (`@forwardimpact/svcpathway`) following the
  same structure as `services/graph/`: `proto/pathway.proto`, `index.js`
  (`PathwayService` class extending the generated base), `server.js`
  composition root, `package.json`, `test/`
- Proto service `pathway.Pathway` with RPC methods that wrap libskill. Each
  RPC composes existing libskill primitives — no new derivation logic is
  introduced; the service is a transport layer over libskill:
  - `ListJobs(ListJobsRequest) → ToolCallResult` — enumerate valid
    `(discipline, level, track)` combinations via libskill
    `generateAllJobs` / `getValidLevelTrackCombinations`
  - `DeriveJob(DeriveJobRequest) → ToolCallResult` — call libskill `deriveJob`
    for a given discipline/level/track and return the skill matrix and
    behaviour profile
  - `ListAgents(ListAgentsRequest) → ToolCallResult` — enumerate valid agent
    `(discipline, track)` combinations
  - `DeriveAgent(DeriveAgentRequest) → ToolCallResult` — compose libskill
    `deriveReferenceLevel`, `deriveAgentSkills`, and `deriveAgentBehaviours`
    for a given discipline/track, optionally filtered by stage (the same
    composition `npx fit-pathway agent` performs)
  - `AnalyzeProgression(AnalyzeProgressionRequest) → ToolCallResult` — call
    libskill `analyzeProgression` (or `analyzeCustomProgression`) for
    `(discipline, from_level, to_level, track)`
  - `DeriveToolkit(DeriveToolkitRequest) → ToolCallResult` — call libskill
    `deriveToolkit` for a given job
- Tool descriptions added to `config/tools.example.yml` and the published
  starter `products/guide/starter/tools.yml`, one entry per RPC above, each
  with `purpose`, `applicability`, `instructions`, `evaluation`, `parameters`
- Endpoint wiring added to `config/config.example.json` and
  `products/guide/starter/config.json` under `service.tool.endpoints`,
  mapping each tool name to its `pathway.Pathway.*` method and request type
- The new service registered in the `init.services` array of both
  `config/config.example.json` and `products/guide/starter/config.json` so
  `npx fit-guide --init` produces a configuration that `npx fit-rc start`
  will launch alongside the other services
- Service composition root loads pathway YAML through the same data
  resolution rules used by `fit-pathway` (via libskill loaders) and rejects
  startup if the data directory is missing

### Not Included

- Changes to the resource processor — it already extracts microdata from any
  HTML file in `data/knowledge/`
- Changes to the graph processor — it already indexes any resource with RDF
  content
- Materializing derived entities (jobs, agents, progressions) into the RDF
  graph — derived data is exposed exclusively via tool calls
- An LLM tool for interview questions — the question-bank schema is expected
  to change soon and is deferred to a follow-up spec
- Changes to agent prompts beyond what is needed to advertise the new tools
- A web UI for the pathway service — fit-guide is the only consumer in scope

## Success Criteria

After running the full pipeline (`just quickstart` or `just process`) and
starting services with `npx fit-rc start`:

1. `fit-map export` produces HTML files in `data/knowledge/` with valid
   microdata for each base framework entity type
2. `just cli-subjects` lists `fit:Skill`, `fit:Capability`, `fit:Level`,
   `fit:Behaviour`, `fit:Discipline`, `fit:Track`, `fit:Stage`, `fit:Driver`,
   and `fit:Tool` types
3. `ARGS="fit:Skill" just cli-subjects` returns all skills defined in pathway
   YAML
4. `npx fit-guide --init` in a fresh directory produces a `config/config.json`
   whose `init.services` array includes the pathway service and whose
   `service.tool.endpoints` includes `derive_job`, `derive_agent`,
   `analyze_progression`, `derive_toolkit`, `list_jobs`, and `list_agents`
5. After `npx fit-rc start`, `npx fit-rc status` shows the pathway service
   running and the tool service successfully resolves each pathway tool
   against the running endpoint
6. fit-guide answers "What skills are defined in the engineering framework?"
   with a list of actual skill names from the data (graph path)
7. fit-guide answers "What does a senior software engineer on the
   forward-deployed track need to demonstrate?" with the same skill matrix
   and behaviours that the equivalent `npx fit-pathway job <discipline>
   <level> --track=forward_deployed` invocation produces (tool path)
8. fit-guide answers a "what changes between two levels" question with the
   same delta that `npx fit-pathway progress` produces for the same inputs
