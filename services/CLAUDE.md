# Services

Conventions when working under `services/`. The catalog and jobs live in
[README.md](README.md); this file documents the metadata, rules, and
conventions a service must follow.

## Audience

Internal contributors working on service backends. Services are not
published to npm — external users reach service functionality indirectly
through product CLIs and the MCP server.

### Mandate

When building a product feature that requires graph queries, vector search,
pathway derivation, trace collection, or MCP tool exposure, use the
corresponding service. Do not embed service-level logic in products. This
rule lives next to the other invariants in
[CONTRIBUTING.md](../CONTRIBUTING.md#read-do).

## Configuration

`createServiceConfig(name)` merges constructor defaults → `config.json`
`service.<name>` block → `.env` `SERVICE_{NAME}_*`. See
[`config/CLAUDE.md`](../config/CLAUDE.md) for the file format and merge
order, and [`libraries/libconfig/CLAUDE.md`](../libraries/libconfig/CLAUDE.md)
for the factory.

## Architecture

Most services expose a gRPC interface defined in `proto/`. Exceptions:
`mcp` exposes an HTTP/SSE interface using `@modelcontextprotocol/sdk` and
delegates to gRPC services as a client; `msbridge` and `ghbridge` expose
HTTP interfaces via `libbridge` (Hono + `@hono/node-server`) — `msbridge`
adds `botbuilder` for the Bot Framework, `ghbridge` adds `@octokit/*` for
App auth, webhook verification, and GraphQL.

Each service follows the same structure:

- **`server.js`** — entry point. Creates config, logger, tracer, service
  instance, and server, then calls `server.start()`. Shebang is
  `#!/usr/bin/env node`; the `bin` entry is `fit-svc<name>`.
- **`index.js`** — service implementation. Exports the service class
  (gRPC) or factory function (MCP).
- **`proto/*.proto`** — gRPC service definition (all services except `mcp`).
- **`test/`** — tests, run with `bun test test/*.test.js`.

### `server.js` sequence

1. `createServiceConfig(name)` — load config.
2. `createLogger(name)` and `createTracer(name)` — observability.
3. Initialize domain dependencies (indexes, clients, data loaders).
4. Construct service instance, wrap in `Server`, call `start()`.

## `package.json` metadata

Every service carries metadata the catalog generators consume. `description`
becomes the catalog row in [README.md](README.md). `keywords` are 4–6
lowercase tokens; last is always `agent`. `jobs` are Little Hire entries —
no `forces` or `firedWhen` — generating the jobs block in README.md. See
`services/svcgraph/package.json` for a worked example. After editing,
regenerate: `bun run context:fix`.

## No external documentation

Services have no published skills, no `--help` linking rules, and no
fully-qualified documentation URLs. They are internal to the monorepo. Each
service carries its own `README.md` for contributor context.

## Running services

Services are managed by `fit-rc`. The service list lives in
`config/config.json` under `init.services`.

```sh
just rc-start                # start all services
just rc-stop                 # stop all services
just rc-status               # show service status
bunx fit-rc start <name>     # start everything up through <name>
bunx fit-rc restart <name>   # restart <name> and everything after it
node --watch services/<name>/server.js   # single service without fit-rc
```

## Runtime data

All services store runtime data under `data/`. For example, `ghbridge` and
`msbridge`:

- **Logs** — `data/logs/{ghbridge,msbridge}/current`
- **Discussion index** — `data/bridges/{ghbridge,msbridge}/discussions.jsonl`
  (managed by `libindex`)

## Proto definitions

gRPC services define their interface in `proto/<name>.proto`. After editing
a proto file, regenerate bindings with `just codegen`.

## Adding a service

- `package.json` — `@forwardimpact/svc<name>`, ESM, with `description`,
  `keywords`, `jobs`.
- `server.js` — entry point following the bootstrap sequence above.
- `index.js` — service implementation.
- `proto/<name>.proto` — gRPC service definition (unless MCP-only).
- `test/` — `*.test.js` files.
- Add an entry to `config/config.json` so `fit-rc` can manage it.
- Run `bun run context:fix` to regenerate the catalog and jobs tables.
