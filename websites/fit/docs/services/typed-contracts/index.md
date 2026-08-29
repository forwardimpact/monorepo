---
title: Expose Backend Services as Agent Tools
description: Every gRPC endpoint becomes an agent tool from a single configuration file, with no per-endpoint integration code.
---

You have several gRPC services: graph, vector, pathway, and map. You need agents
to reach them as tools. A separate MCP wrapper for each service duplicates
schema translation, session management, and authentication logic. The MCP
service reads a single tool configuration from `config/config.json`. It
creates gRPC clients for each backend. It exposes every configured endpoint as
a typed MCP tool through one HTTP/SSE server.

This guide explains the tool configuration. You start the MCP service. You
connect a client. You then verify that agents can reach backend RPCs as tools.

## Prerequisites

- Node.js 18+
- Generated client code. Run `npx fit-codegen generate --all` if it is missing.
- Running backend services. Start them with `npx fit-rc start`.
- The `MCP_TOKEN` environment variable set. The MCP service requires a bearer
  token for authentication.

Install the MCP SDK if you build a client:

```sh
npm install @modelcontextprotocol/sdk
```

## Architecture overview

The MCP service is the only non-gRPC service in the stack. It exposes an
HTTP/SSE interface with `@modelcontextprotocol/sdk`. It delegates every tool
call to one of the gRPC backend services. Each client session gets its own
`McpServer` instance for isolation.

```text
Agent SDK ──── HTTP/SSE ──── MCP service ──┬── gRPC ── graph
                                           ├── gRPC ── vector
                                           ├── gRPC ── pathway
                                           ├── gRPC ── map
                                           └── resource index
```

Tool registration is declarative. The `service.mcp.tools` section of
`config/config.json` maps tool names to gRPC methods:

```json
{
  "service": {
    "mcp": {
      "tools": {
        "QueryByPattern": {
          "method": "graph.Graph.QueryByPattern",
          "description": "Retrieves structured data by traversing graph relationships using triple patterns."
        },
        "SearchContent": {
          "method": "vector.Vector.SearchContent",
          "description": "Find detailed content using semantic similarity search."
        },
        "DescribeJob": {
          "method": "pathway.Pathway.DescribeJob",
          "description": "Describe a job at (discipline, level, optional track)."
        }
      }
    }
  }
}
```

Each entry specifies a `method` in `<package>.<Service>.<RPC>` format and a
`description` that becomes the tool's human-readable summary. The MCP service
reads the codegen metadata for each method. It builds a Zod schema for
parameter validation. As a result, the tool parameters take their types from
the proto definitions automatically.

## Default tool set

The MCP service ships with these tools pre-configured:

| Tool                   | Backend              | Purpose                                              |
| ---------------------- | -------------------- | ---------------------------------------------------- |
| `GetOntology`          | graph                | Returns entity types and relationship predicates     |
| `GetSubjects`          | graph                | Lists entity URIs, optionally filtered by type       |
| `QueryByPattern`       | graph                | Traverses relationships with triple patterns         |
| `SearchContent`        | vector               | Semantic similarity search over indexed content      |
| `ListJobs`             | pathway              | Lists valid discipline/level/track combinations      |
| `DescribeJob`          | pathway              | Derives a full role definition                       |
| `ListAgentProfiles`    | pathway              | Lists valid discipline/track combinations            |
| `DescribeAgentProfile` | pathway              | Derives an agent profile                             |
| `DescribeProgression`  | pathway              | Computes the delta between two levels                |
| `ListJobSoftware`      | pathway              | Derives the software toolkit for a role              |
| `GetMarkersForProfile` | pathway              | Lists skill markers expected at a discipline/level/track |
| `GetUnscoredArtifacts` | map                  | Lists artifacts with no evidence rows, scoped by person, manager, or org |
| `GetArtifact`          | map                  | Returns full detail for a single artifact by UUID    |
| `WriteEvidence`        | map                  | Writes an evidence row that links an artifact to a skill marker |
| `GetPerson`            | map                  | Returns an engineer's profile by email               |

## Start the MCP service

The MCP service starts as part of the service stack:

```sh
npx fit-rc start
```

Or start it individually during development:

```sh
MCP_TOKEN=your-token node --watch services/mcp/server.js
```

The server listens on port 3011 by default. Configure the port in
`config/config.json` or with `SERVICE_MCP_URL` in `.env`. Verify that the
server runs:

```sh
curl http://localhost:3011/health
```

Expected output:

```json
{"status":"ok"}
```

## Connect a client

Agents connect to the MCP service over HTTP. The `@modelcontextprotocol/sdk`
provides the client transport:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3011"),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.MCP_TOKEN}`,
      },
    },
  },
);

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);
```

### List available tools

```js
const tools = await client.listTools();
console.log("Available tools:", tools.tools.length);

for (const tool of tools.tools) {
  console.log(`  ${tool.name}: ${tool.description}`);
}
```

Expected output:

```text
Available tools: 15
  GetOntology: Returns all entity types and relationship predicates in the knowledge graph.
  GetSubjects: Lists entity URIs in the graph, optionally filtered by type.
  QueryByPattern: Retrieves structured data by traversing graph relationships using triple patterns.
  SearchContent: Find detailed content using semantic similarity search.
  ListJobs: List jobs (discipline x level x track) defined in the pathway standard.
  DescribeJob: Describe a job at (discipline, level, optional track) including skills, behaviours, and responsibilities.
  ListAgentProfiles: List static agent profile (discipline, track) combinations.
  DescribeAgentProfile: Describe stage agent profiles for a (discipline, track).
  DescribeProgression: Compute the progression delta between two levels of the same discipline.
  ListJobSoftware: List the software toolkit derived for a job.
  GetMarkersForProfile: Get skill markers an engineer at (discipline, level, track) is expected to demonstrate.
  GetUnscoredArtifacts: List artifacts that have no evidence rows, scoped by person email, manager email, or org-wide.
  GetArtifact: Get full detail for a single artifact by its UUID.
  WriteEvidence: Write one evidence row linking an artifact to a skill marker. Idempotent on (artifact_id, skill_id, level_id, marker_text). Call in parallel for multiple markers.
  GetPerson: Get an engineer's profile (discipline, level, track) by email.
```

### Call a tool

```js
const result = await client.callTool({
  name: "DescribeJob",
  arguments: {
    discipline: "software-engineering",
    level: "J070",
    track: "platform",
  },
});

console.log(result.content[0].text.substring(0, 300));
```

The response is the Turtle RDF content from the pathway service. The MCP
content format wraps it.

## How tool registration works

When the MCP service starts, `registerToolsFromConfig` reads the tool
configuration. For each entry, the function:

1. Parses the `method` string into package, service, and RPC name.
2. Looks up the codegen metadata for the RPC's request type fields.
3. Builds a Zod schema from the field metadata for parameter validation.
4. Registers the tool on the `McpServer` with the schema and a handler. The
   handler normalizes the parameters. It creates a typed request through
   `fromObject`. It then calls the gRPC client and returns the result.

An RPC can return resource identifiers instead of content. The service then
resolves them through the resource index. It returns the content as text.

## Session management

Each client connection gets its own `McpServer` and transport pair. The
service tracks sessions by session ID. It reaps a session after 30 minutes of
inactivity. It runs the reap check every 60 seconds.

When a client disconnects, the service removes its session from the session
map. When the server shuts down, it closes all active sessions before it stops
the HTTP listener.

## Authentication

Every request must include a `Bearer` token in the `Authorization` header. The
service compares the token against `config.mcpToken()`. That function reads
the `MCP_TOKEN` environment variable. Requests without a valid token receive a
401 response.

## Verify

You reach the outcome of this guide when:

- The MCP service starts and `/health` returns `{"status":"ok"}`.
- An MCP client connects with the correct bearer token.
- `listTools` returns all configured tools with descriptions.
- `callTool` for a pathway RPC returns Turtle RDF content.
- `callTool` for a graph or vector RPC returns content or resolved
  resource text.

If the MCP service starts but tool calls fail, run `npx fit-rc status` to
confirm that the backend gRPC services run. The MCP service cannot serve tool
calls if the backend it delegates to is unreachable.

## What's next

<div class="grid">

<!-- part:card:add-service -->

</div>
