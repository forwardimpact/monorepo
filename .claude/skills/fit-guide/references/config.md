# Configuration

## Agent Instructions

Guide uses a single `guide-default` prompt served by the MCP endpoint. The
prompt defines the agent's workflow (orient → query → synthesize), tool
selection guidance, and response format rules.

The prompt lives at `services/mcp/prompts/guide-default.md` in the monorepo and
is served to all three surfaces via MCP `prompts/get`.

### Service Configuration (`config/config.json`)

Controls the service startup order for `fit-rc`:

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

Re-running `npx fit-guide --init` against an existing project is a
same-key-same-value no-op — the merged `config/config.json` and `.env` are
byte-stable, and `SERVICE_SECRET` / `MCP_TOKEN` are preserved rather than
rotated. To roll back hand-edits, delete the specific top-level key under
`config/config.json` (or the whole file) and re-run; the starter shape is
restored without disturbing other products' contributions.
