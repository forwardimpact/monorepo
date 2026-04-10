# Plan: 290 — Stream B: Pathway Derivation Service

> **Part 3 of 3.** Read [plan-a.md](plan-a.md) for the overall decomposition.
>
> **Depends on:** [plan-a-01.md](plan-a-01.md) — must be merged first. The
> serializer in B3 imports IRI helpers from `@forwardimpact/map/iri`, which is
> exported by foundation step F3.
>
> **Independent of:** [plan-a-02.md](plan-a-02.md) — Stream A and Stream B can
> land in either order after foundation. The pathway service does not flow data
> through the resource/graph pipeline, so it has no runtime dependency on Map's
> HTML export.

## Scope

Add a new `services/pathway/` gRPC service that exposes libskill derivation as
fit-guide tool endpoints, and register it in fit-guide's runtime configuration
so `npx fit-guide --init` and `npx fit-rc start` produce a working installation
that includes the new service.

This satisfies spec success criteria 4, 5, 7, 8, and 9.

## Key decisions

- **Pathway service mirrors `services/graph/` exactly** — same class layout,
  same composition-root shape, same `ToolCallResult` return pattern. No new
  service framework primitives.

- **Service is a thin transport** — each RPC method delegates directly to
  libskill exports. No new derivation logic. The composition root uses the same
  three-call load sequence as `products/pathway/src/commands/agent.js`:
  `loadAllData` + `loadAgentData` + `loadSkillsWithAgentData`. `loadAllData`
  produces a destructured per-skill shape that drops `human` (see
  `products/map/src/loader.js:102-127`), while `loadSkillsWithAgentData` spreads
  the full raw skill — which is the shape `generateStageAgentProfile` walks.
  Both are required.

- **RPCs return Turtle RDF in the `content` field**, not markdown. This matches
  the existing `GetOntology` pattern and gives Guide graph-compatible vocabulary
  in every derived response, so it can chain into `query_by_pattern` calls
  against the base entities Stream A indexes. See B3 below for the rationale in
  detail.

- **No new SHACL vocabulary file in this spec.** An earlier revision of this
  plan proposed `products/map/schema/rdf/derivations.ttl` so `get_ontology`
  would describe `fit:Job`, `fit:AgentProfile`, etc. That is built on a false
  premise: `libraries/libgraph/processor/ontology.js` derives `ontology.ttl`
  statistically from observed quads at processing time — nothing reads TTL files
  from `products/map/schema/rdf/`, and the spec explicitly forbids materializing
  derived entities into the graph. Adding a TTL file would be invisible to
  `get_ontology`. The pathway service emits `fit:Job` / `fit:AgentProfile` /
  `fit:Progression` IRIs in its Turtle responses using an ad-hoc but documented
  vocabulary, and Guide learns those types from the tool descriptions in
  `tools.yml` rather than from `get_ontology`. A proper fix (merging
  hand-authored TTLs into `ontology.ttl`) is deferred to a follow-up spec.

- **Tool names are frozen by the spec's terminology section.** Do not
  re-abbreviate or shorten in implementation: `pathway_list_jobs`,
  `pathway_describe_job`, `pathway_list_agent_profiles`,
  `pathway_describe_agent_profile`, `pathway_describe_progression`,
  `pathway_list_job_software`.

- **Codegen prerequisite.** All gRPC service packages in this monorepo depend on
  generated bases produced by `bunx fit-codegen --all` (a.k.a. `just codegen`).
  Running `bun run test` in `services/pathway/` before codegen will fail with
  `PathwayBase is undefined` because `services.PathwayBase` does not exist yet.
  The implementation sequence is therefore: `bun install` → `just codegen` →
  tests. This is already true for `services/graph/` etc.; it is called out here
  because `services/pathway/` is new and first-time contributors commonly miss
  it.

## Steps

### B1. Scaffold service package

**New directory:** `services/pathway/`

Files:

