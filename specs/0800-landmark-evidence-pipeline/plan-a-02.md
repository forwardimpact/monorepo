# Plan 0800-A Part 02 — Service Layer

Depends on Part 01 (schema migrations must be applied).

## Step 1: svcpathway proto — `GetMarkersForProfile`

**Modified:** `services/pathway/proto/pathway.proto`

Add to the `service Pathway` block:

```proto
rpc GetMarkersForProfile(GetMarkersForProfileRequest) returns (tool.ToolCallResult);
```

Add after the existing message definitions:

```proto
message GetMarkersForProfileRequest {
  // Discipline id (e.g. 'software_engineering')
  string discipline = 1;
  // Level id (e.g. 'J060')
  string level = 2;
  // Track id for specialization modifier (e.g. 'forward_deployed')
  optional string track = 3;
}
```

**Verify:** `just codegen` succeeds; `PathwayBase` gains a
`GetMarkersForProfile` stub.

---

## Step 2: svcpathway implementation — `GetMarkersForProfile`

**Modified:** `services/pathway/index.js`

Add method to the `PathwayService` class:

```js
async GetMarkersForProfile(req) {
  const data = this.#data;
  const discipline = this.#findDiscipline(req.discipline);
  const level = this.#findLevel(req.level);
  const track = this.#findTrack(req.track);

  const job = deriveJob({
    discipline,
    level,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    capabilities: data.capabilities,
    validationRules: this.#validationRules(),
  });

  if (!job) {
    throw new Error(
      `Invalid profile: discipline=${req.discipline} level=${req.level}` +
        (req.track ? ` track=${req.track}` : ""),
    );
  }

  const markers = [];
  for (const entry of job.skillMatrix) {
    const skill = data.skills.find((s) => s.id === entry.skillId);
    if (!skill?.markers) continue;
    const proficiency = entry.proficiency;
    const levelMarkers = skill.markers[proficiency];
    if (!levelMarkers) continue;
    const allTexts = [
      ...(levelMarkers.human || []),
      ...(levelMarkers.agent || []),
    ];
    for (const text of allTexts) {
      markers.push({
        skill_id: skill.id,
        level_id: proficiency,
        marker_text: text,
      });
    }
  }

  const content = markers
    .map((m) => `${m.skill_id}\t${m.level_id}\t${m.marker_text}`)
    .join("\n");
  return { content };
}
```

**Verify:** Unit test calling `GetMarkersForProfile({ discipline:
"software_engineering", level: "J060" })` returns non-empty content with
tab-separated skill_id, level_id, marker_text rows.

---

## Step 3: svcmap proto

**Created:** `services/map/proto/map.proto`

```proto
syntax = "proto3";

package map;

import "tool.proto";

service Map {
  rpc GetUnscoredArtifacts(GetUnscoredArtifactsRequest) returns (tool.ToolCallResult);
  rpc GetArtifact(GetArtifactRequest) returns (tool.ToolCallResult);
  rpc WriteEvidence(WriteEvidenceRequest) returns (tool.ToolCallResult);
  rpc GetPerson(GetPersonRequest) returns (tool.ToolCallResult);
}

message GetUnscoredArtifactsRequest {
  optional string email = 1;
  optional string manager_email = 2;
  optional bool org = 3;
}

message GetArtifactRequest {
  string artifact_id = 1;
}

message EvidenceRow {
  string artifact_id = 1;
  string skill_id = 2;
  string level_id = 3;
  string marker_text = 4;
  bool matched = 5;
  string rationale = 6;
}

message WriteEvidenceRequest {
  repeated EvidenceRow rows = 1;
}

message GetPersonRequest {
  string email = 1;
}
```

**Verify:** `just codegen` generates `MapBase` and `MapClient`.

---

## Step 4: svcmap implementation

**Created:** `services/map/index.js`

