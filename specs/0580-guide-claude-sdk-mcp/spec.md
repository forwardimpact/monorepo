# Spec 0580 — Guide on Claude Agent SDK and MCP

## Problem

Guide today runs on a bespoke agent harness wired to an OpenAI-compatible LLM
endpoint, with GitHub Models as the effective default. This architecture made
sense historically — GitHub Models was the LLM provider most engineers already
had at work — but it now caps Guide's effectiveness and its reach at the same
time.

Two compounding ceilings:

1. **Model ceiling.** The GitHub Models unlimited tier exposes older-generation
   models — GPT-4.1 and GPT-4o — a full generation behind current frontier
   models (e.g. Claude Opus 4.7). The gap shows up most on the workloads Guide
   actually runs: multi-step tool-use against the knowledge graph, long-context
   synthesis across retrieved documents, and following nuanced agent
   instructions (planner → researcher → editor) without dropping steps. Guide's
   answer quality is bounded by its model, and today that bound sits below what
   users' own employer-provided Anthropic access can reach. Establishing
   frontier-model quality as the baseline is the central product bet of this
   spec; the parity check in Success Criterion 8 is the empirical test.

2. **Surface ceiling.** Guide is only reachable through the `fit-guide` CLI. An
   increasing share of engineers now work inside Anthropic-native tooling —
   Claude Code for day-to-day engineering work, Claude Chat for research and
   learning — with model access provided through Claude Enterprise or AWS
   Bedrock. These users cannot bring Guide into their working environment
   without leaving it for a separate CLI.

### Evidence

- **Harness entry point** — `products/guide/bin/fit-guide.js` is the sole
  supported interface.
- **Bespoke agent loop** — `libraries/libagent/src/mind.js`,
  `libraries/libagent/src/hands.js`, and `services/agent/` implement a custom
  planner → researcher → editor loop with manual tool dispatch and handoff
  handling. None of it is standardised.
- **OpenAI-compatible provider boundary** — `libraries/libllm/src/index.js`
  calls `{baseUrl}/chat/completions`, and `services/llm/` is a thin proxy. The
  abstraction exists to accommodate OpenAI-family providers.
- **Tool schemas emitted in OpenAI function-calling shape** —
  `MemoryWindow.build()` in `libraries/libmemory/src/index.js` wraps tools as
  OpenAI-style function definitions; the Tool service (`services/tool/index.js`)
  routes calls through a local endpoint map
  (`products/guide/starter/config.json`) rather than any standard protocol.
- **Duplicated infrastructure** — memory windowing, token budgeting, tool-call
  dispatch, and agent handoffs are all implemented in-house in `libagent` and
  `libmemory`. The Claude Agent SDK now provides canonical implementations of
  the same concerns.

### Why this matters

Guide differentiates on the depth of its framework knowledge, not on its
harness. Every line of bespoke harness code is effort not spent on the thing
that matters — the framework data, the tools that query it, and the instructions
that guide the agent. Meeting users where they already work (Claude Code, Claude
Chat) is far higher leverage than maintaining a generic provider abstraction
that optimises for a ceiling we want to raise.

## Proposal

Pivot Guide to an Anthropic-first, frontier-first implementation in two linked
moves:

1. **Migrate the agent harness to the Claude Agent SDK.** Replace the bespoke
   orchestration loop (agent service, memory windowing, tool dispatch, handoffs)
   with the SDK's equivalents. The SDK becomes the agent runtime; Guide's
   remaining job is to supply domain knowledge, tools, and instructions.

2. **Expose Guide's knowledge services as MCP endpoints.** Retain the
   domain-bearing services — graph, vector, pathway, and web — and make them
   reachable over the Model Context Protocol. Conversation history moves into
   the Claude Agent SDK's built-in session management; the bespoke `memory`
   service is deleted. The bespoke `tool` service is deleted and replaced by an
   MCP gateway that routes tool calls from any MCP-speaking client to these
   backends.

The combined effect: Guide's value (framework data, curated tools, agent
instructions) is decoupled from a specific harness and becomes reachable from
any Claude-native surface.

### Clean break, zero tech debt

This is a clean-break implementation. Every component listed as retired below is
**deleted in full from the monorepo** in the same change that introduces its
replacement. No compatibility shims, no parallel code paths, no adapters
bridging the old and new harnesses, no deprecation window. The explicit goal is
to leave the codebase with zero tech debt from the prior architecture. Users on
the old OpenAI-compatible path upgrade in a single step; the new CLI does not
attempt to read or honour prior `LLM_TOKEN`-shaped configuration.

### Three equally capable interfaces

With the pivot complete, a running Guide stack must be usable through three
equivalent surfaces:

- **`fit-guide` CLI** — Reference implementation built on the Claude Agent SDK.
  Connects to the local Guide MCP endpoint, loads the agent instructions, and
  runs a conversation.