- `package.json` — `@forwardimpact/svcpathway`, dependencies on
  `@forwardimpact/librpc`, `@forwardimpact/libconfig`,
  `@forwardimpact/libtelemetry`, `@forwardimpact/libskill`,
  `@forwardimpact/map`, `@forwardimpact/libtype`, `@forwardimpact/libutil` (for
  `Finder` in the composition root — see B4), and `n3` (for Turtle
  serialization). Scripts: `"dev": "node --watch server.js"`, `"test"`. `files`
  array: `["proto/", "server.js"]` — matching the convention in
  `services/graph/package.json:28-31`. (Note: this pattern excludes `index.js`
  and `src/`, which is a pre-existing oddity across all services in this repo,
  not something this spec tries to fix.) Model on `services/graph/package.json`.
- `proto/pathway.proto` (see B2).
- `index.js` — `PathwayService` class (see B3).
- `src/serialize.js` — pure Turtle serializers (see B3).
- `server.js` — composition root (see B4).
- `test/service.test.js` — RPC tests that parse the returned Turtle.
- `test/serialize.test.js` — unit tests for the serializers.
- `README.md` not required.

### B2. Proto definition

**New file:** `services/pathway/proto/pathway.proto`

```proto
syntax = "proto3";

package pathway;

import "common.proto";
import "tool.proto";

service Pathway {
  rpc ListJobs(ListJobsRequest) returns (tool.ToolCallResult);
  rpc DescribeJob(DescribeJobRequest) returns (tool.ToolCallResult);
  rpc ListAgentProfiles(ListAgentProfilesRequest) returns (tool.ToolCallResult);
  rpc DescribeAgentProfile(DescribeAgentProfileRequest) returns (tool.ToolCallResult);
  rpc DescribeProgression(DescribeProgressionRequest) returns (tool.ToolCallResult);
  rpc ListJobSoftware(ListJobSoftwareRequest) returns (tool.ToolCallResult);
}

message ListJobsRequest {
  optional string discipline = 1;
}

message DescribeJobRequest {
  string discipline = 1;
  string level = 2;
  optional string track = 3;
}

message ListAgentProfilesRequest {
  optional string discipline = 1;
}

message DescribeAgentProfileRequest {
  string discipline = 1;
  string track = 2;
  // Optional stage id (e.g. "intern", "established"). If omitted, the
  // service returns every stage profile for the discipline×track.
  optional string stage = 3;
}

message DescribeProgressionRequest {
  string discipline = 1;
  string from_level = 2;
  string to_level = 3;
  optional string track = 4;
}

message ListJobSoftwareRequest {
  string discipline = 1;
  string level = 2;
  optional string track = 3;
}
```

Codegen (`just codegen` / `fit-codegen`) picks this up automatically — libtype
exposes `pathway.*` message types after generation.

### B3. Service class

**New file:** `services/pathway/index.js`

```javascript
import { services } from "@forwardimpact/librpc";
import {
  generateAllJobs,
  getValidLevelTrackCombinations,
  deriveJob,
  deriveReferenceLevel,
  deriveAgentSkills,
  deriveAgentBehaviours,
  analyzeProgression,
  analyzeCustomProgression,
  deriveToolkit,
  generateStageAgentProfile,
} from "@forwardimpact/libskill";

const { PathwayBase } = services;

export class PathwayService extends PathwayBase {
  #data;
  #agentData;
  #skillsWithAgent;

  /**
   * @param {ServiceConfig} config
   * @param {object} bundle
   * @param {object} bundle.data              - loadAllData() output
   * @param {object} bundle.agentData         - loadAgentData() output
   * @param {Array}  bundle.skillsWithAgent   - loadSkillsWithAgentData() output
   */
  constructor(config, { data, agentData, skillsWithAgent }) {
    super(config);
    if (!data) throw new Error("data is required");
    if (!agentData) throw new Error("agentData is required");
    if (!skillsWithAgent) throw new Error("skillsWithAgent is required");
    this.#data = data;
    this.#agentData = agentData;
    this.#skillsWithAgent = skillsWithAgent;
  }

  async ListJobs(req) { /* delegates to generateAllJobs */ }
  async DescribeJob(req) { /* delegates to deriveJob */ }
  async ListAgentProfiles(req) { /* enumerates disciplines × tracks */ }
  async DescribeAgentProfile(req) { /* calls generateStageAgentProfile per stage */ }
  async DescribeProgression(req) { /* analyzeProgression / analyzeCustomProgression */ }
  async ListJobSoftware(req) { /* deriveJob → deriveToolkit */ }
}
```