```js
import { services } from "@forwardimpact/librpc";
import {
  getUnscoredArtifacts,
} from "@forwardimpact/map/activity/queries/artifacts";
import { getPerson } from "@forwardimpact/map/activity/queries/org";

const { MapBase } = services;

class SourceTypeRegistry {
  #handlers = new Map();

  register(artifactType, handler) {
    this.#handlers.set(artifactType, handler);
  }

  get(artifactType) {
    const h = this.#handlers.get(artifactType);
    if (!h) throw new Error(`Unknown artifact type: ${artifactType}`);
    return h;
  }

  types() {
    return [...this.#handlers.keys()];
  }
}

function githubDetailHandler(artifact) {
  return {
    artifact_id: artifact.artifact_id,
    artifact_type: artifact.artifact_type,
    email: artifact.email,
    repository: artifact.repository,
    occurred_at: artifact.occurred_at,
    metadata: artifact.metadata,
  };
}

export class MapService extends MapBase {
  #supabase;
  #registry;
  #pathwayClient;

  constructor(config, { supabase, pathwayClient }) {
    super(config);
    this.#supabase = supabase;
    this.#pathwayClient = pathwayClient;
    this.#registry = new SourceTypeRegistry();
    this.#registry.register("pull_request", githubDetailHandler);
    this.#registry.register("review", githubDetailHandler);
    this.#registry.register("commit", githubDetailHandler);
  }

  async GetUnscoredArtifacts(req) {
    const options = {};
    if (req.email) options.email = req.email;
    if (req.manager_email || req.managerEmail)
      options.managerEmail = req.manager_email || req.managerEmail;
    const artifacts = await getUnscoredArtifacts(this.#supabase, options);
    const rows = artifacts
      .filter((a) => this.#registry.types().includes(a.artifact_type))
      .map((a) => ({
        artifact_id: a.artifact_id,
        artifact_type: a.artifact_type,
        email: a.email,
      }));
    const content = JSON.stringify(rows);
    return { content };
  }

  async GetArtifact(req) {
    const id = req.artifact_id || req.artifactId;
    const { data, error } = await this.#supabase
      .from("github_artifacts")
      .select("*")
      .eq("artifact_id", id)
      .single();
    if (error) throw new Error(`GetArtifact: ${error.message}`);
    const handler = this.#registry.get(data.artifact_type);
    const content = JSON.stringify(handler(data));
    return { content };
  }

  async WriteEvidence(req) {
    const rows = req.rows || [];
    if (rows.length === 0) return { content: "0 rows written" };

    const dbRows = rows.map((r) => ({
      artifact_id: r.artifact_id || r.artifactId,
      skill_id: r.skill_id || r.skillId,
      level_id: r.level_id || r.levelId,
      marker_text: r.marker_text || r.markerText,
      matched: r.matched,
      rationale: r.rationale,
    }));

    for (const row of dbRows) {
      if (!row.rationale) throw new Error("rationale is required");
      if (!row.level_id) throw new Error("level_id is required");
      if (row.matched == null) throw new Error("matched is required");
    }

    // Marker-grounding validation: verify each (skill_id, level_id,
    // marker_text) triple exists in the engineering standard. Look up the
    // artifact author's profile, then check markers for that profile.
    const artifactIds = [...new Set(dbRows.map((r) => r.artifact_id))];
    for (const artifactId of artifactIds) {
      const { data: artifact } = await this.#supabase
        .from("github_artifacts")
        .select("email")
        .eq("artifact_id", artifactId)
        .single();
      if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);
      const person = await getPerson(this.#supabase, artifact.email);
      if (!person) throw new Error(`Person not found: ${artifact.email}`);

      const markersResult = await this.#pathwayClient.GetMarkersForProfile({
        discipline: person.discipline,
        level: person.level,
        track: person.track || undefined,
      });
      const validMarkers = new Set(
        (markersResult.content || "")
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t").slice(0, 3).join("\t")),
      );

      const artifactRows = dbRows.filter((r) => r.artifact_id === artifactId);
      for (const row of artifactRows) {
        const key = `${row.skill_id}\t${row.level_id}\t${row.marker_text}`;
        if (!validMarkers.has(key)) {
          throw new Error(
            `Marker not in standard: ${row.skill_id} / ${row.level_id} / ${row.marker_text}`,
          );
        }
      }
    }

    const { error } = await this.#supabase
      .from("evidence")
      .upsert(dbRows, {
        onConflict: "artifact_id,skill_id,level_id,marker_text",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`WriteEvidence: ${error.message}`);
    const content = `${dbRows.length} rows written`;
    return { content };
  }

  async GetPerson(req) {
    const person = await getPerson(this.#supabase, req.email);
    if (!person) throw new Error(`Person not found: ${req.email}`);
    const content = JSON.stringify({
      email: person.email,
      name: person.name,
      discipline: person.discipline,
      level: person.level,
      track: person.track,
      manager_email: person.manager_email,
    });
    return { content };
  }
}
```

**Verify:** Unit test for each method against a mock Supabase client.
`WriteEvidence` rejects rows with markers not in the engineering standard.

---

## Step 5: svcmap `server.js`, `package.json`, `README.md`, `test/`

**Created:** `services/map/server.js`, `services/map/README.md`,
`services/map/test/map.test.js`

```js
#!/usr/bin/env node
import { Server, createClient, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { MapService } from "./index.js";

const config = await createServiceConfig("map");
const logger = createLogger("map");
const tracer = await createTracer("map");

const supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL;
const supabaseKey = config.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
  db: { schema: "activity" },
});

const pathwayClient = await createClient("pathway", logger, tracer);

const service = new MapService(config, { supabase, pathwayClient });
const server = new Server(service, config, logger, tracer);

await server.start();
```

**Created:** `services/map/package.json`

