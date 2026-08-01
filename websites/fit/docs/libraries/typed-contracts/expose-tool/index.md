---
title: Expose a Proto Method as an Agent Tool
description: A new gRPC method becomes an agent tool with one config entry. You write no glue code and no hand-written schema.
---

You need to make a new gRPC method available to agents as an MCP tool. The
method already exists in a proto file and the service implements it, but agents
cannot see it yet. You do not write a tool schema by hand. You do not add
registration code. You add a single entry to `config/config.json` and you rerun
codegen. `@forwardimpact/libmcp` reads that config at startup. It registers the
tool with its parameter schema derived directly from the proto definition.

For the full workflow that sets up typed service contracts from scratch, see
[Keep Service Contracts Typed](/docs/libraries/typed-contracts/).

## Prerequisites

- Node.js 22+
- A Guide installation that works, with its services up (see
  [Getting Started](/docs/getting-started/))
- `@forwardimpact/libmcp` and `@forwardimpact/libtype` installed:

```sh
npm install @forwardimpact/libmcp @forwardimpact/libtype
```

- The proto method you want to expose already exists in a `.proto` file, and
  the corresponding service implements it

## Overview

You register a tool in two steps:

| Step | What you do                            | What happens                                         |
| ---- | -------------------------------------- | ---------------------------------------------------- |
| 1    | Add a tool entry to `config.json`      | Maps a tool name to a `package.service.method` path  |
| 2    | Run codegen                            | Generates metadata so libmcp can build the Zod schema |

You need no code changes. The MCP server reads `config.json` on startup. It
looks up each method's field metadata from `@forwardimpact/libtype`. It builds
a Zod schema from the proto field definitions. It then registers the tool on
the MCP server.

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
runtime. Without this step, the new method has no field metadata. The
registration then fails with a "no metadata" error.

```sh
npx fit-codegen generate --all
```

This generates `metadata.js` inside `@forwardimpact/libtype`. That file
contains the request type name and field definitions for every proto method.
The `registerToolsFromConfig` function consults this metadata to build the
tool's parameter schema automatically.

## Verify the tool is registered

Restart the MCP server, then check that the tool appears. Two ways to confirm:

- **Inspect the config** — the MCP server registers every tool declared under
  `service.mcp.tools` in `config/config.json` at startup. The keys in that
  object are exactly the tool names agents see.
- **Connect an MCP client** — call the `tools/list` JSON-RPC method against the
  MCP server while it runs and look for your new tool name in the response.

If the tool does not appear, check:

1. The `method` path in `config.json` matches the proto definition exactly
   (package, service, and method names are case-sensitive)
2. Codegen ran after the last change to the proto file
3. The `registerToolsFromConfig` call receives the gRPC client for the
   method's package (the MCP server must create a client for each package it
   uses)

## How `libmcp` derives parameters

You do not write parameter schemas. `libmcp` reads the proto message fields
from codegen metadata and builds a Zod schema for each tool. `libmcp` marks
every parameter `.optional()`, so agents can omit fields they do not need.

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

A field type with no entry in the table falls back to `z.string()`. It does not
fail the build. So an exotic scalar still produces a usable tool parameter.

### Scalar, repeated, nested, and system fields

`libmcp` treats the four field shapes differently:

- **Scalar fields** become their Zod equivalent from the table above, marked
  optional.
- **Repeated fields** accept either a single value or an array. The validator
  is `z.union([validator, z.array(validator)])`. At call time `libmcp`
  normalizes a single value into a one-element array before it constructs the
  request. So an agent may pass `"electronics"` or `["electronics", "tools"]`
  for the same field.
- **Nested message fields** (any field whose type is another proto message)
  stay out of the schema. Only flat scalar parameters reach the agent. This
  keeps tool schemas shallow. It does not expose internal envelope types.
- **System fields** are `anthropic_api_key`, `filter`, and `resource_id`.
  `libmcp` excludes them automatically. The runtime supplies them. The agent
  does not. So they never appear in the tool schema even when the proto message
  declares them.

`libmcp` normalizes a scalar field that an agent omits to an empty string
before it constructs the typed request. A repeated field that an agent omits
becomes an empty array.

### Field descriptions from proto comments

Field descriptions come from proto comments. If a proto field has a comment
above it, that comment becomes the parameter description agents see when they
inspect the tool schema:

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
falls back to its own name with underscores replaced by spaces. `max_tokens`
becomes the description "max tokens". So a missing comment leaves a parameter
under-described. It never leaves the parameter undescribed.

## Troubleshoot registration

Registration runs once at startup, when the MCP server reads `config.json` and
walks each tool entry. A misconfigured entry throws immediately. It does not
fail silently at call time. The error names the exact cause:

| Symptom at startup                                            | Cause                                                                 | Fix                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `no metadata for <method>`                                   | Codegen did not run since you added or renamed the proto method        | Run `npx fit-codegen generate --all`, then restart the server                                          |
| `no libtype class for <type>`                                | `@forwardimpact/libtype` does not export the request message type | Confirm that codegen discovers the proto file and that the package namespace matches the import |
| `no client for package "<package>"`                          | You passed no gRPC client for the method's package                     | Add the package's client to the `clients` object you hand `registerToolsFromConfig`           |
| Tool absent from `tools/list`, no error                      | The tool key is missing from `service.mcp.tools`, or the config did not reload | Confirm the key under `service.mcp.tools` and restart so the server re-reads `config.json`    |

`libmcp` splits the `method` path into `package.Service.Method`. It keys the
metadata by `package.Service`. It resolves the request class from
`@forwardimpact/libtype` by the method's request-type namespace. A mismatch in
any of the three parts surfaces as one of the errors above. So compare the
identifier in the error message against your proto file.

## Checklist

- [ ] Config entry uses the correct `package.Service.Method` path that matches
      the proto definition
- [ ] Description is a single sentence that helps agents decide when to use the
      tool
- [ ] Codegen ran after you added or changed the proto method
- [ ] The tool key appears under `service.mcp.tools` in `config/config.json`,
      and the `tools/list` response includes it while the MCP server runs
- [ ] Proto field comments describe each parameter well enough that agents do
      not need to read the proto file

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../ship-endpoint -->

</div>
