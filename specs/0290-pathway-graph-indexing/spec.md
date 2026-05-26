# 290: Make Pathway Framework Data Queryable from fit-guide

## Problem

When a user asks fit-guide about the engineering framework — skills,
capabilities, levels, behaviours, jobs, agent profiles — Guide returns sparse or
empty results. Graph queries like `get_subjects("fit:Skill")` return nothing
because pathway framework data never enters the RDF graph, and no tool exists
that lets Guide ask libskill to derive a job or agent profile.

The knowledge pipeline has one working flow and two gaps:

1. **HTML knowledge flow** (working): `data/knowledge/*.html` → resource
   processor (microdata extraction) → `data/resources/` → graph processor →
   `data/graphs/` (RDF quads). Agents can query articles, courses, and org
   content successfully.

2. **Framework data — base entities** (gap): `data/pathway/*.yaml` is loaded by
   fit-map for validation and by libskill for derivation, but it never enters
   the knowledge pipeline. No HTML representation exists, so the resource
   processor has nothing to extract.

3. **Framework data — derived entities** (gap): jobs, agent profiles, career
   progressions, and toolkits are computed on demand by libskill from discipline
   × level × track combinations. fit-guide has no way to invoke libskill, so it
   cannot answer questions like "what does the FDE software engineer at L3
   need?" even when the base entities are available.

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

Framework data has two distinct shapes and each calls for a different mechanism.

**Base entities** (skills, capabilities, levels, behaviours, disciplines,
tracks, stages, drivers, tools) are _defined_ in YAML. They have stable
identity, are bounded in number, and benefit from graph traversal — agents
should be able to enumerate types, walk relationships, and pattern-match across
them. These belong in the RDF graph.

Map is the data product: it owns the YAML data, the schema, and the RDF/SHACL
definitions. Exporting base entities for downstream consumption is therefore
Map's responsibility, not the knowledge pipeline's. Rather than building a
separate pathway-to-RDF converter, Map exports each entity as an HTML file with
embedded microdata — the same format the resource processor already consumes.
This avoids adding framework-specific logic to the resource processor or graph
processor and keeps Map as the single owner of how framework data is
represented.

**Derived entities** (jobs, agent profiles, career progressions, toolkits) are
_computed_ by libskill from `discipline × level × track` combinations. The
combinatorial space is large and grows with framework size, so materializing
every combination as a graph instance would explode the graph with
near-duplicate triples and degrade query precision. More importantly, libskill's
derivation logic continues to evolve — any materialized snapshot would drift
from the live algorithm. Derivation should therefore be exposed as gRPC tool
endpoints that fit-guide calls on demand, executing the same libskill code path
that powers Pathway. This guarantees Guide and Pathway never disagree.

A new `services/pathway/` gRPC service hosts these endpoints, mirroring the
shape of `services/graph/` and `services/vector/`. It is wired into fit-guide's
tool router via `config/tools.yml` and the `tool.endpoints` section of
`config/config.json`, and registered in fit-guide's starter configuration so
external installations get it automatically when they run
`npx fit-guide --init`.

Interview questions are intentionally **not** exposed as a tool in this spec.
The question-bank schema is the least mature part of Map and is expected to
change soon; introducing a tool surface for it now would lock in an unstable
contract.

## Terminology Risk

Two Pathway domain words collide head-on with concepts the Guide LLM agent
already knows about. Naming the new tools naively would create persistent
ambiguity that degrades Guide's reasoning, increases hallucinated tool calls,
and is hard to fix later because tool names appear in every conversation turn's
tool catalogue.

### Collision 1: "agent"

In Pathway, an **agent profile** is a static role description — a YAML artifact
derived from `(discipline, track)` that describes the skills and behaviours an
AI agent operating in that role should have. It is rendered to `.agent.md` files
for VS Code Custom Agents. It is _data_, not an executable entity.

Guide already has tools for delegating work to other LLM agents:
`list_sub_agents`, `run_sub_agent`, `list_handoffs`, `run_handoff`. A tool named
`list_agents` or `derive_agent` sits adjacent to those in the catalogue and
would predictably be misread as "list more LLM agents I can delegate to" or
"spawn a new agent for this discipline." The likely failure modes:

- Guide invokes `list_agents` when the user asks "who can help with this task?"
  expecting runnable sub-agents and gets back framework role definitions, then
  either gives up or hallucinates a follow-up `run_agent` call that does not
  exist.
- Guide skips the real `list_sub_agents` because `list_agents` looks like a more
  general version, missing actual delegation opportunities.
- Tool-filter ranking surfaces both clusters together for queries about
  "agents," wasting the prompt budget on near-duplicate-looking entries.

### Collision 2: "tool"

In Pathway, a **toolkit** is the set of software tools (Python, Kubernetes,
Figma, etc.) referenced by the skills in a job, derived via libskill's
`deriveToolkit`. It is a list of _technologies the human or AI doing the job
uses_, harvested from `toolReferences` on skill definitions.

Guide's entire interface to the world is "LLM tools" — function calls it emits
to the tool service. LLM agents are explicitly trained to reason about their own
tool catalogue and many are post-trained on meta-tools like `list_tools` or
`describe_tool`. A Pathway tool named `derive_toolkit`, `list_tools`, or
`get_tools` would land directly on top of that prior. The likely failure modes:

- Guide calls `derive_toolkit` to introspect its own tool catalogue (treating it
  as a meta-tool) and receives an irrelevant list of software technologies.
- The user asks "what tools do you have?" and Guide answers with a Pathway
  toolkit instead of its real LLM tool list.
- Documentation, prompts, and trace analysis become harder to read because the
  word "tool" is overloaded in every sentence.

### Mitigation

Three reinforcing measures:

1. **Namespace prefix.** Every tool exposed by `services/pathway/` is named
   `pathway_*`. The prefix is the same word the product is called and
   immediately marks the tool as a query against framework data, not a
   meta-operation on Guide itself.
2. **Avoid "agent" and "tool" as bare nouns.** Replace "agent" with
   "agent_profile" (the suffix signals data, matching the `.agent.md` artifact
   it produces) and replace "toolkit"/"tools" with "software" (the concrete
   thing the toolkit lists).
3. **Verb choice signals intent.** Use `list_*` for enumeration and `describe_*`
   for "give me details about one." Avoid `derive_*`, `get_*`, and `analyze_*`
   because those overlap with how Guide is trained to talk about its own
   internal operations.

