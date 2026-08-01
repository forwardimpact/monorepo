# Services

Conventions that apply when you work under `services/`. The catalog and jobs
live in [README.md](README.md).

## Audience

Internal contributors only. The repository does not publish services to npm.
External users reach them through product CLIs and the MCP server.

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
already exist** in the merged object. It ignores undeclared `.env` keys.

### Key naming

Config keys use **`snake_case`**, for example `github_repo`,
`callback_base_url`, `backend_port`. This maps directly to
`SERVICE_{NAME}_{KEY}` env vars. Do not use camelCase.

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

**`.env` (values).** Supplies actual values through `SERVICE_{NAME}_{KEY}`.
See `.env.*.example` for the full list.

**`config.json` service blocks (rare).** Only when a key needs a
non-empty default that differs from `.env`.

See [`config/CLAUDE.md`](../config/CLAUDE.md) and
[`libraries/libconfig/CLAUDE.md`](../libraries/libconfig/CLAUDE.md).

## Architecture

Most services expose gRPC (`proto/`). HTTP services standardize on `libhttp`'s
`createHttpService` (Hono + `@hono/node-server`). `oauth` uses it directly.
`ghbridge`/`msbridge` use it through `libbridge`. `mcp` uses it through a raw
req/res escape hatch.

Each service follows the same structure:

- **`server.js`** — entry point (see § `server.js` sequence below). Shebang
  `#!/usr/bin/env node`. Bin entry `fit-svc<name>`.
- **`index.js`** — service class (gRPC) or factory (MCP).
- **`proto/*.proto`** — gRPC definition (except `mcp`).
- **`test/`** — `bun test test/*.test.js`.

### `server.js` sequence

1. `createServiceConfig(name, defaults)` — declare keys and load config.
2. `createLogger(name)` and `createTracer(name)` — observability.
3. Initialize domain dependencies (indexes, clients, data loaders).
4. Construct the service instance. Wrap it in `Server`. Call `start()`.

## `package.json` metadata

`description` becomes the catalog row in README.md. `keywords` are 4–6
lowercase tokens. The last one is always `agent`. `jobs` are Little Hire
entries. See `services/svcgraph/package.json` for a worked example. After you
edit, run `bun run context:fix` to regenerate.

## No external documentation

Services have no published skills, no rules for `--help` links, and no
fully-qualified documentation URLs. Each carries its own `README.md` for
contributor context.

## Running services

`fit-rc` runs the services in `config/config.json` `init.services`. Git ignores
that file, so create it first from the `init` structure in
[`config/CLAUDE.md`](../config/CLAUDE.md). Use dependency order. `start <name>`
brings up everything before it. Use the `just` wrappers (`rc-start`, `rc-stop`,
`rc-status`, `rc-restart`). They load `.env` (`set dotenv-load`), which services
need for `SERVICE_*` config and auth. A bare `bunx fit-rc …` needs `.env`
sourced first (`set -a; source .env; set +a`) or gRPC auth fails and calls hang.

`fit-rc` spawns each service under Node (`node -e "import(...)"`). Do not
hand-launch a gRPC `server.js` under Bun (`bun run …`). Bun binds the port but
never dispatches RPCs, so clients hang. Logs: `data/logs/<name>/current`.

## Runtime data

Runtime data lives under `data/`. Bridge discussion and origin state lives at
`data/bridges/{discussions,origins}.jsonl`, which `services/bridge` owns.

## Proto definitions

gRPC services define their interface in `proto/<name>.proto`. After you
edit a proto file, regenerate the bindings with `just codegen`.

## Adding a service

- `package.json` — `@forwardimpact/svc<name>`, ESM, with `description`,
  `keywords`, `jobs`.
- `server.js` — declare every service-specific config key in `defaults`.
- `index.js` — service implementation.
- `proto/<name>.proto` — gRPC definition (unless MCP-only).
- `test/` — `*.test.js` files.
- Add an entry to `config/config.json` under `init.services`.
- Run `bun run context:fix` to regenerate the catalog.
