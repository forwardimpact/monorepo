---
title: Codegen Internals
description: "Code generation pipeline — proto discovery, type compilation, service client generation, and installation-specific design."
---

## Why Generated Code is Installation-Specific

Generated gRPC code is never bundled in npm packages. Each installation runs
`fit-codegen` to produce code tailored to its own set of services.

This design exists because external installations can define **custom proto
files** for custom gRPC services. Guide dynamically picks up these services
through the service management system (`fit-rc`) and the tool configuration in
`config/config.json`. A custom proto file produces a custom service client that
Guide can use at runtime — without any changes to the product code itself.

If generated code were bundled, it would only reflect the standard services and
miss any custom services the installation defines.

---

## Proto Distribution Model

Proto files are co-located with the packages that own them. Each package
includes a `proto/` subdirectory published in its npm tarball.

| Package                    | Proto files                      | Role                |
| -------------------------- | -------------------------------- | ------------------- |
| `@forwardimpact/guide`     | `common.proto`, `resource.proto` | Shared Guide types  |
| `@forwardimpact/svcagent`  | `agent.proto`                    | Agent orchestration |
| `@forwardimpact/svcgraph`  | `graph.proto`                    | Graph queries       |
| `@forwardimpact/svcllm`    | `llm.proto`                      | LLM inference       |
| `@forwardimpact/svcmemory` | `memory.proto`                   | Conversation memory |
| `@forwardimpact/svctool`   | `tool.proto`                     | Tool execution      |
| `@forwardimpact/svctrace`  | `trace.proto`                    | Distributed tracing |
| `@forwardimpact/svcvector` | `vector.proto`                   | Vector search       |
| User project               | `proto/*.proto`                  | Custom services     |

`fit-codegen` auto-discovers `proto/` subdirectories from all installed
`@forwardimpact/*` packages in `node_modules/`, plus the project's own `proto/`
directory. All discovered directories are used as include paths so cross-file
imports (e.g. `import "common.proto"`) resolve correctly.

---

## Pipeline

```
Proto discovery → Type compilation → Service generation → Definition generation → Symlink
```

### 1. Proto discovery

`CodegenBase.collectProtoFiles()` scans all discovered proto directories,
deduplicates by filename, and ensures `common.proto` is ordered first (other
protos import it).

### 2. Type compilation

`CodegenTypes` compiles all proto files into a single `generated/types/types.js`
using the `pbjs` compiler from `protobufjs-cli`. Proto source files are also
copied to `generated/proto/` for runtime loading.

### 3. Service and client generation

`CodegenServices` generates gRPC service base classes and client stubs for each
proto file that defines a service. Output structure:

```
generated/services/
  {service}/
    service.js    — Base class for the server implementation
    client.js     — Client stub for calling the service
  exports.js      — Aggregates all services and clients
```

### 4. Definition generation

`CodegenDefinitions` generates pre-compiled gRPC service definitions used by
`librpc` at runtime for serialization and deserialization:

```
generated/definitions/
  {service}.js    — Pre-compiled service definition
  exports.js      — Aggregates all definitions
```

### 5. Symlink

`Finder.createPackageSymlinks()` creates symlinks from `librpc/generated/` and
`libtype/generated/` to the central `generated/` directory, so relative imports
in those packages resolve correctly.

---

## Module Index

| Module               | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `src/base.js`        | Shared utilities: proto parsing, template loading, rendering |
| `src/types.js`       | Proto-to-JavaScript type compilation via `pbjs`              |
| `src/services.js`    | Service base class and client stub generation                |
| `src/definitions.js` | Pre-compiled gRPC definition generation                      |
| `bin/fit-codegen.js` | CLI entry point: discovery, orchestration, bundling          |
| `templates/`         | Mustache templates for generated artifacts                   |

---

## How librpc Consumes Generated Code

`librpc` imports generated code via relative paths:

- `librpc/src/index.js` imports `./generated/services/exports.js` (service bases
  and clients)
- `librpc/src/base.js` imports `./generated/definitions/exports.js` (service
  definitions for gRPC registration)

These paths resolve through the per-package symlink that `fit-codegen` creates
at `libraries/librpc/src/generated` (and `libraries/libtype/src/generated`)
pointing at the monorepo-root `generated/` directory. The symlinks live under
`src/` so they travel with the importing files and the package root stays free
of generated code.

---

## Adding Custom Services

External users follow this workflow to add a custom gRPC service:

1. **Define the proto** — create `proto/custom.proto` in the project root with a
   service definition
2. **Run codegen** — `npx fit-codegen --all` discovers the new proto
   automatically
3. **Implement the server** — create a service using the generated base class
4. **Register the tool** — add a tool endpoint mapping in `config/config.json`
   and a tool descriptor in `config/tools.yml`
5. **Use the client** — `createClient("custom")` from `librpc` returns a
   configured client

Guide's agent will automatically see the new tool through the dynamic tool
configuration.

---

## Internal vs External Workflow

| Step         | Internal (monorepo)                          | External (npm)                                            |
| ------------ | -------------------------------------------- | --------------------------------------------------------- |
| Install      | `bun install` (workspaces)                   | `npm install @forwardimpact/guide`                        |
| Proto source | `services/*/proto/`, `products/guide/proto/` | `node_modules/@forwardimpact/*/proto/` + project `proto/` |
| Run codegen  | `just codegen` or `bunx fit-codegen --all`   | `npx fit-codegen --all`                                   |
| Output       | `generated/` at monorepo root                | `generated/` at project root                              |

---

## Related Documentation

- [Guide Internals](/docs/internals/guide/) — Service stack that consumes
  generated code
- [Operations Reference](/docs/internals/operations/) — Service management and
  environment setup
