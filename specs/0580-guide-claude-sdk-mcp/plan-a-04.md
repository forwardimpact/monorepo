# Part 4 — Documentation and parity rubric

## Scope

Update all published documentation to reflect the Anthropic-first architecture,
create the parity rubric (SC8) with 10 fixture questions, and run the
zero-residue check (SC12).

## Prerequisites

Parts 1–3 complete (code is in its final state).

## Steps

### Step 1 — Update published skill

**Modified:** `.claude/skills/fit-guide/SKILL.md`

Replace the entire architecture section. Key changes:

| Section             | Before                                                                    | After                                                                                    |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Agent orchestration | Planner → researcher → editor pipeline                                    | Single-agent Claude Agent SDK with `guide-default` prompt                                |
| Service stack       | 9 services (trace, vector, graph, pathway, llm, memory, tool, agent, web) | 6 services (trace, vector, graph, pathway, mcp, web)                                     |
| Tool list           | 14 tools including 4 agent-orchestration tools                            | 10 tools (4 retired: `list_sub_agents`, `run_sub_agent`, `list_handoffs`, `run_handoff`) |
| Surfaces            | CLI only                                                                  | CLI, Claude Code, Claude Chat                                                            |
| Credentials         | `LLM_TOKEN` for OpenAI-compatible endpoint                                | `ANTHROPIC_API_KEY` or OAuth via `fit-guide login`                                       |
| Memory              | Custom windowing in libmemory                                             | SDK compaction + JSONL sessions                                                          |

Add sections for:

- How to connect via Claude Code (MCP server config)
- How to connect via Claude Chat (Connector setup)
- MCP endpoint configuration (`SERVICE_MCP_URL`, `MCP_TOKEN`)

Remove references to:

- `*.agent.md` config files
- `config.json` tool endpoint map
- `LLM_TOKEN`, `LLM_BASE_URL`
- OpenAI-compatible providers
- `libagent`, `libmemory`, `libllm`
- Agent handoffs and sub-agent delegation

### Step 2 — Update Guide overview

**Modified:** `website/guide/index.md`

Add the three-surface value proposition. The page already describes what Guide
does (framework reasoning) — add that it is now accessible from Claude Code and
Claude Chat, not just the CLI. Keep the hero and product positioning unchanged.

### Step 3 — Rewrite Guide internals

**Modified:** `website/docs/internals/guide/index.md`

Full rewrite of the architecture section:

1. **Architecture diagram** — MCP server + SDK (replace the planner/researcher/
   editor diagram).
2. **Service table** — 6 services with ports: | Service | Port | Protocol |
   |---------|------|----------| | trace | 3008 | gRPC | | vector | 3005 | gRPC
   | | graph | 3006 | gRPC | | pathway | 3010 | gRPC | | mcp | 3009 | HTTP+SSE |
   | web | 3001 | HTTP |
3. **Tool table** — 10 tools with backend mapping.
4. **Authentication** — per-surface bearer-token model.
5. **Agent instructions** — single `guide-default` prompt served via MCP.
6. **Session persistence** — SDK JSONL sessions, `resume` command.

Remove: planner/researcher/editor pipeline, 9-service table, agent config
format, tool descriptor YAML format, bespoke memory windowing.

### Step 4 — Update getting-started pages

**Modified:** `website/docs/getting-started/engineers/index.md` (or equivalent)

Update the Guide setup flow for engineers:

1. `npm install @forwardimpact/guide`
2. `npx fit-guide init`
3. `npx fit-guide login` (or set `ANTHROPIC_API_KEY`)
4. Start services, then `npx fit-guide`

Remove references to `LLM_TOKEN`, GitHub Models, OpenAI-compatible setup.

**Modified:** `website/docs/getting-started/contributors/index.md` (or
equivalent)

Update the dev setup flow:

1. `bun install`
2. `just quickstart` (includes codegen)
3. Configure `.env` with `ANTHROPIC_API_KEY` and `MCP_TOKEN`
4. `just services` then `bunx fit-guide`

### Step 5 — Update structural documentation

The zero-residue check (Step 7) will fail unless these files are updated to
remove references to deleted packages. Each file has confirmed matches:

**Modified:** `CONTRIBUTING.md`

- Line 10: remove `LLM_TOKEN and LLM_BASE_URL` reference (or update to
  `ANTHROPIC_API_KEY`)
- Line 88 (approx): update services directory listing — remove `agent/`, `llm/`,
  `memory/`, `tool/`; add `mcp/`
- Line 171: update release example — replace `services/agent → svcagent` with a
  retained service example

**Modified:** `website/docs/internals/operations/index.md`

- Remove `LLM_TOKEN` references; replace with `ANTHROPIC_API_KEY` and
  `MCP_TOKEN` as applicable

**Modified:** `website/docs/internals/codegen/index.md`

- Update the proto source table to reflect deleted packages (agent, llm, memory,
  tool) and the new `proto/tool.proto` shared location

**Modified:** `website/docs/internals/terrain/index.md` (if it references
`LLM_TOKEN`)

- Replace with current credential guidance

### Step 6 — Create parity rubric fixtures

**Created:** `products/guide/test/parity/fixtures.json`

10 fixture questions spanning the categories from the design:

```json
[
  {
    "id": "discipline-lookup",
    "question": "What skills does a software-engineering discipline require at senior level?",
    "expected_tools": ["pathway_describe_job"],
    "expected_substance": "Lists skills from the software-engineering senior job definition with proficiency levels"
  },
  {
    "id": "level-progression",
    "question": "What changes between mid and senior for platform engineering?",
    "expected_tools": ["pathway_describe_progression"],
    "expected_substance": "Shows skill and behaviour deltas between mid and senior for platform engineering"
  },
  {
    "id": "job-description",
    "question": "Describe the job for a senior software engineer on the product track.",
    "expected_tools": ["pathway_describe_job"],
    "expected_substance": "Full job description including skills, behaviours, responsibilities for senior SE product track"
  },
  {
    "id": "capability-skills",
    "question": "What skills make up the technical excellence capability?",
    "expected_tools": ["get_ontology", "query_by_pattern"],
    "expected_substance": "Lists skills under the technical-excellence capability with descriptions"
  },
  {
    "id": "behaviour-lookup",
    "question": "What does practicing maturity look like for collaboration?",
    "expected_tools": ["query_by_pattern"],
    "expected_substance": "Describes the practicing maturity level for the collaboration behaviour"
  },
  {
    "id": "semantic-search",
    "question": "How should an engineer approach code review?",
    "expected_tools": ["search_content"],
    "expected_substance": "Synthesizes guidance on code review from retrieved framework content"
  },
  {
    "id": "software-toolkit",
    "question": "What tools does a senior data engineer use?",
    "expected_tools": ["pathway_list_job_software"],
    "expected_substance": "Lists software tools for the senior data-engineering job"
  },
  {
    "id": "agent-profile",
    "question": "What are the agent profiles for software engineering on the IC track?",
    "expected_tools": ["pathway_list_agent_profiles"],
    "expected_substance": "Lists agent profile definitions for software-engineering IC"
  },
  {
    "id": "ontology-discovery",
    "question": "What entity types and relationships exist in the knowledge graph?",
    "expected_tools": ["get_ontology"],
    "expected_substance": "Returns the full ontology with entity types and predicates"
  },
  {
    "id": "multi-hop",
    "question": "For a senior platform engineer on the IC track, which skills changed from mid level and what behaviours are expected?",
    "expected_tools": ["pathway_describe_progression", "pathway_describe_job"],
    "expected_substance": "Combines progression delta with job description to show both skill changes and behaviour expectations"
  }
]
```

### Step 6 — Create parity runner

**Created:** `products/guide/test/parity/runner.js`

A test script that:

1. Reads `fixtures.json`.
2. For each fixture, sends the question to a specified surface.
3. Captures the answer text and the set of tool calls made.
4. Evaluates three criteria:
   - **Substance** — LLM-judged: does the answer match `expected_substance`?
     (Use a simple Anthropic API call with a grading prompt.)
   - **Tool coverage** — observed tool-call set ⊇ `expected_tools`.
   - **Grounding** — every factual claim in the answer cites a URI or snippet
     from tool results (LLM-judged).
5. Reports pass/fail per fixture per criterion.

Surface adapters:

- **CLI** — spawn `fit-guide` with the question as stdin, capture stdout and
  tool-call log from the SDK session JSONL.
- **Claude Code** — use `query()` with the MCP server config, capture messages.
- **Claude Chat** — manual or via API if Connector provides programmatic access;
  document manual steps if no API.

The runner is invoked manually at acceptance, not in CI (requires live services
and LLM access).

### Step 7 — Zero-residue verification

**Created:** `products/guide/test/parity/zero-residue.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Package names and directory names of deleted components
PATTERNS="libagent|libmemory|libllm|svcagent|svcmemory|svcllm|svctool"
# Also check for stale env var references
PATTERNS="$PATTERNS|LLM_TOKEN|LLM_BASE_URL"

# Allowed locations: spec/plan/design artifacts, git history, generated proto
# (tool.proto message types are retained), CONTRIBUTING.md structure section
# (updated in Step 1-3 if it references old layout)
EXCLUDE="specs/|plan-|design|\.git/|generated/|node_modules/"

matches=$(grep -rE "$PATTERNS" --include='*.js' --include='*.json' \
  --include='*.md' --include='*.yaml' --include='*.yml' \
  --include='*.env*' --include='*.sh' . \
  | grep -vE "$EXCLUDE" || true)

if [ -n "$matches" ]; then
  echo "FAIL: residue found"
  echo "$matches"
  exit 1
fi

echo "PASS: zero residue"
```

Covers SC12. Any match outside spec/plan/design artifacts, generated output, and
git history is a failure. CONTRIBUTING.md and operations/codegen/terrain docs
are updated in Step 5; the zero-residue check runs after all documentation steps
are complete.

### Step 8 — Final quality gates

```bash
bun run check        # lint, format
bun run test         # full suite
just codegen         # codegen still works
bash products/guide/test/parity/zero-residue.sh  # no residue
```

## Files changed

| Action   | Path                                                                |
| -------- | ------------------------------------------------------------------- |
| Modified | `.claude/skills/fit-guide/SKILL.md`                                 |
| Modified | `website/guide/index.md`                                            |
| Modified | `website/docs/internals/guide/index.md`                             |
| Modified | `website/docs/getting-started/engineers/index.md` (if exists)       |
| Modified | `website/docs/getting-started/contributors/index.md` (if exists)    |
| Modified | `CONTRIBUTING.md`                                                   |
| Modified | `website/docs/internals/operations/index.md`                        |
| Modified | `website/docs/internals/codegen/index.md`                           |
| Modified | `website/docs/internals/terrain/index.md` (if references LLM_TOKEN) |
| Created  | `products/guide/test/parity/fixtures.json`                          |
| Created  | `products/guide/test/parity/runner.js`                              |
| Created  | `products/guide/test/parity/zero-residue.sh`                        |

## Verification

```bash
# Documentation — no broken internal links
# (manual review or link checker if available)

# Parity rubric — requires live stack
# Start services, then:
node products/guide/test/parity/runner.js --surface cli
node products/guide/test/parity/runner.js --surface claude-code
# Claude Chat: manual per documented steps

# Zero residue
bash products/guide/test/parity/zero-residue.sh

# Final gates
bun run check
bun run test
```