**libskill call signatures** (verified against
`libraries/libskill/derivation.js`, `agent.js`, `progression.js`, `toolkit.js`):

| RPC                    | libskill calls (in order)                                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListJobs`             | `generateAllJobs({ disciplines, levels, tracks, skills, behaviours, validationRules })` — no `capabilities` arg. Filter the returned array by `req.discipline` if provided.                                                                                                                                    |
| `DescribeJob`          | `deriveJob({ discipline, level, track, skills, behaviours, capabilities, validationRules })` — `capabilities` **is** an arg here (it feeds `deriveResponsibilities`). `deriveJob` reads `validationRules.levels` internally (see `libraries/libskill/derivation.js:334`); do not pass a separate `levels` key. |
| `ListAgentProfiles`    | Loop `for (const d of data.disciplines)` calling `getValidLevelTrackCombinations({ discipline: d, levels, tracks })`, then reduce to unique `(discipline, track)` pairs. `getValidLevelTrackCombinations` requires `discipline` — there is no "all disciplines" short-circuit.                                 |
| `DescribeAgentProfile` | See dedicated section below.                                                                                                                                                                                                                                                                                   |
| `DescribeProgression`  | `analyzeProgression(currentJob, targetJob)` when same discipline/track, else `analyzeCustomProgression({ currentJob, targetJob })`. Both sides are materialized via `deriveJob` first.                                                                                                                         |
| `ListJobSoftware`      | `deriveJob(...)` to get `skillMatrix`, then `deriveToolkit({ skillMatrix, skills })`.                                                                                                                                                                                                                          |

Notes:

- `validationRules` must be sourced from `data.framework.validationRules` (see
  `products/pathway/src/commands/job.js:307` for the canonical reference).
  Passing `undefined` silently disables validation — do not do this.
- `generateAllJobs` returns full `JobDefinition` objects with skill matrices; do
  **not** serialize the matrices in `ListJobs`. The list serializer emits only
  `fit:Job`, `rdfs:label`, `fit:discipline`, `fit:level`, `fit:track` per job.
  Matrix detail is reserved for `DescribeJob`.

**`DescribeAgentProfile` composition.** The actual flow in
`products/pathway/src/commands/agent.js` builds stage-specific profiles via
`generateStageAgentProfile({ ...stageParams, stage })`. An earlier revision of
this plan described a non-existent
`deriveReferenceLevel → deriveAgentSkills → deriveAgentBehaviours` flow that is
only used for the `--skills` / `--tools` short paths. The correct implementation
mirrors `runAgentCommand` lines 437–498:

1. Resolve `humanDiscipline`, `humanTrack`, `agentDiscipline`, `agentTrack` from
   `req.discipline` + `req.track` against `data` and `agentData` (port
   `resolveAgentEntities` from `agent.js`, or expose it from a shared module).
2. `level = deriveReferenceLevel(data.levels)`.
3. Build `stageParams`:
   ```javascript
   const stageParams = {
     discipline: humanDiscipline,
     track: humanTrack,
     level,
     skills: skillsWithAgent,    // from loadSkillsWithAgentData
     behaviours: data.behaviours,
     agentBehaviours: agentData.behaviours,
     agentDiscipline,
     agentTrack,
     stages: data.stages,
   };
   ```
4. If `req.stage` is set: resolve the stage object from `data.stages`, call
   `generateStageAgentProfile({ ...stageParams, stage })`, serialize the single
   profile.
5. If `req.stage` is unset: map across `data.stages`, call
   `generateStageAgentProfile` for each, serialize as a list of
   `fit:AgentProfile` nodes each linked to their `fit:stage`.

**Why `skillsWithAgent` is mandatory.** `loadAllData` destructures each skill
into a limited set of fields and drops `human` (see
`products/map/src/loader.js:102-127`). `loadSkillsWithAgentData` instead spreads
the full raw YAML skill into each output entry (`loader.js:432-435`) and is the
shape `generateStageAgentProfile` expects when walking per-stage skill matrices.
The service must receive both `data` (via `loadAllData`) and `skillsWithAgent`
(via `loadSkillsWithAgentData`) and pass the latter in `stageParams.skills`, not
`data.skills`.

**Output format: Turtle RDF in the `content` field.** Each RPC returns
`{ content: <turtle-string> }`. This matches the existing `GetOntology` pattern
(`services/graph/index.js:60` — returns `ontology.ttl` Turtle as `content`) and,
crucially, makes derived results speak the same vocabulary as the graph-indexed
base entities from Stream A. The LLM can then pattern the response against
vocabulary it already learned from `get_ontology` / `get_subjects` and issue
follow-up `query_by_pattern` calls against the graph for related base entities.

Why RDF and not markdown:

- **Pipeline coherence.** Base entities exported by Stream A flow through
  `libresource` → `libgraph` as Turtle quads under the `fit:` namespace
  (`libraries/libresource/parser.js:74` — `quadsToRdf` uses N3 `Writer` with
  `format: "Turtle"`). If the service emitted markdown, Guide would have two
  incompatible views of the same vocabulary and could not chain derived results
  into graph queries.
- **Follow-up queries.** When Guide sees a skill IRI like
  `https://www.forwardimpact.team/schema/rdf/skill/python` in a `DescribeJob`
  response, it can immediately issue
  `query_by_pattern(subject=<iri>, predicate="?", object="?")` against the graph
  to pull the base skill definition, stage handoffs, capability membership,
  toolReferences, etc. Markdown kills that flywheel.
