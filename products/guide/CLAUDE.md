# Guide

For general product conventions see [products/CLAUDE.md](../CLAUDE.md).

## Starter Config

`npx fit-guide init` copies `starter/config.json` to `config/config.json`.
It is the single source of truth for what the Guide agent sees.

```text
starter/config.json
├── init                # Service supervisor (which processes to start)
├── product.guide
│   └── systemPrompt    # Identity — "You are Guide…"
└── service.mcp
    ├── systemPrompt    # Domain scope, grounding rules, disambiguation
    └── tools.<Name>
        ├── method      # gRPC route, e.g. "graph.Graph.QueryByPattern"
        ├── description # Shown in MCP tools/list — agent picks tools by this
        └── routing     # Optional intent phrases for prompt routing lines
```

### How config reaches the agent

The MCP prompt is the universal surface. It reaches every client that connects
to the MCP server (Guide CLI, eval agents, Claude Desktop, other agents).
The identity prompt is Guide-specific.

`buildPromptText()` in `services/mcp/index.js` assembles the MCP prompt from
`service.mcp`:

```text
{service.mcp.systemPrompt}          ← domain scope, grounding rules
{routing[0]} -> {ToolName}          ← one line per (tool, routing statement)
```

The server still registers tools without `routing`. They stay callable but get
no routing line. The MCP server delivers this composed text two ways:

1. **MCP server `instructions`** — any MCP client that respects the protocol
   (Claude Code, Claude Desktop, etc.) injects these automatically. Eval
   agents and external clients get domain and tool guidance this way, without
   a product-specific identity prompt.
2. **`guide-default` MCP prompt resource** — available through `prompts/get`.
   The `fit-guide` CLI explicitly fetches this and prepends it to the
   identity prompt (`product.guide.systemPrompt`) at startup.

### What each surface sees

| Config field | fit-guide CLI | MCP clients (eval, Claude Desktop, etc.) |
|---|---|---|
| `product.guide.systemPrompt` | System prompt (top) | Not seen |
| `service.mcp.systemPrompt` + routing | Fetched through `guide-default` prompt | Auto-injected through MCP `instructions` |
| `tools.*.description` | MCP `tools/list` | MCP `tools/list` |
| `tools.*.method` | Never (internal wiring) | Never (internal wiring) |

### Adding a tool

1. Add the gRPC method to the service proto. Run `just codegen`.
2. Add to `service.mcp.tools` in `starter/config.json`:

   ```json
   "NewTool": {
     "method": "package.Service.Method",
     "description": "What the agent sees in tools/list."
   }
   ```

3. Optionally add `"routing": ["Intent phrase"]` for a prompt hint.

`registerToolsFromConfig` (libmcp) auto-wires the tool. It builds a Zod schema
from codegen metadata. It then dispatches to the gRPC client. To remove a tool,
delete its entry. The tool then vanishes from both the tool list and the
prompt.

### Improving prompt behavior

The most common issue is that the agent does not know _when_ to use a tool. The
MCP prompt reaches every surface. So behavior fixes almost always belong in
`service.mcp`. They do not belong in the identity prompt.

- **Preamble** (`service.mcp.systemPrompt`) — domain scope, grounding rules,
  and disambiguation (e.g. "skills are domain entities, not runtime features").
  Edit it when the agent misidentifies the domain, or when the agent answers
  from general knowledge and does not call tools.
- **Routing** (`tools.*.routing`) — intent-to-tool mappings. Add an entry when
  the agent fails to pick the right tool for a query type.
- **Descriptions** (`tools.*.description`) — if the agent ignores a tool, the
  description may lack the right trigger words. Per-field descriptions come from
  proto comments through codegen. You cannot override them in config.

The identity prompt (`product.guide.systemPrompt`) is Guide-specific and rarely
needs changes. It only sets who the agent is. It does not set how the agent
uses tools.

## Eval Workflow

`eval-guide.yml` exercises the config end-to-end. Each matrix case runs a
supervisor–agent session. The supervisor asks a question. The agent answers
with MCP tools only. It runs in a temp dir with no local files. The
supervisor then grades the answer against `data/synthetic/story.dsl`.

When an eval fails, download the trace with `gemba-trace` and check whether the
agent called the right tools. Common failure modes:

- Agent answered from general knowledge and did not call tools.
- Agent called a tool but with wrong arguments.
- No routing line, so the agent didn't know which tool to use.
- Tool description lacked terms the agent associated with the question.
