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
from codegen metadata and builds a Zod schema for each tool. Every parameter is
marked `.optional()`, so agents can omit fields they do not need.

### Proto type to Zod validator

Each scalar proto field maps to a fixed Zod validator. Numeric proto types all
collapse to `z.number()`:

| Proto field type                                              | Zod validator |
| ------------------------------------------------------------ | ------------- |
| `string`                                                     | `z.string()`  |
| `bool`                                                       | `z.boolean()` |
| `int32`, `int64`, `uint32`, `uint64`, `sint32`, `sint64`     | `z.number()`  |
| `float`, `double`, `fixed32`, `fixed64`, `sfixed32`, `sfixed64` | `z.number()`  |
| any unrecognized scalar                                       | `z.string()`  |

A field type with no entry in the table falls back to `z.string()` rather than
failing the build, so an exotic scalar still produces a usable tool parameter.

### Scalar, repeated, nested, and system fields

`libmcp` treats the four field shapes differently:

- **Scalar fields** become their Zod equivalent from the table above, marked
  optional.
- **Repeated fields** accept either a single value or an array --
  `z.union([validator, z.array(validator)])`. At call time `libmcp`
  normalizes a single value into a one-element array before constructing the
  request, so an agent may pass `"electronics"` or `["electronics", "tools"]`
  for the same field.
- **Nested message fields** (any field whose type is another proto message) are
  excluded. Only flat scalar parameters reach the agent, which keeps tool
  schemas shallow and avoids exposing internal envelope types.
- **System fields** -- `anthropic_api_key`, `filter`, and `resource_id` -- are
  excluded automatically. These are supplied by the runtime, not the agent, so
  they never appear in the tool schema even when the proto message declares
  them.

A scalar field that an agent omits is normalized to an empty string before the
typed request is constructed; a repeated field that is omitted becomes an empty
array.

### Field descriptions from proto comments

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
'software-engineering')" and "Level id (e.g. 'J060')". A field with no comment
falls back to its own name with underscores replaced by spaces -- `max_tokens`
becomes the description "max tokens" -- so a missing comment never leaves a
parameter undescribed, just under-described.

## Troubleshooting registration

Registration runs once at startup, when the MCP server reads `config.json` and
walks each tool entry. A misconfigured entry throws immediately rather than
failing silently at call time. The error names the exact cause:

| Symptom at startup                                            | Cause                                                                 | Fix                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `no metadata for <method>`                                   | Codegen has not run since the proto method was added or renamed        | Run `npx fit-codegen --all`, then restart the server                                          |
| `no libtype class for <type>`                                | The request message type is not exported from `@forwardimpact/libtype` | Confirm the proto file is discovered by codegen and the package namespace matches the import |
| `no client for package "<package>"`                          | No gRPC client was passed for the method's package                     | Add the package's client to the `clients` object you hand `registerToolsFromConfig`           |
| Tool absent from `tools/list`, no error                      | The tool key is missing from `service.mcp.tools`, or the config did not reload | Confirm the key under `service.mcp.tools` and restart so the server re-reads `config.json`    |

The `method` path is split into `package.Service.Method`. The metadata is keyed
by `package.Service`, and the request class is resolved from
`@forwardimpact/libtype` by the method's request-type namespace. A mismatch in
any of the three parts surfaces as one of the errors above, so read the failing
identifier in the message against your proto file.

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