- **Existing convention.** `GetOntology` returns Turtle in `content` today. The
  `identifiers` field (Pattern B) is not usable here because derived entities
  are not persisted to `ResourceIndex` (spec: "No materialization of derived
  entities into the RDF graph") — nothing for the Agent's `hands.js:178`
  resource loader to fetch. Turtle in `content` is the only viable option that
  keeps graph-compatible vocabulary visible to the LLM.

**Vocabulary:** The service emits IRIs under the same
`https://www.forwardimpact.team/schema/rdf/` namespace used by the Stream A
templates and the TTL schemas in `products/map/schema/rdf/`. For both
base-entity references (skill, behaviour, level, discipline, track, stage,
driver, tool) **and** derived-entity types (job, agent profile, progression),
**import the IRI helpers from `@forwardimpact/map/iri`** (the shared module
introduced in foundation step F3). Both Stream A's view-builders and this
serializer draw from the same constructors, so drift is structurally impossible.

For derived-entity classes and predicates, this spec introduces an ad-hoc
vocabulary that lives **only** in pathway service responses and `tools.yml`
descriptions (not in SHACL). The canonical list of forbidden-from-Stream-A types
is exported as `DERIVED_ENTITY_TYPES` from `@forwardimpact/map/iri` (defined in
foundation step F3). It currently contains `fit:Job`, `fit:AgentProfile`,
`fit:Progression`, `fit:SkillProficiency`, `fit:SkillChange`,
`fit:BehaviourChange`, and `fit:SkillModifier`. **If you add a new derived class
in this plan, add it to `DERIVED_ENTITY_TYPES` in foundation in the same PR** —
Stream A's renderer test imports the constant and will silently allow new
omissions otherwise. The shared module is the single owner of this contract;
both streams reference it instead of duplicating the list.

Stream A templates must never emit any class in this list, otherwise the
resource processor would materialize them into the graph, violating the spec's
"No materialization of derived entities" constraint. (Stream A's renderer test
enforces this with a negative assertion — see plan-a-02.md A2c.)

Classes and predicates used per RPC:

| Response               | Classes                                                                         | Key predicates                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ListJobs`             | `fit:Job`                                                                       | `fit:discipline`, `fit:level`, `fit:track`, `rdfs:label`                                                                                                                       |
| `DescribeJob`          | `fit:Job`, blank-node `fit:SkillProficiency` entries                            | `fit:discipline`, `fit:level`, `fit:track`, `fit:skillMatrix`, `fit:skill`, `fit:proficiency`, `fit:behaviourProfile`, `fit:behaviour`, `fit:maturity`, `fit:responsibilities` |
| `ListAgentProfiles`    | `fit:AgentProfile`                                                              | `fit:discipline`, `fit:track`                                                                                                                                                  |
| `DescribeAgentProfile` | `fit:AgentProfile`, optional `fit:stage`                                        | `fit:discipline`, `fit:track`, `fit:stage`, `fit:agentSkill`, `fit:agentBehaviour`, `fit:frontmatter` (as JSON literal)                                                        |
| `DescribeProgression`  | `fit:Progression`, blank-node `fit:SkillChange` / `fit:BehaviourChange` entries | `fit:fromJob`, `fit:toJob`, `fit:change`, `fit:skill`, `fit:behaviour`, `fit:fromProficiency`, `fit:toProficiency`, `fit:changeKind`                                           |
| `ListJobSoftware`      | `fit:Job`                                                                       | `fit:software` (object = `fit:Tool` IRI), `rdfs:label`                                                                                                                         |

IRIs follow the convention (constructed via the shared helpers from
`@forwardimpact/map/iri`):

```
https://www.forwardimpact.team/schema/rdf/job/<discipline>/<level>[/<track>]
https://www.forwardimpact.team/schema/rdf/agent-profile/<discipline>/<track>[/<stage>]
https://www.forwardimpact.team/schema/rdf/progression/<discipline>/<from>-<to>[/<track>]
https://www.forwardimpact.team/schema/rdf/skill/<skillId>    ← matches Stream A
https://www.forwardimpact.team/schema/rdf/stage/<stageId>    ← matches Stream A
```

**Progression RDF — worked example.** `analyzeProgression` returns an object
shaped `{ current, target, skillChanges[], behaviourChanges[], summary }`, where
each entry in `skillChanges[]` has fields like
`{ skillId, change, isGained, isLost, fromProficiency, toProficiency }`. The
serializer maps one `skillChange` entry to a blank node:

```turtle
@prefix fit: <https://www.forwardimpact.team/schema/rdf/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<https://www.forwardimpact.team/schema/rdf/progression/fde/l2-l3/forward_deployed>
  a fit:Progression ;
  fit:fromJob <.../job/fde/l2/forward_deployed> ;
  fit:toJob   <.../job/fde/l3/forward_deployed> ;
  fit:skillChange [
    a fit:SkillChange ;
    fit:skill <.../skill/python> ;
    fit:fromProficiency "working" ;
    fit:toProficiency   "practitioner" ;
    fit:change 1 ;
    fit:changeKind "increased"
  ] ;
  fit:skillChange [
    a fit:SkillChange ;
    fit:skill <.../skill/cloud-architecture> ;
    fit:toProficiency "foundational" ;
    fit:changeKind "gained"
  ] .
```

`changeKind` is derived from the existing `isGained`/`isLost`/`change` fields:
`isGained → "gained"`, `isLost → "lost"`, `change > 0 → "increased"`,
`change < 0 → "decreased"`, `change === 0 → "unchanged"`. Never invent a
predicate that does not correspond to a direct field on the libskill output;
that way the RDF shape stays a mechanical projection of the derivation result.

**Serialization helper:** Add `services/pathway/src/serialize.js` with pure
functions per shape:

```javascript
import {
  jobIri,
  agentProfileIri,
  progressionIri,
  skillIri,
  behaviourIri,
  // ... etc
} from "@forwardimpact/map/iri";

export function jobToTurtle(job) { ... }
export function jobListToTurtle(jobs) { ... }
export function agentProfileToTurtle(profile) { ... }
export function agentProfileListToTurtle(profiles) { ... }
export function progressionToTurtle(progression) { ... }
export function jobSoftwareToTurtle(job, toolkit) { ... }
```

Each returns a Turtle string using the N3 `Writer` from the `n3` package — add
`n3` as a direct dependency of `services/pathway/package.json`, matching the
convention in `services/graph/package.json`. (It is already present in the
monorepo via libresource/libgraph, but service packages depend on it
explicitly.) IRI conventions are listed in the Vocabulary table above —
deterministic, stable, and easy for the LLM to compose.

Keep the service class thin: each RPC calls libskill, hands the result to the
matching serializer, and returns `{ content: turtle }`. Do not import
`products/pathway/src/formatters/` — those siblings produce human-facing
markdown, which is the wrong shape for this interface.

**Tests:** `services/pathway/test/service.test.js`

- Construct `PathwayService` with a hand-built `data` object and call each RPC.
- Parse the returned `content` with the N3 `Parser` (Turtle) and assert the
  expected quads are present — subject IRIs, predicates, object values. This
  verifies vocabulary, not string formatting.
- Assert round-trip: parse → re-serialize produces a stable set of quads.
- Assert IRIs use the `fit:` namespace and follow the conventions above.

`services/pathway/test/serialize.test.js`

- Unit tests for each pure serializer function in `src/serialize.js`, with small
  fixtures and exact quad assertions.

### B4. Composition root

**New file:** `services/pathway/server.js`

```javascript
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDataLoader } from "@forwardimpact/map";
import { Finder } from "@forwardimpact/libutil";
import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";
import { PathwayService } from "./index.js";

