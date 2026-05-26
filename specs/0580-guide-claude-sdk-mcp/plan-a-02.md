# Part 2 — MCP server (`services/mcp`)

## Scope

Create a new HTTP+SSE MCP server that exposes Guide's 10 retained tools and the
`guide-default` prompt. The server fans out to the existing `graph`, `vector`,
and `pathway` gRPC backends. Bearer-token authentication on every request. The
`web` service is retained (Part 3 removes its agent dependency) but no MCP tool
currently routes to it — the design's component diagram includes it for
architectural completeness. This service has no `proto/` directory (it speaks
HTTP+SSE, not gRPC).

## Prerequisites

Part 1 complete (`mcpToken()` available on `Config`).

## Steps

### 1. Create package

**Created:** `services/mcp/package.json`

```json
{
  "name": "@forwardimpact/svcmcp",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "files": ["index.js", "server.js", "tools.js", "prompts/"],
  "dependencies": {
    "@forwardimpact/libconfig": "workspace:*",
    "@forwardimpact/librpc": "workspace:*",
    "@forwardimpact/libtelemetry": "workspace:*",
    "@forwardimpact/libtype": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0"
  },
  "devDependencies": {
    "@forwardimpact/libharness": "workspace:*"
  }
}
```

### 2. Write the guide-default prompt

**Created:** `services/mcp/prompts/guide-default.md`

Single-agent system prompt that collapses the planner → researcher → editor
chain. Structure:

```markdown
# Guide — Engineering Framework Agent

You are Guide, an AI agent with deep knowledge of an engineering framework.
You help engineers understand skills, levels, behaviours, career progression,
and job expectations by querying a knowledge graph and semantic index.

## Workflow

1. **Orient** — call `get_ontology` to learn available entity types and
   relationship predicates before constructing queries.
2. **Query** — use `get_subjects`, `query_by_pattern`, `search_content`, and
   `pathway_*` tools to retrieve data. Prefer structured graph queries for
   lookups; use `search_content` for open-ended questions.
3. **Synthesize** — compose your answer from retrieved data only. Every claim
   must trace to a tool result. Never fabricate entities, levels, or skills.

## Tool selection guidance

- Discipline/level/track lookups → `pathway_describe_job`
- Skill lists for a capability → `query_by_pattern` with capability URI
- Behaviour maturity descriptions → `query_by_pattern` with behaviour URI
- Career progression deltas → `pathway_describe_progression`
- Software toolkits → `pathway_list_job_software`
- Agent profiles → `pathway_list_agent_profiles`, `pathway_describe_agent_profile`
- Open-ended "how should I..." → `search_content`
- Entity discovery → `get_ontology` then `get_subjects`

## Response format

- Lead with a direct answer, then supporting detail.
- Cite the tools and entities that grounded each claim.
- If the data is insufficient, say so — do not guess.
```

Exact wording will be refined during implementation; the structure and
constraints above are load-bearing.

### 3. Create the MCP server entry point

**Created:** `services/mcp/server.js`

```javascript
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createClient } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createTracer } from "@forwardimpact/librpc";
import { createMcpService } from "./index.js";

const config = await createServiceConfig("mcp");
const logger = createLogger("mcp");
const tracer = await createTracer("mcp");

const graphClient  = await createClient("graph", logger, tracer);
const vectorClient = await createClient("vector", logger, tracer);
const pathwayClient = await createClient("pathway", logger, tracer);

const service = createMcpService({
  config, logger, graphClient, vectorClient, pathwayClient,
});

await service.start();
```

Configuration follows the standard `SERVICE_MCP_*` convention:

- `SERVICE_MCP_HOST` (default `0.0.0.0`)
- `SERVICE_MCP_PORT` (default `3009`)
- `SERVICE_MCP_URL` resolved by libconfig

### 4. Implement the MCP service

**Created:** `services/mcp/index.js`

Key responsibilities:

1. **Create `McpServer`** from `@modelcontextprotocol/sdk/server/mcp.js` with
   name `"guide"` and version from `package.json`.

2. **Register tools** — call `registerTools(server, clients)` (from `tools.js`).

3. **Register prompt** — `server.prompt("guide-default", ...)` that reads
   `prompts/guide-default.md` from disk and returns it as a text message.

4. **Start HTTP server** with bearer-token middleware:

   ```javascript
   import { StreamableHTTPServerTransport }
     from "@modelcontextprotocol/sdk/server/streamableHttp.js";

   // HTTP request handler
   async function handleRequest(req, res) {
     // Auth check
     const auth = req.headers.authorization;
     if (!auth || auth !== `Bearer ${config.mcpToken()}`) {
       res.writeHead(401);
       res.end('Unauthorized');
       return;
     }
     // Delegate to MCP transport
     await transport.handleRequest(req, res);
   }
   ```

