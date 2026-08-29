---
title: Add a Service to the MCP Surface
description: A new gRPC service becomes agent-accessible with one registration and no integration code.
---

You have a new gRPC service. You need agents to reach its RPCs as tools.

The MCP service reads tool definitions from `config/config.json`. It uses
codegen metadata to build typed parameter schemas automatically.

To add your service, do three tasks. Define the proto files. Generate the
client code. Add entries to the config file. You write no handler code, no
schema translation, and no per-service integration logic.

For the full MCP service setup and architecture, see
[Expose Backend Services as Agent Tools](/docs/services/typed-contracts/).

## Prerequisites

- You completed the
  [Expose Backend Services as Agent Tools](/docs/services/typed-contracts/)
  guide. You understand the MCP service architecture. You can connect a client.
- A gRPC service with a proto file under `proto/` or `services/<name>/proto/`.
- `npx fit-codegen generate --all` available to regenerate client code.

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

Return `tool.ToolCallResult` so the MCP service handles the response
uniformly. The service checks for `identifiers` or `content`. It resolves
`identifiers` through the resource index. It returns `content` as text.

## Step 2: Generate client code

Run codegen to produce the typed client, type definitions, and metadata the MCP
service needs:

```sh
npx fit-codegen generate --all
```

The command generates:

- `generated/services/myservice/client.js` holds the typed `MyServiceClient`
  class with a `GetItems` method.
- `generated/definitions/myservice.js` holds the gRPC service definition.
- Type entries in `generated/types/` hold `myservice.GetItemsRequest` with
  `fromObject` and `toObject`.
- Metadata entries in `generated/types/metadata.js` hold the field descriptors
  that the MCP service reads to build Zod schemas.

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

The `method` field uses the `<package>.<Service>.<RPC>` format that matches
the proto definition. The `description` becomes the tool's summary visible to
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

The `registerToolsFromConfig` function looks up clients by package name. The
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

The MCP service validates the parameters against the codegen-derived schema.
It creates a typed `GetItemsRequest`. It calls `myserviceClient.GetItems(req)`.
It returns the content or the resolved identifiers.

## How the service derives parameter schemas

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
validation schema. Required fields become `z.string()`. Optional fields become
`z.string().optional()`. Repeated fields become `z.array(z.string())`.

## Verify

You reach the outcome of this guide when:

- `npx fit-codegen generate --all` generates client code for your new service.
- The tool entry in `config/config.json` uses the correct
  `<package>.<Service>.<RPC>` method path.
- The MCP service starts without errors after you add the client.
- `listTools` includes your new tool with the configured description.
- `callTool` with valid parameters returns a response from your backend service.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