const config = await createServiceConfig("pathway");
const logger = createLogger("pathway");
const tracer = await createTracer("pathway");

// Resolve the pathway data directory using the same rules as
// fit-pathway: walk up from cwd using Finder. If the runtime needs
// a custom data_dir override, set SERVICE_PATHWAY_DATA_DIR in the
// env (libconfig picks it up automatically) and the composition
// root can branch on config.dataDir.
const finder = new Finder(fs, logger, process);
const dataDir = config.dataDir
  ? String(config.dataDir)
  : join(finder.findData("data", homedir()), "pathway");

// Three-call load sequence matching products/pathway/src/commands/agent.js
// lines 411-413. loadAllData produces a destructured per-skill shape
// that omits `human` (see loader.js:102-127), while
// loadSkillsWithAgentData spreads the full raw skill and is the
// shape generateStageAgentProfile expects. Both `data` and
// `skillsWithAgent` are required.
const loader = createDataLoader();
const data = await loader.loadAllData(dataDir);
const agentData = await loader.loadAgentData(dataDir);
const skillsWithAgent = await loader.loadSkillsWithAgentData(dataDir);

const service = new PathwayService(config, {
  data,
  agentData,
  skillsWithAgent,
});
const server = new Server(service, config, logger, tracer);
await server.start();
```

If any of the three loader calls throws or the directory is missing, let the
exception propagate — `fit-rc` treats an unhandled startup rejection as a hard
failure, per spec: "rejects startup if the data directory is missing".

### B5. Register service in init, env files, and endpoints

**How service host/port actually resolves.** `config/config.example.json` does
**not** store per-service host/port blocks — there is no `service.graph`,
`service.vector`, or similar section (verified: only `service.map`,
`service.agent`, `service.llm`, `service.memory`, and `service.tool` exist).
Service transport config comes from environment variables in the three
`.env*.example` files, which `libraries/libconfig/config.js` merges via the
`SERVICE_{NAME}_URL` pattern. The tool service reads these URLs to create gRPC
clients for each endpoint's `pathway.Pathway.*` method string. Without a
`SERVICE_PATHWAY_URL` entry, `createServiceConfig("pathway")` falls back to
libconfig's defaults (host `0.0.0.0`, port `3000`, see
`libconfig/config.js:85-86`) and the pathway server will bind to 3000 —
colliding with any other default-port service.

**File:** `config/config.example.json`

1. Append to `init.services` array (after `graph`, before `llm`):

   ```json
   {
     "name": "pathway",
     "command": "bun run --filter @forwardimpact/svcpathway dev"
   }
   ```

2. **Do not** add a `service.pathway` block with `host`/`port` — that pattern
   does not exist in this repo. Host and port are set by env vars (step 3
   below). If per-service config beyond transport ever becomes necessary (e.g.
   `data_dir`), add a `service.pathway` block for those fields only, modeled on
   the existing `service.map` block shape. The `data_dir` override is not
   strictly required because B4's composition root resolves it via `Finder`.

3. **Files:** `.env.local.example`, `.env.docker-native.example`,
   `.env.docker-supabase.example`

   Append `SERVICE_PATHWAY_URL` to each. Pick a free port — existing allocations
   in `.env.local.example:65-71` use 3002-3008 for
   agent/memory/llm/vector/graph/tool/trace, and line 106 reserves 3009 for an
   optional `hash` service. Use port `3010`. Add the line (next to the other
   `SERVICE_*_URL` entries):

   ```
   SERVICE_PATHWAY_URL=grpc://localhost:3010
   ```

   Apply the identical line to all three `.env*.example` files. libconfig's
   env-merge (`config.js:93-104`) maps `SERVICE_PATHWAY_URL` to the pathway
   server's bind address and to every other service's client lookup for
   `pathway.Pathway.*` methods.

4. Append to `service.tool.endpoints`:
   ```json
   "pathway_list_jobs": {
     "method": "pathway.Pathway.ListJobs",
     "request": "pathway.ListJobsRequest"
   },
   "pathway_describe_job": {
     "method": "pathway.Pathway.DescribeJob",
     "request": "pathway.DescribeJobRequest"
   },
   "pathway_list_agent_profiles": {
     "method": "pathway.Pathway.ListAgentProfiles",
     "request": "pathway.ListAgentProfilesRequest"
   },
   "pathway_describe_agent_profile": {
     "method": "pathway.Pathway.DescribeAgentProfile",
     "request": "pathway.DescribeAgentProfileRequest"
   },
   "pathway_describe_progression": {
     "method": "pathway.Pathway.DescribeProgression",
     "request": "pathway.DescribeProgressionRequest"
   },
   "pathway_list_job_software": {
     "method": "pathway.Pathway.ListJobSoftware",
     "request": "pathway.ListJobSoftwareRequest"
   }
   ```

**File:** `products/guide/starter/config.json` — apply the identical
`init.services` and `service.tool.endpoints` changes so `npx fit-guide --init`
produces a ready-to-run config.

**Files:** any `.env*.example` that ships with the fit-guide starter (check
`products/guide/starter/` for parallel env fixtures) — mirror the
`SERVICE_PATHWAY_URL=grpc://localhost:3010` addition.

