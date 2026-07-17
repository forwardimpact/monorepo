# Config

Local runtime configuration. This directory is gitignored — each contributor
maintains their own `config.json`, read by `libconfig` at startup. A fresh
clone has none: create one from the structure below before running services. A
minimal `init.services` block (the services you need, in dependency order) is
enough for `fit-rc`; `service`/`product` blocks override constructor defaults.

## Audience

Internal contributors only. External users never reach `config/` — products
and services ship constructor defaults, and `npx fit-<product> init` writes
a starter `config.json` on first run.

## Layered consumers

`config.json` is the canonical source. Three layers consume it via
[`libconfig`](../libraries/libconfig/CLAUDE.md):

| Block            | Factory                     | Consumed by                                  |
| ---------------- | --------------------------- | -------------------------------------------- |
| `init`           | `createInitConfig()`        | [services/](../services/CLAUDE.md) (`fit-rc`) |
| `service.<name>` | `createServiceConfig(name)` | [services/](../services/CLAUDE.md)            |
| `product.<name>` | `createProductConfig(name)` | [products/](../products/CLAUDE.md)            |

## `config.json` structure

Three top-level sections, each consumed by a different factory:

```json
{
  "init":    { ... },
  "service": { ... },
  "product": { ... }
}
```

### `init` — service supervision

Defines which processes `fit-rc` manages.

```json
{
  "init": {
    "log_dir": "data/logs",
    "shutdown_timeout": 3000,
    "services": [
      { "name": "span",   "command": "node -e \"import('@forwardimpact/svcspan/server.js')\"" },
      { "name": "vector",  "command": "node -e \"import('@forwardimpact/svcvector/server.js')\"" },
      { "name": "graph",   "command": "node -e \"import('@forwardimpact/svcgraph/server.js')\"" },
      { "name": "map",     "command": "node -e \"import('@forwardimpact/svcmap/server.js')\"" },
      { "name": "pathway", "command": "node -e \"import('@forwardimpact/svcpathway/server.js')\"" }
    ]
  }
}
```

Each entry has a `name` and a `command` (the shell command `fit-rc` spawns).
Non-Node commands needing `.env` variables must source them explicitly.

**Declaration order matters.** `start <name>` starts the target and
everything before it (bringing up dependencies). `stop <name>` and
`restart <name>` operate on the target and everything after it (tearing
down dependents). List infrastructure (tunnels, databases) before
services that depend on them.

Optional services — add when working on those features:

```json
{ "name": "oauthtunnel", "command": "sh -c '. ./.env && exec cloudflared tunnel --url ${SERVICE_OAUTH_URL} --protocol http2'" }
{ "name": "oidctunnel",  "command": "sh -c '. ./.env && exec cloudflared tunnel --url ${SERVICE_OIDC_URL} --protocol http2'" }
{ "name": "ghtunnel",    "command": "sh -c '. ./.env && exec cloudflared tunnel --url ${SERVICE_GHBRIDGE_URL} --protocol http2'" }
{ "name": "mstunnel",    "command": "sh -c '. ./.env && exec cloudflared tunnel --url ${SERVICE_MSBRIDGE_URL} --protocol http2'" }
{ "name": "tenancy",     "command": "node -e \"import('@forwardimpact/svctenancy/server.js')\"" }
{ "name": "ghserver",    "command": "node -e \"import('@forwardimpact/svcghserver/server.js')\"" }
{ "name": "oidc",        "command": "node -e \"import('@forwardimpact/svcoidc/server.js')\"" }
{ "name": "ghuser",      "command": "node -e \"import('@forwardimpact/svcghuser/server.js')\"" }
{ "name": "oauth",       "command": "node -e \"import('@forwardimpact/svcoauth/server.js')\"" }
{ "name": "mcp",         "command": "node -e \"import('@forwardimpact/svcmcp/server.js')\"" }
{ "name": "bridge",      "command": "node -e \"import('@forwardimpact/svcbridge/server.js')\"" }
{ "name": "ghbridge",    "command": "node -e \"import('@forwardimpact/svcghbridge/server.js')\"" }
{ "name": "msbridge",    "command": "node -e \"import('@forwardimpact/svcmsbridge/server.js')\"" }
{ "name": "embedding",   "command": "node -e \"import('@forwardimpact/svcembedding/server.js')\"" }
```

This order mirrors the `.env.*.example` profiles (ports `3006`–`3015`) and
lists each service after what it depends on: `tenancy` → `ghserver` → `oidc`,
ahead of the multi-tenant `ghbridge`/`msbridge` that consume them. Only `oidc`
is public-facing (its `oidctunnel` mirrors `oauthtunnel`); `tenancy` and
`ghserver` are internal gRPC (loopback) and need no tunnel.

Oneshot services use `"type": "oneshot"` with `up`/`down` instead of `command`:

```json
{
  "name": "supabase",
  "type": "oneshot",
  "up": "sh -c '. ./.env && cd products/map && supabase start --workdir .'",
  "down": "sh -c 'cd products/map && supabase stop --workdir .'"
}
```

### `service.<name>` — service configuration

Values merge with the service's constructor defaults, then overridden by
`SERVICE_{NAME}_{KEY}` environment variables from `.env` or the shell.

For configuring the platform apps whose credentials feed these blocks and
`.env` — self-hosted (single-tenant) vs hosted (multi-tenant) — see the
per-app guides:

- [GitHub server App](../services/ghserver/github-app.md) — installation-token
  App (`ghbridge` / `ghserver`).
- [GitHub user App](../services/ghuser/github-app.md) — per-user OAuth
  (`ghuser`).
- [Azure AD app](../services/msbridge/azure-app.md) — Teams bot (`msbridge`).

### `product.<name>` — product configuration

Same merge/override pattern as services, with `PRODUCT_{NAME}_{KEY}`
environment variables.

## `.env`

Merge order: constructor defaults → `config.json` → `.env`. The `.env` file
is the persistent source of truth — non-credential keys overwrite
`process.env` unconditionally on load. Credential keys (API keys, tokens) go
to a private map; shell env wins at read time for credentials only.