- **Claude Code** — Connects to Guide's MCP endpoint as an MCP server. Tools and
  instructions are delivered via MCP; the harness is Claude Code's.
- **Claude Chat** — Connects via a Claude Connector backed by Guide's MCP
  endpoint. Same tools, same instructions, same answers.

"Equally capable" means: the same agent instructions, the same tools, the same
knowledge, and the same answers on the same inputs. Differences are limited to
the chrome of each surface (how the conversation is displayed, how files are
attached), not to what Guide can do.

## Scope

### Included

- **Harness migration** — `fit-guide` CLI rebuilt on the Claude Agent SDK.
  `libraries/libagent`, `services/agent`, `libraries/libmemory`, and
  `services/memory` are deleted from the monorepo in full. Conversation
  windowing, token budgeting, tool-call-integrity preservation, and
  per-conversation persistence are all supplied by the SDK — automatic
  compaction and context editing for windowing, session JSONL + `resume` for
  persistence.
- **LLM integration** — LLM calls handled by the Claude Agent SDK directly.
  Anthropic API is the baseline provider that must work at acceptance; AWS
  Bedrock is an additional supported target and is a design decision (see Open
  Questions). `libraries/libllm` and `services/llm` are deleted from the
  monorepo in full.
- **Anthropic credential lifecycle** — The CLI provides an OAuth PKCE login flow
  (`fit-guide login`) analogous to `claude login`, so users with Anthropic
  accounts can authenticate without managing API keys manually.
  `ANTHROPIC_API_KEY` remains supported as an env-var alternative. Credential
  resolution is transparently managed by `libconfig` — callers see a single
  method that returns a usable token regardless of source (env-var or OAuth).
  The OAuth token store, refresh-on-read, and logout are part of this scope.
- **Retained backend services** — `graph`, `vector`, `pathway`, and `web`
  continue to exist as services; their role in the new architecture (direct gRPC
  backend or MCP-exposed) is settled in design. `trace` is retained for
  observability unless design justifies otherwise.
- **MCP exposure** — Every tool currently listed in
  `products/guide/starter/tools.yml` is either exposed as an MCP tool on the new
  endpoint, or explicitly retired. Retired tools must be listed in the design
  with a rationale; any tool neither exposed nor listed-as-retired is a
  regression.
- **Tool service rewrite** — The current `services/tool` bespoke gRPC dispatcher
  is deleted in full. An MCP gateway — the sole tool-routing layer going forward
  — exposes Guide's backend services as MCP tools and resources. The
  `starter/config.json` tool-endpoint map is deleted; MCP tool definitions take
  its place.
- **Shared agent instructions** — The planner/researcher/editor instructions
  currently in `products/guide/starter/agents/*.agent.md` are delivered to all
  three surfaces such that every surface operates under the same instructions.
  The delivery mechanism is a design decision.
- **Authentication** — Two distinct auth concerns: (a) **LLM auth** — the CLI
  authenticates with the Anthropic API via OAuth or `ANTHROPIC_API_KEY`, managed
  through `libconfig`; Claude Code and Claude Chat use their host credentials.
  (b) **MCP auth** — each of the three surfaces presents a bearer token to the
  MCP endpoint; unauthenticated requests are rejected. Both concerns have a
  documented auth path per surface.
- **Documentation** — The published `fit-guide` skill
  (`.claude/skills/fit-guide/`), the Guide overview (`website/guide/`), the
  internals page (`website/docs/internals/guide/`), and getting-started flows
  are updated to the Anthropic-first architecture and describe the three
  interfaces.

### Excluded

- **Framework data model** — Disciplines, levels, tracks, skills, behaviours,
  capabilities, and their YAML shapes are unchanged.
- **Knowledge pipeline** — HTML extraction, RDF generation, and embedding
  pipelines continue as-is. Only the serving surface (MCP) changes.
- **Other FIT products** — Pathway, Basecamp, Map, Landmark, Summit are
  untouched. Their own harnesses and distribution are separate.
- **OpenAI-compatible fallback** — No effort is spent preserving or
  re-implementing an OpenAI-compatible path. Guide becomes Anthropic-first;
  organisations without Anthropic access are out of scope for this spec.
- **New tools or new domain behaviour** — The pivot preserves the existing tool
  set. Adding tools, changing the agent pipeline (e.g. new specialist agents),
  or extending the knowledge graph are separate specs.
- **Cross-surface shared conversation history** — The SDK persists sessions
  per-machine per-cwd. Sharing a single conversation across the CLI, Claude
  Code, and Claude Chat is out of scope; each surface maintains its own history.
  A follow-up spec can revisit this backed by Anthropic's memory tool if a need
  materialises.

