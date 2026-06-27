# Guide

For general product conventions see [products/CLAUDE.md](../CLAUDE.md).

## Starter Config

`starter/config.json` is copied to `config/config.json` by `npx fit-guide init`.
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

The MCP prompt is the universal surface — it reaches every client that connects
to the MCP server (Guide CLI, eval agents, Claude Desktop, other agents).
The identity prompt is Guide-specific.

`buildPromptText()` in `services/mcp/index.js` assembles the MCP prompt from
`service.mcp`:

```text
{service.mcp.systemPrompt}          ← domain scope, grounding rules
{routing[0]} -> {ToolName}          ← one line per (tool, routing statement)
```

Tools without `routing` are registered and callable but get no routing line.
This composed text is delivered two ways:

1. **MCP server `instructions`** — auto-injected by any MCP client that
   respects the protocol (Claude Code, Claude Desktop, etc.). This is how
   eval agents and external clients receive domain and tool guidance without
   needing a product-specific identity prompt.
2. **`guide-default` MCP prompt resource** — available via `prompts/get`.
   The `fit-guide` CLI explicitly fetches this and prepends it to the
   identity prompt (`product.guide.systemPrompt`) at startup.

### What each surface sees

| Config field | fit-guide CLI | MCP clients (eval, Claude Desktop, etc.) |
|---|---|---|
| `product.guide.systemPrompt` | System prompt (top) | Not seen |
| `service.mcp.systemPrompt` + routing | Fetched via `guide-default` prompt | Auto-injected via MCP `instructions` |
| `tools.*.description` | MCP `tools/list` | MCP `tools/list` |
| `tools.*.method` | Never (internal wiring) | Never (internal wiring) |

### Adding a tool

1. Add the gRPC method to the service proto, run `just codegen`.
2. Add to `service.mcp.tools` in `starter/config.json`:

   ```json
   "NewTool": {
     "method": "package.Service.Method",
     "description": "What the agent sees in tools/list."
   }
   ```

3. Optionally add `"routing": ["Intent phrase"]` for a prompt hint.

`registerToolsFromConfig` (libmcp) auto-wires the tool — builds a Zod schema
from codegen metadata and dispatches to the gRPC client. To remove a tool,
delete its entry; it vanishes from both tool listing and prompt.

### Improving prompt behavior

The most common issue is the agent not knowing _when_ to use a tool. Because
the MCP prompt reaches every surface, behavior fixes almost always belong in
`service.mcp` — not in the identity prompt.

- **Preamble** (`service.mcp.systemPrompt`) — domain scope, grounding rules,
  and disambiguation (e.g. "skills are domain entities, not runtime features").
  Edit when the agent misidentifies the domain or answers from general
  knowledge instead of calling tools.
- **Routing** (`tools.*.routing`) — intent-to-tool mappings. Add an entry when
  the agent fails to pick the right tool for a query type.
- **Descriptions** (`tools.*.description`) — if the agent ignores a tool, the
  description may lack the right trigger words. Per-field descriptions come from
  proto comments via codegen and cannot be overridden in config.

The identity prompt (`product.guide.systemPrompt`) is Guide-specific and rarely
needs changes — it only sets who the agent is, not how it uses tools.

## Eval Workflow

`eval-guide.yml` exercises the config end-to-end. Each matrix case runs a
supervisor–agent session: the supervisor asks a question, the agent answers
using only MCP tools (it runs in a temp dir with no local files), and the
supervisor grades against `data/synthetic/story.dsl`.

When an eval fails, download the trace with `fit-trace` and check whether the
agent called the right tools. Common failure modes:

- Agent answered from general knowledge instead of calling tools.
- Agent called a tool but with wrong arguments.
- Missing routing line — agent didn't know which tool to use.
- Tool description lacked terms the agent associated with the question.
