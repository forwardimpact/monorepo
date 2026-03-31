# Spec 220 — Agent Execution and Supervised Evaluation

## Problem

We need two things:

1. **A single-agent runner.** Today our CI workflows shell out to the `claude`
   binary, pipe prompts through stdin, and capture stream-json output via shell
   scripting. This works but is fragile — the GitHub action hardcodes a specific
   Claude Code version, constructs CLI flags with string interpolation, and uses
   `fit-eval tee` as a post-processor. The `claude` binary is an implementation
   detail that should not leak into workflow definitions. We need a single CLI
   command that takes a task, runs an agent via the Claude Agent SDK, and
   produces a structured trace — replacing both the `claude` binary and the
   shell glue around it.

2. **A supervised runner.** We need a way to give an agent an open-ended task —
   "read the Forward Impact website and try to set up the Guide product" — and
   have a second agent supervise the process: watching what the agent does,
   answering questions it gets stuck on, nudging it when it goes off track, and
   deciding when the task is complete.

Sequential CLI invocations cannot solve the supervision case. Each invocation is
independent — the agent loses context between steps and cannot learn from its
own prior actions. If the agent gets stuck or has a question, there is no way to
respond. Real evaluation requires an adaptive supervisor that can observe and
intervene.

The single-agent case is simpler but equally important: every CI workflow that
runs a Claude agent should use the same `fit-eval` CLI rather than reimplementing
agent invocation in shell scripts.

## Solution

Add two subcommands to the `fit-eval` CLI that share a common structure:

### `fit-eval run` — Single Agent

Runs one Claude Agent SDK session to completion. Takes a task file and a working
directory. Produces an NDJSON trace to stdout (or a file). This is the direct
replacement for the `claude` binary + shell scripting in CI workflows.

The agent receives the task, works autonomously, and the command exits when the
agent is done. The output is the agent's trace — the same NDJSON format that
TraceCollector already understands, tagged with `source: "agent"` for
consistency with the supervised format.

### `fit-eval supervise` — Supervised Agent

Runs two Claude Agent SDK sessions in a relay loop:

- An **agent** that receives a task and works on it autonomously — fetching
  docs, installing packages, running commands, writing files. When it finishes a
  turn of work or gets stuck, it reports back.
- A **supervisor** that observes the agent's output after each turn and makes a
  judgement call: let the agent continue, provide guidance, answer a question, or
  declare the evaluation complete.

The agent drives its own exploration. The supervisor does not dictate steps — it
watches, nudges, and evaluates. This models how a senior engineer might observe a
junior developer working through an unfamiliar setup: they don't hand-hold every
step, but they're available when things go sideways.

### Shared Design

Both commands share the same structure:

- Task file as input (read once at startup)
- Working directory for the agent
- NDJSON trace as output
- Model and max-turns configuration
- Agent context from CLAUDE.md at the working directory

All scenario-specific intelligence lives in CLAUDE.md files at each agent's
working directory. The orchestration is generic — it knows nothing about
Guide, website docs, or npm packages. To evaluate a different scenario, point
the agents at different directories with different CLAUDE.md files.

### CI Integration

The `.github/actions/claude/` action is replaced with a
`.github/actions/fit-eval/` action that calls `fit-eval run` or
`fit-eval supervise` depending on inputs. No `claude` binary installation, no
shell-script flag construction — just `bunx fit-eval run --task=... --cwd=...`.
Workflows declare *what* to run, not *how* to invoke Claude.

## Scope

### In scope

1. **`fit-eval run` subcommand** — Accepts a task file and working directory.
   Runs a single agent via the SDK's `query()` function. Produces an NDJSON
   trace to stdout or a file. Replaces the `claude` binary invocation in CI.

2. **`fit-eval supervise` subcommand** — Accepts a task file, supervisor cwd,
   and agent cwd as flags. Runs the supervisor ↔ agent relay using the SDK's
   `query()` function with session resumption. Each cwd can be any directory —
   an existing project, a fresh temp dir, etc.

3. **AgentRunner class** (`src/agent-runner.js`) — Runs a single agent session.
   Accepts a `query` function and a writable output stream via constructor DI.
   Emits NDJSON events tagged with `source: "agent"`. Used directly by the
   `run` command and composed into the Supervisor for the `supervise` command.

