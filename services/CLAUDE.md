# Services

Conventions when working under `services/`. The catalog and jobs live in
[README.md](README.md).

## Audience

Internal contributors only. Services are not published to npm. External
users reach them through product CLIs and the MCP server.

### Mandate

Use the corresponding service for graph queries, vector search, pathway
derivation, trace collection, or MCP tool exposure. Do not embed
service-level logic in products.

## Configuration

`createServiceConfig(name, defaults)` produces the merged config. The
merge chain:

```text
server.js defaults → config.json service.<name> → .env SERVICE_{NAME}_*
```

`libconfig` resolves `SERVICE_{NAME}_{KEY}` env vars **only for keys that
already exist** in the merged object. Undeclared `.env` keys are ignored.

### Key naming

Config keys use **`snake_case`** — `github_repo`, `callback_base_url`,
`backend_port`. This maps directly to `SERVICE_{NAME}_{KEY}` env vars.
Do not use camelCase.

### Where to declare keys

**`server.js` defaults (required).** Every config key the service reads
must appear in the `defaults` object passed to `createServiceConfig`:

```js
const config = await createServiceConfig("ghbridge", {
  github_repo: "",
  callback_base_url: "",
  app_id: "",
  app_webhook_secret: "",
});
```

This is the authoritative manifest of what the service expects.

**`.env` (values).** Supplies actual values via `SERVICE_{NAME}_{KEY}`.
See `.env.*.example` for the full list.

**`config.json` service blocks (rare).** Only when a key needs a
non-empty default that differs from `.env`.

See [`config/CLAUDE.md`](../config/CLAUDE.md) and
[`libraries/libconfig/CLAUDE.md`](../libraries/libconfig/CLAUDE.md).

## Architecture

Most services expose gRPC (`proto/`). HTTP services standardize on `libhttp`'s
`createHttpService` (Hono + `@hono/node-server`): `oauth` directly,
`ghbridge`/`msbridge` via `libbridge`, `mcp` via a raw req/res escape hatch.

Each service follows the same structure:

- **`server.js`** — entry point (see § `server.js` sequence below). Shebang
  `#!/usr/bin/env node`; bin entry `fit-svc<name>`.
- **`index.js`** — service class (gRPC) or factory (MCP).
- **`proto/*.proto`** — gRPC definition (except `mcp`).
- **`test/`** — `bun test test/*.test.js`.

### `server.js` sequence

1. `createServiceConfig(name, defaults)` — declare keys, load config.
2. `createLogger(name)` and `createTracer(name)` — observability.
3. Initialize domain dependencies (indexes, clients, data loaders).
4. Construct service instance, wrap in `Server`, call `start()`.

## `package.json` metadata

`description` becomes the catalog row in README.md. `keywords` are 4–6
lowercase tokens; last is always `agent`. `jobs` are Little Hire entries.
See `services/svcgraph/package.json` for a worked example. After editing,
regenerate: `bun run context:fix`.

## No external documentation

Services have no published skills, no `--help` linking rules, and no
fully-qualified documentation URLs. Each carries its own `README.md` for
contributor context.

## Running services

Services are managed by `fit-rc`. The service list lives in
`config/config.json` under `init.services`.

```sh
bunx fit-rc start                # start all services
bunx fit-rc stop                 # stop all services
bunx fit-rc status               # show service status
bunx fit-rc start <name>     # start everything up through <name>
bunx fit-rc restart <name>   # restart <name> and everything after it
```

## Runtime data

Runtime data lives under `data/`: logs in `data/logs/<name>/current`, bridge
discussion and origin state at `data/bridges/discussions.jsonl` and
`data/bridges/origins.jsonl` (owned by `services/bridge`).

## Proto definitions

gRPC services define their interface in `proto/<name>.proto`. After
editing a proto file, regenerate bindings with `just codegen`.

## Adding a service

- `package.json` — `@forwardimpact/svc<name>`, ESM, with `description`,
  `keywords`, `jobs`.
- `server.js` — declare every service-specific config key in `defaults`.
- `index.js` — service implementation.
- `proto/<name>.proto` — gRPC definition (unless MCP-only).
- `test/` — `*.test.js` files.
- Add entry to `config/config.json` under `init.services`.
- Run `bun run context:fix` to regenerate the catalog.
