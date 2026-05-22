# Config

Local runtime configuration. This directory is gitignored — each contributor
maintains their own `config.json`. The file is read by `libconfig` at startup.

## `config.json` structure

Three top-level sections, each consumed by a different factory in `libconfig`:

```json
{
  "init":    { ... },
  "service": { ... },
  "product": { ... }
}
```

### `init` — service supervision

Read by `createInitConfig()` → consumed by `fit-rc`. Defines which processes
the supervisor manages.

```json
{
  "init": {
    "log_dir": "data/logs",
    "shutdown_timeout": 3000,
    "services": [
      { "name": "graph",     "command": "node -e \"import('@forwardimpact/svcgraph/server.js')\"" },
      { "name": "pathway",   "command": "node -e \"import('@forwardimpact/svcpathway/server.js')\"" },
      { "name": "embedding", "command": "node -e \"import('@forwardimpact/svcembedding/server.js')\"" }
    ]
  }
}
```

Each entry has a `name` and a `command` (the shell command `fit-rc` spawns).
Non-Node commands that need `.env` variables must source them explicitly (the
supervisor does not load `.env` — Node services use `libconfig` internally).

**Declaration order matters.** `start <name>`, `stop <name>`, and
`restart <name>` operate on the named service and everything after it.
Services before the target are untouched. List infrastructure (tunnels,
databases) before the services that depend on them.

Optional entries — add when working on those features:

```json
{ "name": "mstunnel", "command": "sh -c '. ./.env && exec cloudflared tunnel --url ${SERVICE_MSBRIDGE_URL} --protocol http2'" }
{ "name": "msbridge", "command": "node -e \"import('@forwardimpact/svcmsbridge/server.js')\"" }
```

Oneshot services use `"type": "oneshot"` with `up`/`down` instead of `command`.
`fit-rc start <name>` runs the `up` command; `fit-rc stop <name>` runs `down`:

```json
{
  "name": "supabase",
  "type": "oneshot",
  "up": "sh -c '. ./.env && cd products/map && supabase start --workdir .'",
  "down": "sh -c 'cd products/map && supabase stop --workdir .'"
}
```

### `service` — service configuration

Read by `createServiceConfig(name)`. Keyed by service name. Values are merged
with the service's constructor defaults, then overridden by `SERVICE_{NAME}_{KEY}`
environment variables from `.env` or the shell.

```json
{
  "service": {
    "mcp": {
      "systemPrompt": "...",
      "tools": { ... }
    }
  }
}
```

### `product` — product configuration

Read by `createProductConfig(name)`. Same merge/override pattern as services,
with `PRODUCT_{NAME}_{KEY}` environment variables.

```json
{
  "product": {
    "guide": {
      "systemPrompt": "..."
    }
  }
}
```

## `.env`

Merge order: constructor defaults → `config.json` → `.env`. The `.env` file
is the persistent source of truth — non-credential keys overwrite
`process.env` unconditionally on load. Credential keys (API keys, tokens) go
to a private map; shell env wins at read time for credentials only.

See [libraries/libconfig/CLAUDE.md](../libraries/libconfig/CLAUDE.md) for the
implementation contract.