4. **Supervisor class** (`src/supervisor.js`) — The generic relay loop. Composes
   an AgentRunner with a supervisor session. Accepts a `query` function and a
   writable output stream via constructor DI. Manages session resumption for
   both agents, emits NDJSON events to the output stream, enforces turn limits.
   Returns a structured result.

5. **Command handlers** — `src/commands/run.js` and `src/commands/supervise.js`
   parse CLI args, validate paths, wire real dependencies, run the appropriate
   class, and write output.

6. **`.github/actions/fit-eval/` action** — Replaces `.github/actions/claude/`.
   Accepts `task`, `mode` (run or supervise), `cwd`, and optional supervisor
   flags. Calls `bunx fit-eval run` or `bunx fit-eval supervise` with the
   appropriate flags. No Claude Code installation, no shell scripting. All
   existing workflows migrate to this action.

7. **Guide setup scenario** — The first scenario, demonstrating the supervised
   pattern. A task file and two directories (or one existing project for the
   supervisor) that encode the Guide product setup evaluation. Location TBD in
   plan.

8. **Symmetric NDJSON output** — Both commands produce the same NDJSON format.
   The `run` command emits lines with `source: "agent"` and a final
   `source: "orchestrator"` summary. The `supervise` command emits the same
   agent lines plus `source: "supervisor"` lines and a richer orchestrator
   summary. Filter by `source=="agent"` on either output to get a standard
   trace compatible with TraceCollector, `fit-eval output`, and `fit-eval tee`.

### Out of scope

- Parallel agents (single agent per run).
- Nested supervision (two layers only).
- MCP server integration (built-in Claude Code tools only).
- Changes to TraceCollector's event schema.

## Architecture

### CLI Interface

```
fit-eval run [options]

Options:
  --task=PATH          Path to task file (task description for the agent)
  --cwd=DIR            Agent working directory (default: .)
  --model=MODEL        Claude model to use (default: from config)
  --max-turns=N        Maximum agentic turns (default: 50)
  --output=PATH        Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
```

```
fit-eval supervise [options]

Options:
  --task=PATH          Path to task file (task description for the agent)
  --supervisor-cwd=DIR Supervisor working directory (default: .)
  --agent-cwd=DIR      Agent working directory (default: temp directory)
  --model=MODEL        Claude model to use (default: from config)
  --max-turns=N        Maximum supervisor ↔ agent exchanges (default: 20)
  --output=PATH        Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
```

Both commands share common flags (`--task`, `--model`, `--max-turns`, `--output`,
`--allowed-tools`). The `supervise` command adds `--supervisor-cwd` and
`--agent-cwd` while `run` has a single `--cwd`.

All flags are independent — any combination works. This means the supervisor can
run from an existing project (inheriting its CLAUDE.md, `.claude/skills/`, and
settings) while the agent starts in a completely separate directory.

### Directory Roles

Each agent's `cwd` determines what context it loads. The SDK reads `CLAUDE.md`,
`.claude/settings.json`, and `.claude/skills/` from the working directory.

**Supervisor cwd** — Where the supervisor runs. Can be an existing project like
the monorepo root, giving it access to all skills, settings, and project
context. Or it can be a purpose-built directory with a custom `CLAUDE.md` that
encodes scenario-specific judgement rules.

**Agent cwd** — Where the agent works. Typically a fresh directory for
evaluation scenarios (simulating a new developer), but can also be an existing
project. The agent's `CLAUDE.md` and `.claude/settings.json` at this path
control its persona and tool permissions.

**Task file** — The task given to the agent on the first turn. A plain text or
markdown file. Lives anywhere — it is read once at startup and passed to the
agent as its initial prompt.

### Typical Configurations

**Single agent in CI (replaces the claude action):**
```
fit-eval run \
  --task=tasks/security-audit.md \
  --cwd=. \
  --model=opus \
  --max-turns=50
```
Equivalent to what the current `.github/actions/claude/` action does, but
without installing or invoking the `claude` binary.

**Single agent with trace file:**
```
fit-eval run \
  --task=tasks/release-readiness.md \
  --output=traces/release.ndjson
```

**Supervisor inherits monorepo context:**
```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/fresh-project
```
The supervisor picks up the monorepo's CLAUDE.md, all `.claude/skills/`, and
settings. The agent starts clean.

**Both purpose-built (fully isolated scenario):**
```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=scenarios/guide-setup/supervisor \
  --agent-cwd=scenarios/guide-setup/agent
```
Each agent has its own CLAUDE.md and settings. Equivalent to the old workspace
layout but expressed as flags.