## Success Criteria

1. **SDK-based CLI.** `fit-guide` CLI launches a conversation using the Claude
   Agent SDK. `libraries/libagent`, `libraries/libmemory`, `services/agent`, and
   `services/memory` no longer exist in the monorepo — neither as source
   directories, package.json workspace entries, nor as imports from any
   remaining code.
2. **Anthropic-first LLM path.** `libraries/libllm` and `services/llm` no longer
   exist in the monorepo. No remaining Guide code path calls an
   OpenAI-compatible `/chat/completions` endpoint, reads an `LLM_TOKEN`
   environment variable, or imports the removed packages.
3. **MCP endpoint — tool coverage.** A running Guide stack exposes an MCP
   endpoint. Listing tools on the endpoint with a standard MCP client returns a
   set such that for every tool in `products/guide/starter/tools.yml` at the
   time this spec was written, either (a) the same tool is present on the
   endpoint, or (b) the tool is recorded as retired in `design-a.md` with a
   rationale. A tool that is neither present nor recorded-as-retired is a failed
   criterion.
4. **Tool service replaced.** The pre-pivot `services/tool` bespoke gRPC
   dispatcher no longer exists in the monorepo, and `starter/config.json`'s
   tool-endpoint map is removed. The MCP gateway is the sole tool-routing layer;
   no code imports or invokes the removed dispatcher.
5. **CLI via MCP.** `fit-guide` CLI answers framework questions correctly using
   only the MCP endpoint for tools (no direct gRPC-to-tool-service path).
6. **Claude Code via MCP.** Registering Guide's MCP endpoint with Claude Code
   exposes the Guide tools in its tool picker, and Claude Code can answer the
   same framework questions `fit-guide` can, using those tools.
7. **Claude Chat via Connector.** A Claude Chat Connector configured against
   Guide's MCP endpoint answers the same framework questions using the same
   tools.
8. **Parity check.** The design defines a parity rubric consisting of (a) a
   fixed fixture set of at least 10 representative Guide questions and (b) a
   pass/fail judgement for each answer covering answer substance, tool-call set
   invoked, and factual grounding in retrieved data. At acceptance, every
   fixture passes the rubric on all three surfaces when run against the same
   Guide stack. Parity is the load-bearing quality gate for the pivot; a looser
   check does not satisfy this criterion.
9. **Documentation currency.** The published `fit-guide` skill, the Guide
   overview, and the internals documentation describe the Anthropic-first
   architecture and the three interfaces. No published page still describes
   Guide as OpenAI-compatible or CLI-only.
10. **Authentication — per surface.** Each of the three surfaces (CLI, Claude
    Code, Claude Chat Connector) has a documented auth path for both LLM access
    and MCP endpoint access. `fit-guide login` completes an OAuth PKCE flow and
    persists a usable credential; `fit-guide logout` clears it.
    `ANTHROPIC_API_KEY` works as an alternative without login. An
    unauthenticated request to the MCP endpoint is rejected on every surface.
11. **Status command still works.** The `fit-guide status` command (spec 0370)
    reports readiness accurately under the new service composition, including a
    health signal for the MCP endpoint.
12. **Zero residue.** No compatibility shim, adapter, or fallback bridging the
    old harness to the new one exists in the monorepo after the pivot. A grep
    for the names of the deleted packages (`libagent`, `libmemory`, `libllm`,
    the deleted service directories) returns no matches outside the spec /
    design / plan artefacts and the commit history.
13. **Quality gates.** `bun run check` and `bun run test` pass with no
    regressions.

## Open questions

Each item below is a decision the design must make visibly; none affect whether
the spec should advance.

- **MCP gateway shape** (gates SC3, SC10) — One unified MCP server that fans out
  to graph, vector, and pathway, or one MCP server per backend with clients
  connecting to multiple. Affects deployment, auth, and discoverability.
- **Agent pipeline representation** — Planner → researcher → editor can map to
  SDK subagents, MCP prompts, a single agent with structured instructions, or a
  combination.
- **Additional provider targets beyond Anthropic API** — Anthropic API is
  required at acceptance (see Included). Whether AWS Bedrock is a supported
  target at acceptance, and how credentials and selection are exposed, is open.
- **Authentication mechanism for MCP** (gates SC10) — Bearer token, mutual TLS,
  or per-surface differences for MCP endpoint access. LLM auth is settled: OAuth
  PKCE or `ANTHROPIC_API_KEY` via `libconfig`.
- **First-run experience for existing CLI users** — The upgrade is a clean
  break: there is no deprecation window and the new CLI does not read prior
  `LLM_TOKEN` configuration. Design decides how the new CLI communicates the
  required reconfiguration on first run (error text, setup prompt, pointer to
  updated docs) so the break is obvious and painless rather than silent.
