# Config

Local runtime configuration. Git ignores this directory. Each contributor
maintains their own `config.json`. `libconfig` reads it at startup. A fresh
clone has none. Create one from the structure below. A minimal `init.services`
block (dependency order) is enough for `fit-rc`. The `service` and `product`
blocks override the constructor defaults.

## Audience

Internal contributors only. External users never reach `config/`. Products
and services ship constructor defaults. `npx fit-<product> init` writes a
starter `config.json` on first run.

## Layered consumers

`config.json` is the canonical source. Three layers consume it through
[`libconfig`](../libraries/libconfig/CLAUDE.md):

| Block            | Factory                     | Consumed by                                  |
| ---------------- | --------------------------- | -------------------------------------------- |
| `init`           | `createInitConfig()`        | [services/](../services/CLAUDE.md) (`fit-rc`) |
| `service.<name>` | `createServiceConfig(name)` | [services/](../services/CLAUDE.md)            |
| `product.<name>` | `createProductConfig(name)` | [products/](../products/CLAUDE.md)            |

## `config.json` structure

The file has three top-level sections. A different factory consumes each one:

```json
{
  "init":    { ... },
  "service": { ... },
  "product": { ... }
}
```

### `init` — service supervision

The `init` block defines which processes `fit-rc` manages.

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

Each entry has a `name` and a `command` (the shell command `fit-rc`
spawns). A non-Node command that needs `.env` must source it explicitly.

**Declaration order matters.** `start <name>` starts the target and
everything before it. This brings up the dependencies. `stop <name>` and
`restart <name>` operate on the target and everything after it. This tears
down the dependents. List infrastructure (tunnels, databases) before the
services that depend on them.

Optional services. Add them when you work on those features:

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

This order mirrors the `.env.*.example` profiles (ports `3006`–`3015`). It lists
each service after what it depends on. The chain is `tenancy` → `ghserver` →
`oidc`, ahead of the multi-tenant `ghbridge` and `msbridge` that consume them.
Only `oidc` is public-facing. Its `oidctunnel` mirrors `oauthtunnel`. `tenancy`
and `ghserver` are internal gRPC (loopback). They need no tunnel.

Oneshots are optional. `just supabase-up` bypasses them. They use `up`/`down`:

```json
{ "name": "supabase", "type": "oneshot",
  "up": "sh -c '. ./.env && cd products/map && supabase start --workdir .'",
  "down": "sh -c 'cd products/map && supabase stop --workdir .'" }
```

### `service.<name>` — service configuration

Values merge with the service's constructor defaults. `SERVICE_{NAME}_{KEY}`
environment variables from `.env` or the shell then override them.

Platform apps supply credentials for these blocks and `.env`. See the per-app
guides for self-hosted (single-tenant) and hosted (multi-tenant) apps:

- [GitHub server App](../services/ghserver/github-app.md) — installation-token
  App (`ghbridge` / `ghserver`).
- [GitHub user App](../services/ghuser/github-app.md) — per-user OAuth
  (`ghuser`).
- [Azure AD app](../services/msbridge/azure-app.md) — Teams bot (`msbridge`).

### `product.<name>` — product configuration

Products use the same merge and override pattern as services, with
`PRODUCT_{NAME}_{KEY}` environment variables. Guide's `service.mcp` block and
`product.guide.systemPrompt` copy from `products/guide/starter/config.json`,
the single source of truth
([products/guide/CLAUDE.md](../products/guide/CLAUDE.md)). Without `tools`,
the MCP server warns and exposes nothing.

## `.env`

Merge order: constructor defaults → `config.json` → `.env`. The `.env` file
is the persistent source of truth. Non-credential keys overwrite
`process.env` unconditionally on load. Credential keys (API keys, tokens) go
to a private map. For credentials only, the shell env wins at read time.