The resulting tool names are listed under
[Included — Pathway derivation service](#included--pathway-derivation-service)
below. Each tool's `purpose` and `applicability` text in
`config/tools.example.yml` must additionally contain an explicit one-sentence
disambiguation, for example: _"Pathway agent profiles are static role
descriptions in framework data — they are NOT runnable LLM sub-agents. Use
`list_sub_agents` for delegation."_

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
- Mustache templates in `products/map/templates/` — one per base entity type:
  capability (with nested skills), skill, level, behaviour, discipline, track,
  stage, driver, tool — loaded and rendered via `@forwardimpact/libtemplate`'s
  `TemplateLoader`, following the same precedent as
  `libraries/libsyntheticrender/` (which owns its own template set under
  `templates/` and renders through `TemplateLoader.render()`)
- Templates use the `fit:` vocabulary from `products/map/schema/rdf/` for
  `itemtype` and `itemprop` values
- New `just export-framework` recipe that runs `fit-map export`
- Integration into `just process` and `just process-fast` pipelines (before
  `process-resources`)
- `just quickstart` includes the new step

### Included — Pathway derivation service

- New `services/pathway/` package (`@forwardimpact/svcpathway`) following the
  same structure as `services/graph/`: `proto/pathway.proto`, `index.js`
  (`PathwayService` class extending the generated base), `server.js` composition
  root, `package.json`, `test/`
- Proto service `pathway.Pathway` with RPC methods that wrap libskill. Each RPC
  composes existing libskill primitives — no new derivation logic is introduced;
  the service is a transport layer over libskill. Tool names use the `pathway_*`
  prefix and avoid the bare nouns "agent" and "tool" (see
  [Terminology Risk](#terminology-risk)):

  | Tool name (LLM-facing)           | RPC                    | libskill primitives                                                                                                       |
  | -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `pathway_list_jobs`              | `ListJobs`             | `generateAllJobs` / `getValidLevelTrackCombinations`                                                                      |
  | `pathway_describe_job`           | `DescribeJob`          | `deriveJob`                                                                                                               |
  | `pathway_list_agent_profiles`    | `ListAgentProfiles`    | `getValidLevelTrackCombinations` filtered to discipline × track                                                           |
  | `pathway_describe_agent_profile` | `DescribeAgentProfile` | `deriveReferenceLevel` + `deriveAgentSkills` + `deriveAgentBehaviours` (the composition `npx fit-pathway agent` performs) |
  | `pathway_describe_progression`   | `DescribeProgression`  | `analyzeProgression` / `analyzeCustomProgression`                                                                         |
  | `pathway_list_job_software`      | `ListJobSoftware`      | `deriveToolkit`                                                                                                           |

  All RPCs return `tool.ToolCallResult`. Request messages live in
  `proto/pathway.proto` and follow the naming `<RpcName>Request`.

- Tool descriptions added to `config/tools.example.yml` and the published
  starter `products/guide/starter/tools.yml`, one entry per tool above, each
  with `purpose`, `applicability`, `instructions`, `evaluation`, `parameters`.
  Each `purpose` and `applicability` block must contain an explicit
  disambiguation sentence per the [Terminology Risk](#terminology-risk)
  mitigation — calling out that Pathway agent profiles are not LLM sub-agents
  and that `pathway_list_job_software` lists technologies, not Guide's own LLM
  tools
- Endpoint wiring added to `config/config.example.json` and
  `products/guide/starter/config.json` under `service.tool.endpoints`, mapping
  each tool name to its `pathway.Pathway.*` method and request type
- The new service registered in the `init.services` array of both
  `config/config.example.json` and `products/guide/starter/config.json` so
  `npx fit-guide --init` produces a configuration that `npx fit-rc start` will
  launch alongside the other services
- Service composition root loads pathway YAML through the same data resolution
  rules used by `fit-pathway` (via libskill loaders) and rejects startup if the
  data directory is missing

### Not Included

- Changes to the resource processor — it already extracts microdata from any
  HTML file in `data/knowledge/`
- Changes to the graph processor — it already indexes any resource with RDF
  content
- Materializing derived entities (jobs, agent profiles, progressions) into the
  RDF graph — derived data is exposed exclusively via the `pathway_*` tool calls
- An LLM tool for interview questions — the question-bank schema is expected to
  change soon and is deferred to a follow-up spec
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
   `service.tool.endpoints` includes `pathway_list_jobs`,
   `pathway_describe_job`, `pathway_list_agent_profiles`,
   `pathway_describe_agent_profile`, `pathway_describe_progression`, and
   `pathway_list_job_software` — and contains no tool whose name is a bare
   `derive_*`, `list_agents`, `list_tools`, or `derive_toolkit`
5. After `npx fit-rc start`, `npx fit-rc status` shows the pathway service
   running and the tool service successfully resolves each pathway tool against
   the running endpoint
6. fit-guide answers "What skills are defined in the engineering framework?"
   with a list of actual skill names from the data (graph path)
7. fit-guide answers "What does a senior software engineer on the
   forward-deployed track need to demonstrate?" with the same skill matrix and
   behaviours that the equivalent
   `npx fit-pathway job <discipline> <level> --track=forward_deployed`
   invocation produces (tool path)
8. fit-guide answers a "what changes between two levels" question with the same
   delta that `npx fit-pathway progress` produces for the same inputs
9. **Terminology disambiguation holds in practice.** Two adversarial probes
   pass:
   - "What tools do you have?" — Guide answers with its own LLM tool catalogue
     (graph, vector, sub-agent, handoff, pathway tools), not with a Pathway
     software list. Guide does **not** call `pathway_list_job_software` to
     answer this.
   - "What other agents can you hand work off to?" — Guide answers using
     `list_sub_agents` / `list_handoffs`, not by calling
     `pathway_list_agent_profiles`.