### B6. Tool descriptions

**File:** `config/tools.example.yml`

Append six entries following the existing `get_ontology` / `get_subjects` shape.
Each entry's `instructions` and `evaluation` must state that the tool returns
**Turtle RDF using the `fit:` vocabulary** so the LLM knows to treat the result
as graph-compatible data and can chain into `query_by_pattern`. Example
`evaluation` phrasing:

> Turtle RDF describing the job using the `fit:` vocabulary. Skill and behaviour
> IRIs can be passed to `query_by_pattern` or `get_subjects` to retrieve base
> definitions from the graph.

Each `purpose` and `applicability` block must additionally include the
disambiguation sentence from spec § Terminology Risk. Concretely:

- `pathway_list_agent_profiles.purpose` / `.applicability` must contain:
  > "Pathway agent profiles are static role descriptions in framework data —
  > they are NOT runnable LLM sub-agents. Use `list_sub_agents` for delegation."
- `pathway_describe_agent_profile` — same disambiguation sentence.
- `pathway_list_job_software.purpose` / `.applicability` must contain:
  > "This lists software technologies used by the job (Python, Figma, etc.) —
  > NOT the LLM tools available to you."

`pathway_list_jobs`, `pathway_describe_job`, `pathway_describe_progression` do
not collide with Guide's meta-vocabulary but should still use the `pathway_*`
prefix language in their descriptions to signal scope.