5. **`/health` endpoint** — returns `200 { status: "ok" }` without auth (health
   probes must not require credentials).

6. **Graceful shutdown** — SIGINT/SIGTERM close the HTTP server and gRPC client
   connections.

### 5. Implement tool handlers

**Created:** `services/mcp/tools.js`

Each tool is registered with a JSON Schema input definition and a handler that:

1. Validates input (MCP SDK handles schema validation)
2. Creates a gRPC request message via `@forwardimpact/libtype`
3. Calls the appropriate gRPC client method
4. Returns the gRPC response as an MCP text content block

**Tool table:**

| MCP tool                         | gRPC client | Method                 | Input schema                                                                    |
| -------------------------------- | ----------- | ---------------------- | ------------------------------------------------------------------------------- |
| `get_ontology`                   | graph       | `GetOntology`          | `{}`                                                                            |
| `get_subjects`                   | graph       | `GetSubjects`          | `{ type?: string }`                                                             |
| `query_by_pattern`               | graph       | `QueryByPattern`       | `{ subject?: string, predicate?: string, object?: string }`                     |
| `search_content`                 | vector      | `SearchContent`        | `{ input: string[] }` (proto field: `repeated string input`)                    |
| `pathway_list_jobs`              | pathway     | `ListJobs`             | `{ discipline?: string }`                                                       |
| `pathway_describe_job`           | pathway     | `DescribeJob`          | `{ discipline: string, level: string, track?: string }`                         |
| `pathway_list_agent_profiles`    | pathway     | `ListAgentProfiles`    | `{ discipline?: string }`                                                       |
| `pathway_describe_agent_profile` | pathway     | `DescribeAgentProfile` | `{ discipline: string, track: string }` (no `level`/`stage` — field 3 reserved) |
| `pathway_describe_progression`   | pathway     | `DescribeProgression`  | `{ discipline: string, from_level: string, to_level: string, track?: string }`  |
| `pathway_list_job_software`      | pathway     | `ListJobSoftware`      | `{ discipline: string, level: string, track?: string }`                         |

Handler pattern (representative):

```javascript
export function registerTools(server, { graphClient, vectorClient, pathwayClient }) {
  server.tool(
    "get_ontology",
    "Returns all entity types and relationship predicates in the knowledge graph.",
    {},
    async () => {
      const result = await graphClient.GetOntology(
        graph.Empty.fromObject({})
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.toJSON()) }],
      };
    }
  );

  server.tool(
    "query_by_pattern",
    "Retrieves structured data by traversing graph relationships using triple patterns.",
    {
      subject: { type: "string", description: "Subject URI or '?' wildcard" },
      predicate: { type: "string", description: "Predicate URI or '?' wildcard" },
      object: { type: "string", description: "Object URI/literal or '?' wildcard" },
    },
    async ({ subject, predicate, object }) => {
      const result = await graphClient.QueryByPattern(
        graph.PatternQuery.fromObject({ subject, predicate, object })
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result.toJSON()) }],
      };
    }
  );

  // ... remaining 8 tools follow the same pattern
}
```

### 6. Tests

**Created:** `services/mcp/test/mcp.test.js`

| Test                                   | Setup                                             | Assertion                                         |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| All 10 tools registered                | Create server, list tools                         | Tool count = 10, names match table                |
| `guide-default` prompt registered      | List prompts                                      | Contains `guide-default`                          |
| `guide-default` prompt returns text    | Get prompt                                        | Content is non-empty string with key instructions |
| Auth rejects missing token             | HTTP request without Authorization                | 401 response                                      |
| Auth rejects wrong token               | Authorization with bad token                      | 401 response                                      |
| Auth accepts valid token               | Authorization with correct token                  | Request proceeds                                  |
| Health endpoint needs no auth          | GET /health without token                         | 200 response                                      |
| Tool handler routes to correct backend | Call `get_ontology` with mock graph client        | `graphClient.GetOntology` called                  |
| Tool handler routes pathway tools      | Call `pathway_list_jobs` with mock pathway client | `pathwayClient.ListJobs` called                   |
| Tool handler routes vector tools       | Call `search_content` with mock vector client     | `vectorClient.SearchContent` called               |

Mock gRPC clients return canned proto responses. Use `@forwardimpact/libharness`
for config mocks.

## Files changed

| Action  | Path                                    |
| ------- | --------------------------------------- |
| Created | `services/mcp/package.json`             |
| Created | `services/mcp/server.js`                |
| Created | `services/mcp/index.js`                 |
| Created | `services/mcp/tools.js`                 |
| Created | `services/mcp/prompts/guide-default.md` |
| Created | `services/mcp/test/mcp.test.js`         |

## Verification

```bash
bun install                    # pick up new workspace package
bun test services/mcp/
bun run check
```
