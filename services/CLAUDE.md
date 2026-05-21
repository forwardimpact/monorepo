# Services

Conventions when working under `services/`. Services are the internal
microservices that back products — they are never consumed directly by external
users. External access goes through product CLIs and the MCP server; individual
gRPC services are implementation details.

## Audience

The primary audience is **internal contributors** working on service backends.
Unlike products and libraries, services are not published to npm for direct
consumption. External users reach service functionality indirectly through
product CLIs and the MCP server.

## Mandate

When building a product feature that requires graph queries, vector search,
pathway derivation, trace collection, or MCP tool exposure, use the
corresponding service. Do not embed service-level logic in products.

This rule lives next to the other invariants in
[CONTRIBUTING.md](../CONTRIBUTING.md#read-do).

## Architecture

Most services expose a gRPC interface defined in `proto/`. Exceptions: `mcp`
exposes an HTTP/SSE interface using `@modelcontextprotocol/sdk` and delegates to
the gRPC services as a client; `msteams` exposes an HTTP interface using
`express` and `botbuilder`.

Each service follows the same structure:

- **`server.js`** — entry point. Creates config, logger, tracer, service
  instance, and server, then calls `server.start()`.
- **`index.js`** — service implementation. Exports the service class (gRPC) or
  factory function (MCP).
- **`proto/*.proto`** — gRPC service definition (all services except `mcp`).
- **`test/`** — tests, run with `bun test test/*.test.js`.

## `server.js` conventions

Every `server.js` follows the same sequence:

1. `createServiceConfig(name)` — load config.
2. `createLogger(name)` and `createTracer(name)` — set up observability.
3. Initialize domain dependencies (indexes, clients, data loaders).
4. Construct service instance, wrap in `Server`, call `start()`.

The shebang is `#!/usr/bin/env node`. The `bin` entry in `package.json` is
`fit-svc<name>` (e.g. `fit-svcgraph`).

## Configuration

Each service receives its config from `createServiceConfig(name)`, which merges
constructor defaults → `config.json` `service.<name>` block → `SERVICE_{NAME}_*`
env vars. See [`config/CLAUDE.md`](../config/CLAUDE.md) for the file format
and merge order.

## Running services

Services are managed by `fit-rc`. The service list lives in `config/config.json`
under `init.services` — see [`config/CLAUDE.md`](../config/CLAUDE.md) for the
entry format and standard/optional service lists.

```sh
just rc-start              # start all services in config.json
just rc-stop               # stop all services
just rc-status             # show service status
bunx fit-rc start <name>   # start a single service
```

For a single service during development without `fit-rc`:

```sh
node --watch services/<name>/server.js
```

## `package.json` metadata

Every service carries metadata the catalog generators consume. `description`
becomes the catalog row in [README.md](README.md). `keywords` are 4–6 lowercase
tokens; last is always `agent`. `jobs` are Little Hire entries — no `forces` or
`firedWhen` — generating the jobs block in README.md.

### Worked example: `svcgraph`

```json
{
  "description": "Simple RDF knowledge graph over gRPC for products.",
  "keywords": ["graph", "rdf", "knowledge", "grpc", "agent"],
  "jobs": [
    {
      "user": "Platform Builders",
      "goal": "Ground Agents in Context",
      "trigger": "Needing to know how two concepts relate and realizing the answer is scattered across files no one wants to join by hand.",
      "bigHire": "traverse a knowledge graph from a product without standing up my own store.",
      "littleHire": "answer relationship questions without writing join logic.",
      "competesWith": "ad-hoc joins across flat files; embedding a triple store in each product; skipping the relationship question entirely"
    }
  ]
}
```

After editing, regenerate: `bun run context:fix`.

## Proto definitions

gRPC services define their interface in `proto/<name>.proto`. After editing a
proto file, regenerate bindings:

```sh
just codegen
```

## Adding a service

Same shape as every other service here:

- `package.json` — `@forwardimpact/svc<name>`, ESM, with `description`,
  `keywords`, and `jobs`.
- `server.js` — entry point following the standard bootstrap sequence.
- `index.js` — service implementation.
- `proto/<name>.proto` — gRPC service definition (unless MCP-only).
- `test/` — `*.test.js` files.
- Add an entry to `config/config.json` so `fit-rc` can manage it.
- Run `bun run context:fix` to regenerate the catalog and jobs tables. Update
  any consuming product to import from the new service.

## No external documentation

Services have no published skills, no `--help` linking rules, and no
fully-qualified documentation URLs. They are internal to the monorepo. Each
service carries its own `README.md` for contributor context.