Parameter entries match the proto request fields.

**File:** `products/guide/starter/tools.yml` — mirror the same six entries.

### B7. Integration test

**File:** `services/pathway/test/integration.test.js`

This is the automated form of success criteria 7 and 8.

- Start `PathwayService` in-process with real pathway data (`data/pathway` from
  the repo root, resolved via `Finder`).
- Call `DescribeJob` with inputs matching
  `npx fit-pathway job <discipline> <level> --track=<track>`. Parse the returned
  Turtle and assert:
  - `fit:Job` subject exists with the expected IRI.
  - The set of `fit:skill` IRIs in the skill matrix equals the set of skill IDs
    the CLI reports for the same inputs (compare to `deriveJob(...).skillMatrix`
    directly — this guarantees parity with libskill without depending on CLI
    output formatting).
  - Each `fit:proficiency` literal matches the corresponding CLI value.
- Call `DescribeProgression` with the same inputs as
  `npx fit-pathway progress <discipline> <from> <to> --track=<track>`. Parse the
  Turtle and compare the set of `fit:SkillChange` blank nodes to
  `analyzeProgression(...).skillChanges` field-by-field.

(The complementary end-to-end test for Stream A — exporter → resource → graph →
`getSubjects("fit:Skill")` — lives in `products/map/test/pipeline.test.js` and
is owned by plan-a-02.md.)

