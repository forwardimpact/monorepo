---
title: Expose a Proto Method as an Agent Tool
description: A new gRPC method becomes an agent tool with one config entry — no glue code, no hand-written schema.
---

You need to make a new gRPC method available to agents as an MCP tool. The
method already exists in a proto file and the service implements it, but agents
cannot see it yet. Rather than writing a tool schema by hand or adding
registration code, you add a single entry to `config/config.json` and rerun
codegen. `@forwardimpact/libmcp` reads that config at startup and registers the
tool with its parameter schema derived directly from the proto definition.

For the full workflow of setting up typed service contracts from scratch, see
[Keep Service Contracts Typed](/docs/libraries/typed-contracts/).

## Prerequisites

- Node.js 18+
- A working Guide installation with services running (see
  [Getting Started](/docs/getting-started/))
- `@forwardimpact/libmcp` and `@forwardimpact/libtype` installed:

```sh
npm install @forwardimpact/libmcp @forwardimpact/libtype
```

- The proto method you want to expose is already defined in a `.proto` file and
  implemented in the corresponding service

## Overview

Registering a tool takes two steps:

| Step | What you do                            | What happens                                         |
| ---- | -------------------------------------- | ---------------------------------------------------- |
| 1    | Add a tool entry to `config.json`      | Maps a tool name to a `package.service.method` path  |
| 2    | Run codegen                            | Generates metadata so libmcp can build the Zod schema |

No code changes are needed. The MCP server reads `config.json` on startup,
looks up each method's field metadata from `@forwardimpact/libtype`, builds a
Zod schema from the proto field definitions, and registers the tool on the MCP
server.

## Step 1: Add the config entry

Open `config/config.json` and add a new key under `service.mcp.tools`. The key
is the tool name agents will see. The value needs two fields:

- `method` -- the fully qualified proto method path as `package.Service.Method`
- `description` -- a one-line description agents read to decide when to use the
  tool

For example, to expose the `DescribeProgression` method from the Pathway
service:

```json
{
  "service": {
    "mcp": {
      "tools": {
        "DescribeProgression": {
          "method": "pathway.Pathway.DescribeProgression",
          "description": "Compute the progression delta between two levels of the same discipline."
        }
      }
    }
  }
}
```

The `method` path has three parts:

| Part      | Source                                      | Example     |
| --------- | ------------------------------------------- | ----------- |
| `package` | The `package` declaration in the proto file | `pathway`   |
| `Service` | The `service` block name in the proto file  | `Pathway`   |
| `Method`  | The `rpc` method name                       | `DescribeProgression` |

These must match the proto definition exactly. If the proto file declares
`package pathway;` and `service Pathway { rpc DescribeProgression(...) ... }`,
then the method path is `pathway.Pathway.DescribeProgression`.

## Step 2: Run codegen

Codegen reads the proto files and produces the metadata that `libmcp` needs at
runtime. Without this step, the new method has no field metadata and
registration will fail with a "no metadata" error.

```sh
npx fit-codegen --all
```

This generates `metadata.js` inside `@forwardimpact/libtype`, which contains
the request type name and field definitions for every proto method. The
`registerToolsFromConfig` function consults this metadata to build the tool's
parameter schema automatically.

## Verify the tool is registered

Restart the MCP server, then check that the tool appears. Two ways to confirm:

- **Inspect the config** — every tool declared under `service.mcp.tools` in
  `config/config.json` is registered at startup. The keys in that object are
  exactly the tool names agents see.
- **Connect an MCP client** — call the `tools/list` JSON-RPC method against the
  running MCP server and look for your new tool name in the response.

If the tool does not appear, check:

1. The `method` path in `config.json` matches the proto definition exactly
   (package, service, and method names are case-sensitive)
2. Codegen has been run after the proto file was last changed
3. The gRPC client for the method's package is passed to
   `registerToolsFromConfig` (the MCP server must create a client for each
   package it uses)

## How parameters are derived

You do not write parameter schemas. `libmcp` reads the proto message fields
from codegen metadata and builds a Zod schema for each tool:

- **Scalar fields** (`string`, `int32`, `bool`, etc.) become their Zod
  equivalents -- all marked optional so agents can omit fields they do not need
- **Repeated fields** accept either a single value or an array -- `libmcp`
  normalizes single values into arrays before calling the gRPC method
- **System fields** (`anthropic_api_key`, `filter`, `resource_id`) are excluded
  automatically -- agents never see them
- **Nested message fields** are excluded -- only flat scalar parameters are
  exposed

Field descriptions come from proto comments. If a proto field has a comment
above it, that comment becomes the parameter description agents see when
inspecting the tool schema:

```protobuf
message DescribeJobRequest {
  // Discipline id (e.g. 'software-engineering')
  string discipline = 1;
  // Level id (e.g. 'J060')
  string level = 2;
}
```

These comments produce tool parameters described as "Discipline id (e.g.
'software-engineering')" and "Level id (e.g. 'J060')".

## Checklist

- [ ] Config entry uses the correct `package.Service.Method` path matching the
      proto definition
- [ ] Description is a single sentence that helps agents decide when to use the
      tool
- [ ] Codegen has been run after adding or changing the proto method
- [ ] The tool key appears under `service.mcp.tools` in `config/config.json`,
      and the running MCP server's `tools/list` response includes it
- [ ] Proto field comments are descriptive enough for agents to understand each
      parameter without reading the proto file

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../ship-endpoint -->

</div>