```json
{
  "name": "@forwardimpact/svcmap",
  "version": "0.1.0",
  "description": "Activity reads and writes over gRPC — the agent-facing gateway to Map's activity database.",
  "keywords": ["map", "activity", "evidence", "grpc", "agent"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "services/map"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Platform Builders",
      "goal": "Expose Activity Data to Agents",
      "trigger": "Building an agent feature that reads or writes activity data and realizing the agent would need direct DB access.",
      "bigHire": "read and write activity data from any agent without leaking schema or credentials.",
      "littleHire": "fetch unscored artifacts or write evidence rows without touching Supabase directly.",
      "competesWith": "opening Supabase directly from the agent; building per-product activity endpoints; embedding query logic in the evaluation skill"
    }
  ],
  "type": "module",
  "main": "index.js",
  "bin": {
    "fit-svcmap": "./server.js"
  },
  "files": [
    "proto/",
    "server.js"
  ],
  "scripts": {
    "dev": "node --watch server.js",
    "start": "bun server.js",
    "test": "bun test test/*.test.js"
  },
  "dependencies": {
    "@forwardimpact/libconfig": "^0.1.58",
    "@forwardimpact/librpc": "^0.1.77",
    "@forwardimpact/libtelemetry": "^0.1.30",
    "@forwardimpact/libtype": "^0.1.67",
    "@forwardimpact/map": "^0.15.12",
    "@supabase/supabase-js": "^2.49.4"
  },
  "devDependencies": {
    "@forwardimpact/libharness": "^0.1.14"
  },
  "engines": {
    "bun": ">=1.2.0",
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Created:** `services/map/README.md` — Purpose, key exports, one composition
example. Follow `services/graph/README.md` as template.

**Created:** `services/map/test/map.test.js` — Unit tests for each RPC method
using a mock Supabase client and mock pathwayClient.

**Verify:** `bun install` resolves deps. `bun test services/map/test/` passes.
`node services/map/server.js` starts without errors (assuming Supabase and
svcpathway are running).

---

## Step 6: Service URL + svcmcp wiring

**Modified:** `products/guide/src/commands/init.js`

Add `SERVICE_MAP_URL: "grpc://localhost:3006"` to the `serviceUrls` object
(after `SERVICE_MCP_URL` at line 25).

**Modified:** `services/mcp/server.js`

Add after the pathwayClient creation (line 15):

```js
const mapClient = await createClient("map", logger, tracer);
```

Pass to `createMcpService`:

```js
const service = createMcpService({
  config,
  logger,
  graphClient,
  vectorClient,
  pathwayClient,
  mapClient,
  resourceIndex,
});
```

**Modified:** `services/mcp/index.js`

In `createMcpService()` parameter destructuring (line 86), add `mapClient`.

In `makeServer()` (line 95), add `map: mapClient` to the clients object:

```js
registerToolsFromConfig(
  server,
  config,
  { graph: graphClient, vector: vectorClient, pathway: pathwayClient, map: mapClient },
  resourceIndex,
);
```

**Modified:** `services/mcp/package.json`

Add `"@forwardimpact/svcmap": "^0.1.0"` to dependencies.

**Verify:** MCP server starts and the new tools appear in tool listing.

---

## Step 7: Config — service topology + tool registration

**Modified:** `products/guide/starter/config.json`

Add to `init.services` (before `mcp`, which must start last):

```json
{
  "name": "map",
  "command": "node -e \"import('@forwardimpact/svcmap/server.js')\""
}
```

Add to `service.mcp.tools`:

```json
"GetMarkersForProfile": {
  "method": "pathway.Pathway.GetMarkersForProfile",
  "description": "Get skill markers an engineer at (discipline, level, track) is expected to demonstrate."
},
"GetUnscoredArtifacts": {
  "method": "map.Map.GetUnscoredArtifacts",
  "description": "List artifacts that have no evidence rows, scoped by person email, manager email, or org-wide."
},
"GetArtifact": {
  "method": "map.Map.GetArtifact",
  "description": "Get full detail for a single artifact by its UUID."
},
"WriteEvidence": {
  "method": "map.Map.WriteEvidence",
  "description": "Write evidence rows linking artifacts to skill markers. Idempotent on (artifact_id, skill_id, level_id, marker_text)."
},
"GetPerson": {
  "method": "map.Map.GetPerson",
  "description": "Get an engineer's profile (discipline, level, track) by email."
}
```

**Verify:** `just guide` starts all services including map. The five new tools
appear in the MCP tool listing.

---

## Step 8: Codegen + catalog

```sh
just codegen
bun run context:fix
```

**Verify:** `generated/services/bases/MapBase.js` exists.
`generated/services/clients/MapClient.js` exists. `PathwayBase` includes
`GetMarkersForProfile`. `generated/types/metadata.js` includes entries for
`map.Map.*` and `pathway.Pathway.GetMarkersForProfile`. `services/README.md`
lists svcmap in the catalog.