## Verification against success criteria

| #   | Criterion                                                | How verified                                   |
| --- | -------------------------------------------------------- | ---------------------------------------------- |
| 4   | `npx fit-guide --init` emits pathway endpoints           | B5 starter config edit; fresh-dir manual check |
| 5   | `npx fit-rc status` shows pathway running, tools resolve | B1–B5 end-to-end; manual check                 |
| 7   | Guide answers L3 FDE question matching fit-pathway       | B7 `DescribeJob` integration test              |
| 8   | Guide answers progression delta matching fit-pathway     | B7 `DescribeProgression` integration test      |
| 9   | Adversarial terminology probes pass                      | B6 disambiguation sentences; manual LLM check  |

Criteria 1, 2, 3, and 6 are covered by [plan-a-02.md](plan-a-02.md).

## File summary

**Created:**

- `services/pathway/package.json`
- `services/pathway/proto/pathway.proto`
- `services/pathway/index.js`
- `services/pathway/src/serialize.js`
- `services/pathway/server.js`
- `services/pathway/test/service.test.js`
- `services/pathway/test/serialize.test.js`
- `services/pathway/test/integration.test.js`

**Modified:**

- `config/config.example.json` (B5 — `init.services` entry + six
  `service.tool.endpoints` entries. Do **not** add a `service.pathway` host/port
  block — host/port come from env vars.)
- `.env.local.example` (B5 — `SERVICE_PATHWAY_URL=grpc://localhost:3010`)
- `.env.docker-native.example` (B5 — same)
- `.env.docker-supabase.example` (B5 — same)
- `config/tools.example.yml` (six new entries)
- `products/guide/starter/config.json` (mirror example)
- `products/guide/starter/tools.yml` (mirror example)
- Any `.env*.example` files in `products/guide/starter/` (mirror the
  `SERVICE_PATHWAY_URL` addition if present)

**Deleted:** none.
