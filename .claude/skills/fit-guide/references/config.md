# Configuration

## Agent Instructions

Guide uses a single `guide-default` prompt. The MCP endpoint serves that
prompt. The prompt defines the agent's workflow (orient → query →
synthesize), tool selection guidance, and response format rules.

The prompt lives at `services/mcp/prompts/guide-default.md` in the monorepo.
MCP `prompts/get` serves it to all three surfaces.

### Service Configuration (`config/config.json`)

This file controls the service startup order for `fit-rc`:

```json
{
  "init": {
    "services": [
      { "name": "trace", "command": "..." },
      { "name": "vector", "command": "..." },
      { "name": "graph", "command": "..." },
      { "name": "pathway", "command": "..." },
      { "name": "mcp", "command": "..." }
    ]
  }
}
```

A second run of `npx fit-guide --init` against an existing project is a
same-key-same-value no-op. The merged `config/config.json` and `.env` stay
byte-stable. `--init` keeps `SERVICE_SECRET` and `MCP_TOKEN`. It does not
rotate them. To roll back hand-edits, delete the specific top-level key under
`config/config.json` (or the whole file). Then run `--init` again. It restores
the starter shape and does not disturb other products' contributions.