**Minimal (defaults):**
```
fit-eval supervise --task=task.md
```
Supervisor runs from the current directory. Agent gets a temp directory.

### Interaction Model

The agent works. The supervisor watches and decides what to do next.

```
Agent receives task, works autonomously
  ↓
Agent completes a turn of work (or gets stuck, or asks a question)
  ↓
Supervisor observes agent's output, decides:
  CONTINUE  → "Keep going." (agent continues where it left off)
  NUDGE     → "Try checking the CLI reference page." (guidance)
  ANSWER    → "The data dir is ./data/pathway/." (direct answer)
  DONE      → Evaluation complete, emit final assessment
  ↓
Agent receives supervisor response, resumes work
  ↓
... repeats until DONE or maxTurns reached
```

Both agents retain full conversation history via session resumption. The agent
remembers every action it took across all turns. The supervisor remembers every
observation and intervention it made.

**Key property:** The supervisor's response becomes the agent's next prompt. If
the supervisor says "Keep going, you're on the right track" — the agent receives
that as encouragement and continues. If the supervisor says "You missed the
`fit-pathway init` command, check the CLI docs" — the agent receives that as
guidance and adjusts. The relay is just text passing between two persistent
sessions.

### Class Design

```
AgentRunner
  constructor({ cwd, query, output, model, maxTurns, allowedTools })
  async run(task): { success, turns, sessionId }

Supervisor
  constructor({ supervisorCwd, agentCwd, query, output, model, maxTurns, allowedTools })
  async run(task): { success, turns }
```

**AgentRunner** is the building block. It runs a single agent session and emits
NDJSON with `source: "agent"`. The `run` command uses it directly. The
Supervisor composes it internally for the agent side of the relay.

**AgentRunner constructor dependencies:**

| Dependency     | Type       | Purpose                                   |
| -------------- | ---------- | ----------------------------------------- |
| `cwd`          | `string`   | Agent working directory                   |
| `query`        | `function` | SDK query function (injected for testing) |
| `output`       | `Writable` | Stream to emit NDJSON lines to            |
| `model`        | `string`   | Claude model identifier                   |
| `maxTurns`     | `number`   | Maximum agentic turns                     |
| `allowedTools` | `string[]` | Tools the agent may use                   |

**Supervisor constructor dependencies:**

| Dependency       | Type       | Purpose                                   |
| ---------------- | ---------- | ----------------------------------------- |
| `supervisorCwd`  | `string`   | Path to supervisor workspace directory    |
| `agentCwd`       | `string`   | Path to agent workspace directory         |
| `query`          | `function` | SDK query function (injected for testing) |
| `output`         | `Writable` | Stream to emit NDJSON lines to            |
| `model`          | `string`   | Claude model identifier                   |
| `maxTurns`       | `number`   | Maximum supervisor ↔ agent exchanges      |
| `allowedTools`   | `string[]` | Tools the agent may use                   |

The `query` function is the Claude Agent SDK's `query()`. Injecting it means
tests can substitute a mock that returns canned responses without hitting the
API. The `output` stream defaults to `process.stdout` in the CLI; tests can
capture it.

### Relay Loop (Pseudocode)

```javascript
async run(task, { maxTurns = 20 } = {}) {
  // Turn 0: Agent receives the task and starts working
  let agentResult = await this.send(this.agent, task);

  for (let turn = 1; turn <= maxTurns; turn++) {
    // Supervisor observes the agent's output
    const decision = await this.send(this.supervisor,
      `The agent reported:\n\n${agentResult.text}\n\n` +
      `Decide: provide guidance, answer a question, or output DONE.`
    );

    if (isDone(decision.text)) {
      return { success: true, turns: turn };
    }

    // Supervisor's response becomes the agent's next input
    agentResult = await this.send(this.agent, decision.text);
  }

  return { success: false, turns: maxTurns };
}
```

The loop is generic. It does not parse the supervisor's response (beyond checking
for DONE). It does not know what the task is. All intelligence — what "done"
means, what kind of nudges to give, when to intervene — lives in the
supervisor's CLAUDE.md.

### Output Format

The command emits a single combined NDJSON stream. Each line from either agent's
SDK stream is wrapped with a `source` and `turn` field before being emitted:

```jsonl
{"source":"agent","turn":0,"type":"system","subtype":"init","session_id":"..."}
{"source":"agent","turn":0,"type":"assistant","message":{...}}
{"source":"agent","turn":0,"type":"result","subtype":"success","total_cost_usd":0.42}
{"source":"supervisor","turn":1,"type":"assistant","message":{...}}
{"source":"supervisor","turn":1,"type":"result","subtype":"success","total_cost_usd":0.03}
{"source":"agent","turn":1,"type":"assistant","message":{...}}
...
{"source":"orchestrator","type":"summary","success":true,"turns":5}
```

Three sources appear in the stream:

| Source          | What it contains                                          |
| --------------- | --------------------------------------------------------- |
| `agent`         | Full SDK event stream — tool calls, text, token usage     |
| `supervisor`    | Lighter stream — mostly text decisions, few/no tool calls |
| `orchestrator`  | Final summary line with aggregate turns and success       |

**Filtering for compatibility.** Pipe through
`jq 'select(.source=="agent")'` to get a plain agent trace that TraceCollector
can process unchanged. The full interleaved stream gives the complete picture.

### Integration with Existing libeval

The `run` and `supervise` commands add to fit-eval alongside `output` and `tee`:

```javascript
const COMMANDS = {
  output: runOutputCommand,
  tee: runTeeCommand,
  run: runRunCommand,
  supervise: runSuperviseCommand,
};
```

### GitHub Action: `.github/actions/fit-eval/`

Replaces `.github/actions/claude/`. The new action is a thin wrapper around the
`fit-eval` CLI — no Claude Code installation, no shell-script flag construction.

**Inputs:**

```yaml
inputs:
  task:
    description: Path to task file (markdown or text)
    required: true
  mode:
    description: Execution mode — "run" (single agent) or "supervise"
    required: false
    default: "run"
  cwd:
    description: Agent working directory (for "run" mode)
    required: false
    default: "."
  supervisor-cwd:
    description: Supervisor working directory (for "supervise" mode)
    required: false
    default: "."
  agent-cwd:
    description: Agent working directory (for "supervise" mode)
    required: false
  model:
    description: Claude model to use
    required: false
    default: "opus"
  max-turns:
    description: Maximum turns
    required: false
    default: "50"
  allowed-tools:
    description: Comma-separated list of allowed tools
    required: false
    default: "Bash,Read,Glob,Grep,Write,Edit"
  trace:
    description: Enable trace capture and artifact upload
    required: false
    default: "true"
  trace-name:
    description: Artifact name for the trace
    required: false
    default: "eval-trace"
  app-slug:
    description: GitHub App slug for git identity
    required: false
    default: forward-impact-ci
  app-id:
    description: GitHub App ID for git identity email
    required: true
```

**Core step (replaces the claude binary invocation):**

```yaml
- name: Run fit-eval
  shell: bash
  env:
    MODE: ${{ inputs.mode }}
    TASK: ${{ inputs.task }}
    CWD: ${{ inputs.cwd }}
    SUPERVISOR_CWD: ${{ inputs.supervisor-cwd }}
    AGENT_CWD: ${{ inputs.agent-cwd }}
    MODEL: ${{ inputs.model }}
    MAX_TURNS: ${{ inputs.max-turns }}
    TOOLS: ${{ inputs.allowed-tools }}
    TRACE_DIR: ${{ steps.setup.outputs.trace-dir }}
  run: |
    if [ "$MODE" = "supervise" ]; then
      bunx fit-eval supervise \
        --task="$TASK" \
        --supervisor-cwd="$SUPERVISOR_CWD" \
        --agent-cwd="${AGENT_CWD:-$(mktemp -d)}" \
        --model="$MODEL" \
        --max-turns="$MAX_TURNS" \
        --allowed-tools="$TOOLS" \
        --output="$TRACE_DIR/trace.ndjson"
    else
      bunx fit-eval run \
        --task="$TASK" \
        --cwd="$CWD" \
        --model="$MODEL" \
        --max-turns="$MAX_TURNS" \
        --allowed-tools="$TOOLS" \
        --output="$TRACE_DIR/trace.ndjson"
    fi
```

**What changes in workflows:** Each workflow replaces `uses: ./.github/actions/claude`
with `uses: ./.github/actions/fit-eval` and replaces `prompt:` with `task:` (a
path to a task file instead of an inline string). The `agent:` input is replaced
by CLAUDE.md files in the agent's working directory. Example migration:

```yaml
# Before
- uses: ./.github/actions/claude
  with:
    prompt: "Perform a security audit of the repository."
    agent: security-engineer
    model: opus
    max-turns: 50
    app-id: ${{ vars.APP_ID }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

# After
- uses: ./.github/actions/fit-eval
  with:
    task: .github/tasks/security-audit.md
    model: opus
    max-turns: 50
    app-id: ${{ vars.APP_ID }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Task files (`.github/tasks/*.md`) contain the prompt text that was previously
inline in the workflow YAML. Agent profiles previously selected via the `agent:`
input are now encoded as CLAUDE.md context in the agent's working directory.

## Example: Guide Setup Scenario

The first scenario demonstrates the pattern. The supervisor runs from the
monorepo root (inheriting all skills and project context). The agent starts in
a fresh temp directory.

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/guide-eval
```

**`scenarios/guide-setup/task.md`:**
> You are a developer evaluating the Forward Impact engineering platform. Go to
> www.forwardimpact.team, find the Guide product, read the documentation, and
> try to install and configure it in a fresh project. Do not clone the monorepo —
> install from npm. Write notes about your experience in ./notes/.

**Supervisor context (monorepo root CLAUDE.md + a scenario-specific system
prompt or appended instructions):**

The supervisor inherits the monorepo's full CLAUDE.md and skills. Scenario-
specific judgement rules can be added via a CLAUDE.md in a subdirectory or
passed through the supervisor's prompt framing. The relay loop wraps each
agent observation with:

> The agent reported: {output}. Decide: provide guidance, answer a question,
> or output DONE.

The supervisor's own CLAUDE.md (from the monorepo) gives it deep product
knowledge — it knows what `fit-pathway init` does, what packages exist, what
the correct setup steps are. This is the advantage of running the supervisor
from an existing project rather than an isolated directory.

**Supervisor judgement rules** (encoded in the scenario or the monorepo
CLAUDE.md):

> ## When to intervene
> - The agent is stuck in a loop (retrying the same failing command)
> - The agent is going down a dead end (e.g. trying to clone the monorepo)
> - The agent asks a question you can answer
> - The agent has missed something important
>
> ## When to let them continue
> - The agent is making progress, even if slowly
> - The agent is troubleshooting a real issue (let them learn)
> - The agent found an alternative path that still works
>
> ## Completion criteria
> - The agent has installed @forwardimpact packages from npm
> - The agent has initialized framework data with fit-pathway init
> - The agent has run fit-map validate
> - The agent has written an assessment to ./notes/
> - Output DONE when all criteria are met (or clearly unachievable)

**`/tmp/guide-eval/CLAUDE.md`** (agent context, created before the run):
> You are a developer evaluating a new product. Work independently — read docs,
> try commands, troubleshoot errors. If you get genuinely stuck and can't find
> the answer in documentation, say so clearly and describe what you've tried.
> Write notes about your experience in ./notes/ as you go.

## Success Criteria

**`fit-eval run` (single agent):**

- `AgentRunner` follows the OO+DI pattern — constructor injection, factory
  function, tests bypass factory and inject mocks directly
- `fit-eval run` works end-to-end with any combination of flags
- NDJSON output is directly compatible with TraceCollector (no filtering needed)
- Produces the same trace quality as the current `claude` binary + `fit-eval tee`
  pipeline

**`fit-eval supervise` (supervised agent):**

- `Supervisor` composes `AgentRunner` — does not duplicate its logic
- `fit-eval supervise` works end-to-end with any combination of flags
- NDJSON output is filterable to a standard TraceCollector-compatible trace
  (filter by `source=="agent"`)
- Turn limits are enforced
- The supervisor terminates cleanly via DONE rather than hitting maxTurns

**Output symmetry:**

- Both commands produce NDJSON with `source` and `turn` fields
- Both commands emit an `orchestrator` summary line at the end
- `run` output is a strict subset of `supervise` output (agent + orchestrator
  lines only)
- Piping either command's output through `fit-eval output` produces a valid
  formatted trace

**CI migration:**

- `.github/actions/fit-eval/` action replaces `.github/actions/claude/`
- All existing workflows work with the new action
- No `claude` binary or `@anthropic-ai/claude-code` installation in CI
- Task files in `.github/tasks/` replace inline prompt strings

**Guide scenario (the first supervised workspace):**

- The agent discovers Guide from the website without being told specific URLs
- The agent installs `@forwardimpact` packages from npm
- The agent initializes framework data and attempts job/agent generation
- The agent produces notes with specific documentation feedback
- The supervisor intervenes only when the agent is genuinely stuck
