---
title: Add a Service to the MCP Surface
description: A new gRPC service becomes agent-accessible with one registration — no integration code.
---

You have a new gRPC service and you need agents to reach its RPCs as tools. The
MCP service reads tool definitions from `config/config.json` and uses codegen
metadata to build typed parameter schemas automatically. To add your service,
you define proto files, generate the client code, and add entries to the config
file. No handler code, no schema translation, no per-service integration logic.

For the full MCP service setup and architecture, see
[Expose Backend Services as Agent Tools](/docs/services/typed-contracts/).

## Prerequisites

- Completed the
  [Expose Backend Services as Agent Tools](/docs/services/typed-contracts/)
  guide -- you understand the MCP service architecture and can connect a client.
- A gRPC service with a proto file under `proto/` (or `services/<name>/proto/`).
- `npx fit-codegen generate --all` available for regenerating client code.

## Step 1: Define the proto file

Create a proto file for your service. The file defines the gRPC service,
request messages, and response types:

```protobuf
syntax = "proto3";

package myservice;

import "tool.proto";

service MyService {
  rpc GetItems(GetItemsRequest) returns (tool.ToolCallResult);
}

message GetItemsRequest {
  string category = 1;
  optional string filter = 2;
}
```

Returning `tool.ToolCallResult` lets the MCP service handle the response
uniformly -- it checks for `identifiers` (resolved via the resource index) or
`content` (returned as text).

## Step 2: Generate client code

Run codegen to produce the typed client, type definitions, and metadata the MCP
service needs:

```sh
npx fit-codegen generate --all
```

This generates:

- `generated/services/myservice/client.js` -- typed `MyServiceClient` class
  with `GetItems` method.
- `generated/definitions/myservice.js` -- gRPC service definition.
- Type entries in `generated/types/` -- `myservice.GetItemsRequest` with
  `fromObject` and `toObject`.
- Metadata entries in `generated/types/metadata.js` -- field descriptors the
  MCP service reads to build Zod schemas.

## Step 3: Add tool entries to config

Open `config/config.json` and add entries under `service.mcp.tools`:

```json
{
  "service": {
    "mcp": {
      "tools": {
        "GetItems": {
          "method": "myservice.MyService.GetItems",
          "description": "Retrieve items by category from the items service."
        }
      }
    }
  }
}
```

The `method` field uses the `<package>.<Service>.<RPC>` format matching the
proto definition. The `description` becomes the tool's summary visible to
agents.

## Step 4: Register the gRPC client in the MCP server

The MCP server creates gRPC clients for each backend package in
`services/mcp/server.js`. Add a client for your service:

```js
const myserviceClient = await createClient("myservice", logger, tracer);
```

Then pass it to `createMcpService` in the clients map:

```js
const service = createMcpService({
  config,
  logger,
  graphClient,
  vectorClient,
  pathwayClient,
  mapClient,
  myserviceClient,
  resourceIndex,
});
```

The `registerToolsFromConfig` function looks up clients by package name -- the
key in the clients object must match the package name in the `method` string.

## Step 5: Restart and verify

Restart the MCP service:

```sh
npx fit-rc restart
```

Then verify the new tool appears:

```js
const tools = await client.listTools();
const myTool = tools.tools.find((t) => t.name === "GetItems");
console.log("Found:", myTool?.name);
console.log("Description:", myTool?.description);
```

Expected output:

```text
Found: GetItems
Description: Retrieve items by category from the items service.
```

Call the tool:

```js
const result = await client.callTool({
  name: "GetItems",
  arguments: {
    category: "capabilities",
  },
});

console.log(result.content[0].text.substring(0, 200));
```

The MCP service validates the parameters against the codegen-derived schema,
creates a typed `GetItemsRequest`, calls `myserviceClient.GetItems(req)`, and
returns the content or resolved identifiers.

## How parameter schemas are derived

You do not write Zod schemas by hand. The codegen metadata includes field
descriptors for each request message:

```js
// generated/types/metadata.js (excerpt)
{
  "myservice.MyService": {
    "GetItems": {
      "requestType": "myservice.GetItemsRequest",
      "fields": {
        "category": { "type": "string", "required": true },
        "filter": { "type": "string", "required": false }
      }
    }
  }
}
```

`registerToolsFromConfig` calls `buildZodSchema(fields)` to produce the
validation schema. Required fields become `z.string()`, optional fields become
`z.string().optional()`, and repeated fields become `z.array(z.string())`.

## Verify

You have reached the outcome of this guide when:

- `npx fit-codegen generate --all` generates client code for your new service.
- The tool entry in `config/config.json` uses the correct
  `<package>.<Service>.<RPC>` method path.
- The MCP service starts without errors after adding the client.
- `listTools` includes your new tool with the configured description.
- `callTool` with valid parameters returns a response from your backend service.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
