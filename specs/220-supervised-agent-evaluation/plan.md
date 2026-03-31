# Plan 220 — Agent Execution and Supervised Evaluation

## Approach

Build bottom-up: AgentRunner first (the building block), then Supervisor (which
composes it), then CLI commands, then the GitHub Action, then workflow
migration, then the Guide scenario. Each step is independently testable.

The `run` command emits raw stream-json NDJSON — identical to what the `claude`
binary produces today — so TraceCollector works without changes. The `supervise`
command wraps each line with `source` and `turn` metadata, producing a richer
stream that requires filtering for TraceCollector compatibility. This asymmetry
is intentional: `run` is a drop-in replacement, `supervise` is a new capability.

Agent profiles (`.claude/agents/*.md`) are passed through to the SDK via the
`--agent` flag. The `supervise` command supports separate profiles for
supervisor and agent, since they serve different roles.

## Step 1 — Add the Agent SDK dependency

**File:** `libraries/libeval/package.json`

Add `@anthropic-ai/claude-agent-sdk` as a dependency. The SDK provides the
`query()` function that manages agent sessions — tool permissions, context
loading from `CLAUDE.md` and `.claude/`, and session resumption.

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0"
  }
}
```

The exact version will be whatever is current at implementation time. Pin to a
specific minor version once confirmed.

### SDK API Surface (verified)

The Agent SDK exports a single entry point — the `query()` async generator:

```javascript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Returns an AsyncIterable of message objects
for await (const message of query({
  prompt: "task text",
  options: {
    cwd: "/path/to/workdir",
    allowedTools: ["Bash", "Read", "Glob", "Grep", "Write", "Edit"],
    maxTurns: 50,
    model: "opus",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  },
})) {
  // Session init event: message.type === "system" && message.subtype === "init"
  //   → message.session_id (string)
  // Result event: "result" in message
  //   → message.result (string — the agent's final text response)
  //   → message.stop_reason ("end_turn", "max_tokens", etc.)
}
```

**Session resumption** — pass the captured `session_id` via `options.resume`:

```javascript
for await (const message of query({
  prompt: "follow-up prompt",
  options: { resume: sessionId },
})) { ... }
```

All other options (`cwd`, `allowedTools`, etc.) carry over from the original
session when resuming. The SDK reads `CLAUDE.md`, `.claude/settings.json`, and
`.claude/skills/` from the `cwd` automatically — no explicit context loading
needed.

**Verify:** `bun install` succeeds, `bun run test` still passes.

## Step 2 — AgentRunner class

**New file:** `libraries/libeval/src/agent-runner.js`

AgentRunner runs a single agent session and emits raw NDJSON events to an output
stream. It is the building block for both `run` and `supervise`.

### Constructor

```javascript
export class AgentRunner {
  /**
   * @param {object} deps
   * @param {string} deps.cwd - Agent working directory
   * @param {function} deps.query - SDK query function (injected for testing)
   * @param {import("stream").Writable} deps.output - Stream to emit NDJSON to
   * @param {string} deps.model - Claude model identifier
   * @param {number} deps.maxTurns - Maximum agentic turns
   * @param {string[]} deps.allowedTools - Tools the agent may use
   * @param {string} [deps.permissionMode] - SDK permission mode (optional)
   */
  constructor({ cwd, query, output, model, maxTurns, allowedTools, permissionMode }) {
    if (!cwd) throw new Error("cwd is required");
    if (!query) throw new Error("query is required");
    if (!output) throw new Error("output is required");
    this.cwd = cwd;
    this.query = query;
    this.output = output;
    this.model = model ?? "opus";
    this.maxTurns = maxTurns ?? 50;
    this.allowedTools = allowedTools ?? ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];
    this.permissionMode = permissionMode ?? "bypassPermissions";
    this.sessionId = null;
  }
}
```

| Dependency       | Type       | Purpose                                   |
| ---------------- | ---------- | ----------------------------------------- |
| `cwd`            | `string`   | Agent working directory                   |
| `query`          | `function` | SDK query function (injected for testing) |
| `output`         | `Writable` | Stream to emit NDJSON lines to            |
| `model`          | `string`   | Claude model identifier                   |
| `maxTurns`       | `number`   | Maximum agentic turns                     |
| `allowedTools`   | `string[]` | Tools the agent may use                   |
| `permissionMode` | `string`   | SDK permission mode (default: bypassPermissions) |

Note: Agent profiles (`.claude/agents/*.md`) are not passed as constructor
parameters. The SDK loads context from the `cwd` automatically — CLAUDE.md,
`.claude/settings.json`, and `.claude/skills/`. To use a specific agent profile,
set it via `settingSources` or configure the agent's working directory to
include the desired `.claude/agents/` files.

### `run(task)` method

Calls `this.query({ prompt, options })` using the SDK's documented API. Iterates
the async iterable, writes each message as a JSON line to `this.output`, and
captures state:

```javascript
async run(task) {
  let text = "";
  let turns = 0;
  let stopReason = null;

  for await (const message of this.query({
    prompt: task,
    options: {
      cwd: this.cwd,
      allowedTools: this.allowedTools,
      maxTurns: this.maxTurns,
      model: this.model,
      permissionMode: this.permissionMode,
      allowDangerouslySkipPermissions: true,
    },
  })) {
    this.output.write(JSON.stringify(message) + "\n");

    if (message.type === "system" && message.subtype === "init") {
      this.sessionId = message.session_id;
    }
    if ("result" in message) {
      text = message.result;
      stopReason = message.stop_reason;
    }
  }

  const success = stopReason === "end_turn";
  return { success, text, sessionId: this.sessionId };
}
```

Returns `{ success, text, sessionId }`.

### `resume(prompt)` method

Calls `this.query()` with `options.resume` set to the stored `sessionId`. The
SDK restores the full conversation history from the prior session. Same event
streaming as `run()`. Used by Supervisor to continue an agent's session across
relay turns.

```javascript
async resume(prompt) {
  let text = "";
  let stopReason = null;

  for await (const message of this.query({
    prompt,
    options: { resume: this.sessionId },
  })) {
    this.output.write(JSON.stringify(message) + "\n");

    if ("result" in message) {
      text = message.result;
      stopReason = message.stop_reason;
    }
  }

  const success = stopReason === "end_turn";
  return { success, text };
}
```

Returns `{ success, text }` where `text` is the agent's final text response
(for the supervisor to observe).

### Factory function

```javascript
export function createAgentRunner(deps) {
  return new AgentRunner(deps);
}
```

### Tests

**New file:** `libraries/libeval/test/agent-runner.test.js`

Mock `query` as an async generator yielding canned message objects. Verify:

- NDJSON lines written to output stream match expected messages
- `sessionId` captured from `{ type: "system", subtype: "init", session_id }` event
- `resume()` passes `sessionId` via `options.resume` to `query()`
- `run()` passes `cwd`, `allowedTools`, `maxTurns`, `model`, `permissionMode` to `query()`
- Missing required deps throw
- `result` message yields `text` and `stop_reason` in return value

## Step 3 — Supervisor class

**New file:** `libraries/libeval/src/supervisor.js`

Supervisor composes an AgentRunner for the agent side and manages a second
session for the supervisor side. It runs the relay loop.

### Constructor

```javascript
export class Supervisor {
  /**
   * @param {object} deps
   * @param {AgentRunner} deps.agentRunner - AgentRunner for the agent side
   * @param {AgentRunner} deps.supervisorRunner - AgentRunner for the supervisor side
   * @param {import("stream").Writable} deps.output - Stream to emit tagged NDJSON to
   * @param {number} deps.maxTurns - Maximum supervisor ↔ agent exchanges
   */
  constructor({ agentRunner, supervisorRunner, output, maxTurns }) {
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!supervisorRunner) throw new Error("supervisorRunner is required");
    if (!output) throw new Error("output is required");
    this.agentRunner = agentRunner;
    this.supervisorRunner = supervisorRunner;
    this.output = output;
    this.maxTurns = maxTurns ?? 20;
  }
}
```

| Dependency         | Type          | Purpose                                        |
| ------------------ | ------------- | ---------------------------------------------- |
| `agentRunner`      | `AgentRunner` | Runs the agent sessions (injected, not created) |
| `supervisorRunner` | `AgentRunner` | Runs the supervisor sessions (injected)         |
| `output`           | `Writable`    | Stream to emit tagged NDJSON lines to           |
| `maxTurns`         | `number`      | Maximum supervisor ↔ agent exchanges            |

### Internal composition

Both sides are AgentRunner instances, injected via the constructor. The
Supervisor does not create runners internally — the factory function wires them.
Both runners write raw NDJSON to their own internal output streams (in-memory
PassThrough streams); the Supervisor reads from those streams and re-emits each
line with `source` and `turn` tags to its own output.

This means the Supervisor contains zero session management code. AgentRunner
handles `query()`, session resumption, and event iteration for both sides. The
Supervisor only orchestrates the relay loop and tags the output.

### `run(task)` method — the relay loop

```javascript
async run(task) {
  // Turn 0: Agent receives the task and starts working
  let agentResult = await this.agentRunner.run(task);
  this.emitTagged("agent", 0);

  for (let turn = 1; turn <= this.maxTurns; turn++) {
    // Supervisor observes the agent's output
    const supervisorPrompt =
      `The agent reported:\n\n${agentResult.text}\n\n` +
      `Decide: provide guidance, answer a question, or say EVALUATION_COMPLETE on its own line.`;

    let supervisorResult;
    if (turn === 1) {
      supervisorResult = await this.supervisorRunner.run(supervisorPrompt);
    } else {
      supervisorResult = await this.supervisorRunner.resume(supervisorPrompt);
    }
    this.emitTagged("supervisor", turn);

    if (isDone(supervisorResult.text)) {
      this.emitSummary({ success: true, turns: turn });
      return { success: true, turns: turn };
    }

    // Supervisor's response becomes the agent's next input
    agentResult = await this.agentRunner.resume(supervisorResult.text);
    this.emitTagged("agent", turn);
  }

  this.emitSummary({ success: false, turns: this.maxTurns });
  return { success: false, turns: this.maxTurns };
}
```

The loop is generic. It does not parse the supervisor's response (beyond
checking for the completion signal). All intelligence lives in the supervisor's
CLAUDE.md and agent profile.

### `emitTagged(source, turn)` — output wrapping

Each AgentRunner writes raw NDJSON to its own PassThrough stream. After a
runner completes a turn, the Supervisor drains that stream and re-emits each
line wrapped with `source` and `turn` metadata. The original event is nested
under an `event` key to prevent field collisions (the SDK may emit messages with
their own `source` or `type` fields):

```javascript
emitTagged(source, turn) {
  const runner = source === "agent" ? this.agentRunner : this.supervisorRunner;
  for (const line of runner.drainOutput()) {
    const event = JSON.parse(line);
    const tagged = { source, turn, event };
    this.output.write(JSON.stringify(tagged) + "\n");
  }
}
```

The nested structure means consumers filter by `line.source === "agent"` and
access the original SDK event at `line.event`. This is unambiguous regardless of
what fields the SDK events contain.

### `emitSummary(result)` — orchestrator line

Writes a final line with `source: "orchestrator"`:

```jsonl
{"source":"orchestrator","type":"summary","success":true,"turns":5}
```

### `isDone(text)` — completion detection

Uses a structured signal rather than substring matching. The supervisor is
instructed to output `EVALUATION_COMPLETE` on its own line when the evaluation
is done. The check uses a line-based regex:

```javascript
function isDone(text) {
  return /^EVALUATION_COMPLETE$/m.test(text);
}
```

This avoids false positives from natural language ("not done yet", "the agent
is DONE installing"). The signal is deliberately not a common English word.
Supervisor context files (CLAUDE.md, agent profiles) instruct the supervisor to
emit `EVALUATION_COMPLETE` on its own line when criteria are met.

### `drainOutput()` on AgentRunner

AgentRunner needs a small addition to support the Supervisor's output tagging.
When used inside a Supervisor, each AgentRunner writes to a PassThrough stream
instead of the final output. The `drainOutput()` method returns accumulated
lines and clears the buffer:

```javascript
drainOutput() {
  const lines = [...this.buffer];
  this.buffer = [];
  return lines;
}
```

When AgentRunner is used directly by `fit-eval run`, it writes to the real
output stream (stdout or file) as before. When composed inside a Supervisor,
the factory wires it with an in-memory buffer that the Supervisor drains after
each turn.

### Factory function

The factory wires both AgentRunners with their respective configurations:

```javascript
import { PassThrough } from "stream";
import { createAgentRunner } from "./agent-runner.js";

export function createSupervisor({ supervisorCwd, agentCwd, query, output,
                                    model, maxTurns, allowedTools }) {
  const agentRunner = createAgentRunner({
    cwd: agentCwd,
    query,
    output: new PassThrough(),  // buffered, drained by Supervisor
    model,
    maxTurns: 50,               // per-turn limit for the agent
    allowedTools,
  });

  const supervisorRunner = createAgentRunner({
    cwd: supervisorCwd,
    query,
    output: new PassThrough(),  // buffered, drained by Supervisor
    model,
    maxTurns: 10,               // supervisor should decide quickly
    allowedTools: ["Read", "Glob", "Grep"],  // supervisor observes, doesn't write
  });

  return new Supervisor({ agentRunner, supervisorRunner, output, maxTurns });
}
```

### Tests

**New file:** `libraries/libeval/test/supervisor.test.js`

Mock `query` to simulate a multi-turn relay. Verify:

- Agent receives task on turn 0
- Supervisor receives agent output on each turn
- `EVALUATION_COMPLETE` on its own line terminates the loop
- `EVALUATION_COMPLETE` embedded in a sentence does NOT terminate the loop
- maxTurns limit enforced
- Output stream contains tagged lines with correct `source` and `turn`
- Each tagged line nests the original event under an `event` key (no field collisions)
- Orchestrator summary emitted at the end
- Both runners are injected — tests bypass factory and inject mocks directly

## Step 4 — CLI command: `run`

**New file:** `libraries/libeval/src/commands/run.js`

### Flag parsing

```
fit-eval run [options]

Options:
  --task=PATH          Path to task file (required)
  --cwd=DIR            Agent working directory (default: .)
  --model=MODEL        Claude model to use (default: from config)
  --max-turns=N        Maximum agentic turns (default: 50)
  --output=PATH        Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
```

Agent profiles are loaded automatically by the SDK from `.claude/agents/`
within `--cwd`. No explicit `--agent` flag is needed.

### Handler

1. Parse args (same `--key=value` / `--key value` pattern as `output` command)
2. Validate `--task` exists and is readable
3. Read task file contents
4. Resolve `--cwd` to absolute path
5. Create output stream (file or stdout)
6. Import `query` from the Agent SDK
7. Create `AgentRunner` via factory, passing real deps
8. Call `agentRunner.run(taskContent)`
9. Exit with code 0 on success, 1 on failure

```javascript
import { readFileSync } from "fs";
import { createWriteStream } from "fs";
import { resolve } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createAgentRunner } from "../agent-runner.js";

export async function runRunCommand(args) {
  const task = parseFlag(args, "task");
  if (!task) throw new Error("--task is required");

  const cwd = resolve(parseFlag(args, "cwd") ?? ".");
  const model = parseFlag(args, "model") ?? "opus";
  const maxTurns = parseInt(parseFlag(args, "max-turns") ?? "50", 10);
  const outputPath = parseFlag(args, "output");
  const allowedTools = (parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit").split(",");

  const taskContent = readFileSync(task, "utf8");
  const output = outputPath ? createWriteStream(outputPath) : process.stdout;

  const runner = createAgentRunner({ cwd, query, output, model, maxTurns, allowedTools });
  const result = await runner.run(taskContent);

  if (outputPath && output !== process.stdout) {
    await new Promise((resolve) => output.end(resolve));
  }

  process.exit(result.success ? 0 : 1);
}
```

Note: The `--agent` CLI flag is no longer needed. Agent profiles are loaded
automatically by the SDK from `.claude/agents/` within the working directory.
To use a specific agent profile, ensure the `--cwd` points to a directory that
contains the desired `.claude/` configuration.

### Typical invocations

Single agent in CI (replaces the claude action). The agent profile is loaded
from `.claude/agents/` within the working directory:

```
fit-eval run --task=.github/tasks/security-audit.md --cwd=. --model=opus --max-turns=50
```

Single agent with trace file:

```
fit-eval run --task=.github/tasks/release-readiness.md --output=traces/release.ndjson
```

## Step 5 — CLI command: `supervise`

**New file:** `libraries/libeval/src/commands/supervise.js`

### Flag parsing

```
fit-eval supervise [options]

Options:
  --task=PATH               Path to task file (required)
  --supervisor-cwd=DIR      Supervisor working directory (default: .)
  --agent-cwd=DIR           Agent working directory (default: temp directory)
  --model=MODEL             Claude model to use (default: from config)
  --max-turns=N             Maximum supervisor ↔ agent exchanges (default: 20)
  --output=PATH             Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST      Comma-separated tools for the agent (default: Bash,Read,Glob,Grep,Write,Edit)
```

Each side's agent profile is loaded automatically by the SDK from `.claude/`
within its respective `--*-cwd`. To give the supervisor the `product-manager`
persona, point `--supervisor-cwd` to a directory containing the desired
`.claude/agents/` configuration.

### Handler

1. Parse args
2. Validate `--task` exists
3. Read task file
4. Resolve cwds (create temp dir for agent if not specified)
5. Create output stream
6. Import `query` from the Agent SDK
7. Create `Supervisor` via factory, passing real deps
8. Call `supervisor.run(taskContent)`
9. Exit with code 0 on success, 1 on failure

### Typical invocations

Supervisor inherits monorepo context:

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/fresh-project
```

Both purpose-built (fully isolated scenario):

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=scenarios/guide-setup/supervisor \
  --agent-cwd=scenarios/guide-setup/agent
```

Different personas via working directories:

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=scenarios/guide-setup/supervisor \
  --agent-cwd=scenarios/guide-setup/agent
```

Each side loads its CLAUDE.md, `.claude/settings.json`, and `.claude/skills/`
from its own `--*-cwd`.

Minimal (defaults):

```
fit-eval supervise --task=task.md
```

Supervisor runs from the current directory. Agent gets a temp directory.

## Step 6 — Register commands in CLI entry point

**Modified file:** `libraries/libeval/bin/fit-eval.js`

Add `run` and `supervise` to the COMMANDS map:

```javascript
import { runRunCommand } from "../src/commands/run.js";
import { runSuperviseCommand } from "../src/commands/supervise.js";

const COMMANDS = {
  output: runOutputCommand,
  tee: runTeeCommand,
  run: runRunCommand,
  supervise: runSuperviseCommand,
};
```

Update the help text to include the new commands.

**Verify:** `bunx fit-eval --help` shows all four commands.

## Step 7 — Export new classes from index.js

**Modified file:** `libraries/libeval/index.js`

```javascript
export { TraceCollector, createTraceCollector } from "./src/trace-collector.js";
export { AgentRunner, createAgentRunner } from "./src/agent-runner.js";
export { Supervisor, createSupervisor } from "./src/supervisor.js";
```

## Step 8 — GitHub Action: `.github/actions/fit-eval/`

**New file:** `.github/actions/fit-eval/action.yml`

A composite action that replaces `.github/actions/claude/`. No Claude Code
binary installation — calls `bunx fit-eval` directly.

### Inputs

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

### Steps

```yaml
runs:
  using: composite
  steps:
    - name: Configure Git identity
      shell: bash
      env:
        APP_SLUG: ${{ inputs.app-slug }}
        APP_ID: ${{ inputs.app-id }}
      run: |
        git config user.name "${APP_SLUG}[bot]"
        git config user.email "${APP_ID}+${APP_SLUG}[bot]@users.noreply.github.com"

    - name: Setup trace directory
      if: inputs.trace == 'true'
      id: setup
      shell: bash
      run: |
        TRACE_DIR=$(mktemp -d)
        echo "trace-dir=$TRACE_DIR" >> "$GITHUB_OUTPUT"

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
        TRACE_ENABLED: ${{ inputs.trace }}
        TRACE_DIR: ${{ steps.setup.outputs.trace-dir }}
      run: |
        # Build args array to avoid quoting issues with spaces in paths
        args=()

        if [ "$TRACE_ENABLED" = "true" ] && [ -n "$TRACE_DIR" ]; then
          args+=("--output=$TRACE_DIR/trace.ndjson")
        fi

        if [ "$MODE" = "supervise" ]; then
          agent_cwd="${AGENT_CWD:-$(mktemp -d)}"

          bunx fit-eval supervise \
            --task="$TASK" \
            --supervisor-cwd="$SUPERVISOR_CWD" \
            --agent-cwd="$agent_cwd" \
            --model="$MODEL" \
            --max-turns="$MAX_TURNS" \
            --allowed-tools="$TOOLS" \
            "${args[@]}"
        else
          bunx fit-eval run \
            --task="$TASK" \
            --cwd="$CWD" \
            --model="$MODEL" \
            --max-turns="$MAX_TURNS" \
            --allowed-tools="$TOOLS" \
            "${args[@]}"
        fi

    - name: Upload trace artifact
      if: always() && inputs.trace == 'true' && steps.setup.outputs.trace-dir != ''
      uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
      with:
        name: ${{ inputs.trace-name }}
        path: ${{ steps.setup.outputs.trace-dir }}
```

Key differences from the old action:

- No `claude` binary installation step
- No piping through stdin — task is a file path
- No `fit-eval tee` post-processing — the `run` command handles trace output
- Agent profiles loaded automatically from `.claude/` within each `--cwd`
- Supports `supervise` mode with separate supervisor/agent working directories
- All variable expansions properly quoted to handle paths with spaces

## Step 9 — Create task files

**New directory:** `.github/tasks/`

One markdown file per CI workflow, containing the prompt that was previously
inline in the workflow YAML.

| Workflow          | Task file                            | Current inline prompt                                          |
| ----------------- | ------------------------------------ | -------------------------------------------------------------- |
| security-audit    | `.github/tasks/security-audit.md`    | "Perform a security audit of the repository."                  |
| product-backlog   | `.github/tasks/product-backlog.md`   | Review all open PRs for product alignment...                   |
| product-feedback  | `.github/tasks/product-feedback.md`  | Review all open GitHub issues for product alignment            |
| improvement-coach | `.github/tasks/improvement-coach.md` | Pick one random agent workflow trace and deep-analyze it       |
| dependabot-triage | `.github/tasks/dependabot-triage.md` | Review and triage open Dependabot pull requests                |
| release-readiness | `.github/tasks/release-readiness.md` | Check all open pull requests for merge readiness               |
| release-review    | `.github/tasks/release-review.md`    | Review main branch for unreleased changes and cut new versions |

Each file contains the full prompt text. Some may be expanded from the terse
inline versions to include more context now that they're standalone files.

## Step 10 — Migrate workflows

**Modified files:** All seven workflow files in `.github/workflows/`

Each workflow changes from:

```yaml
- uses: ./.github/actions/claude
  with:
    prompt: "Perform a security audit of the repository."
    agent: "security-engineer"
    model: "opus"
    max-turns: "50"
    app-id: ${{ secrets.CI_APP_ID }}
```

To:

```yaml
- uses: ./.github/actions/fit-eval
  with:
    task: .github/tasks/security-audit.md
    model: "opus"
    max-turns: "50"
    app-id: ${{ secrets.CI_APP_ID }}
```

The `prompt:` input becomes `task:` (a file path). The `agent:` input is
removed — the SDK loads agent profiles from `.claude/agents/` within the
working directory automatically. All other inputs are unchanged. Environment
variables are unchanged.

### Migration checklist

- [ ] `security-audit.yml` → task file + fit-eval action
- [ ] `product-backlog.yml` → task file + fit-eval action
- [ ] `product-feedback.yml` → task file + fit-eval action
- [ ] `improvement-coach.yml` → task file + fit-eval action
- [ ] `dependabot-triage.yml` → task file + fit-eval action
- [ ] `release-readiness.yml` → task file + fit-eval action
- [ ] `release-review.yml` → task file + fit-eval action

## Step 11 — Guide setup scenario

**New files:**

```
scenarios/guide-setup/
  task.md              Task for the agent
  supervisor/
    CLAUDE.md          Supervisor context and judgement rules
  agent/
    CLAUDE.md          Minimal agent persona
```

### `scenarios/guide-setup/task.md`

> You are a developer evaluating the Forward Impact engineering platform. Go to
> www.forwardimpact.team, find the Guide product, read the documentation, and
> try to install and configure it in a fresh project. Do not clone the monorepo
> — install from npm. Write notes about your experience in ./notes/.

### `scenarios/guide-setup/supervisor/CLAUDE.md`

Encodes the supervisor's judgement rules:

> ## When to intervene
>
> - The agent is stuck in a loop (retrying the same failing command)
> - The agent is going down a dead end (e.g. trying to clone the monorepo)
> - The agent asks a question you can answer
> - The agent has missed something important
>
> ## When to let them continue
>
> - The agent is making progress, even if slowly
> - The agent is troubleshooting a real issue (let them learn)
> - The agent found an alternative path that still works
>
> ## Completion criteria
>
> - The agent has installed @forwardimpact packages from npm
> - The agent has initialized framework data with fit-pathway init
> - The agent has run fit-map validate
> - The agent has written an assessment to ./notes/
> - Output EVALUATION_COMPLETE on its own line when all criteria are met (or clearly unachievable)

In practice, the supervisor can also run from the monorepo root
(`--supervisor-cwd=.`) to inherit the full project context. The purpose-built
directory is for fully isolated scenarios.

### `scenarios/guide-setup/agent/CLAUDE.md`

> You are a developer evaluating a new product. Work independently — read docs,
> try commands, troubleshoot errors. If you get genuinely stuck and can't find
> the answer in documentation, say so clearly and describe what you've tried.
> Write notes about your experience in ./notes/ as you go.

### Invocation

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=scenarios/guide-setup/supervisor \
  --agent-cwd=scenarios/guide-setup/agent
```

Or using the monorepo as supervisor context:

```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/guide-eval
```

## Step 12 — Guide onboarding scenario (product-manager supervised)

**New files:**

```
scenarios/guide-onboarding/
  task.md              Task for the agent
  agent/
    CLAUDE.md          Minimal agent persona
```

This scenario uses the `product-manager` agent profile as the supervisor,
running from the monorepo root. The product-manager has deep knowledge of the
product suite, documentation structure, and user experience expectations — it
acts as a product-aware observer evaluating whether the Guide onboarding
experience actually works for a new user.

Unlike the Guide setup scenario (Step 11), which tests whether a developer can
_install and configure_ the platform from scratch, this scenario tests the
end-to-end _user journey_: visit the website, follow the getting-started docs,
install fit-guide, and run real prompts against it. The product-manager
supervisor evaluates the experience from a product quality perspective — are the
docs clear? Do the commands work? Is the output useful?

### `scenarios/guide-onboarding/task.md`

> You are a developer trying out the Forward Impact Guide product for the first
> time. Start at www.forwardimpact.team, find the Guide product page, and follow
> the instructions to install and run fit-guide.
>
> Your goal is to get fit-guide working and run a few prompts with it:
>
> 1. Install the @forwardimpact/guide package from npm
> 2. Follow any setup instructions from the documentation
> 3. Run at least three different fit-guide prompts — try asking it about
>    skills, career progression, or engineering practices
> 4. Write notes about your experience in ./notes/, including:
>    - How clear the installation instructions were
>    - Whether the commands worked as documented
>    - How useful the responses were
>    - Any errors or confusing moments
>
> Work independently. Do not clone the monorepo — install from npm as a user
> would.

### `scenarios/guide-onboarding/agent/CLAUDE.md`

> You are a developer trying a product for the first time. Follow documentation
> as written — do not look for workarounds or alternative approaches unless the
> documented path fails. If something is unclear or doesn't work, note it and
> try to proceed. Write honest notes about your experience in ./notes/ as you
> go.

### Invocation

The product-manager runs from the monorepo root, inheriting all its skills,
product knowledge, and CLAUDE.md context:

```
fit-eval supervise \
  --task=scenarios/guide-onboarding/task.md \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/guide-onboarding
```

The supervisor runs from the monorepo root, where the product-manager agent
profile lives in `.claude/agents/`. The SDK loads this profile automatically
along with all skills and CLAUDE.md context. No explicit `--supervisor-agent`
flag is needed.

**Supervisor behaviour (derived from product-manager profile):**

- Nudges when the agent skips documented steps or misses a key feature
- Answers questions about product capabilities (the product-manager knows the
  full product suite)
- Evaluates whether the documentation led to a successful outcome
- Outputs EVALUATION_COMPLETE when the agent has run at least three prompts and
  written notes, or when it's clear the onboarding path is broken

**What this scenario reveals:**

- Whether the website-to-CLI pipeline works end-to-end for a new user
- Documentation gaps or inaccuracies in the Guide getting-started flow
- Package installation issues (missing deps, version conflicts)
- Whether fit-guide produces useful output for common first-time queries
- Product quality signals the product-manager can feed back into issue triage

## Step 13 — Remove old action

**Deleted:** `.github/actions/claude/action.yml`

Only after all workflows have been migrated and verified. This is the last step
to avoid breaking CI during the transition.

## Blast Radius

### New files

| File                                          | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `libraries/libeval/src/agent-runner.js`       | AgentRunner class              |
| `libraries/libeval/src/supervisor.js`         | Supervisor class               |
| `libraries/libeval/src/commands/run.js`       | `run` command handler          |
| `libraries/libeval/src/commands/supervise.js` | `supervise` command handler    |
| `libraries/libeval/test/agent-runner.test.js` | AgentRunner tests              |
| `libraries/libeval/test/supervisor.test.js`   | Supervisor tests               |
| `.github/actions/fit-eval/action.yml`         | New composite action           |
| `.github/tasks/*.md` (7 files)                | Task files for CI workflows    |
| `scenarios/guide-setup/task.md`               | Guide setup scenario task      |
| `scenarios/guide-setup/supervisor/CLAUDE.md`  | Guide setup supervisor context |
| `scenarios/guide-setup/agent/CLAUDE.md`       | Guide setup agent context      |
| `scenarios/guide-onboarding/task.md`          | Guide onboarding scenario task |
| `scenarios/guide-onboarding/agent/CLAUDE.md`  | Guide onboarding agent context |

### Modified files

| File                                      | Change                                  |
| ----------------------------------------- | --------------------------------------- |
| `libraries/libeval/package.json`          | Add Agent SDK dependency                |
| `libraries/libeval/bin/fit-eval.js`       | Register `run` and `supervise` commands |
| `libraries/libeval/index.js`              | Export AgentRunner and Supervisor       |
| `.github/workflows/security-audit.yml`    | Migrate to fit-eval action              |
| `.github/workflows/product-backlog.yml`   | Migrate to fit-eval action              |
| `.github/workflows/product-feedback.yml`  | Migrate to fit-eval action              |
| `.github/workflows/improvement-coach.yml` | Migrate to fit-eval action              |
| `.github/workflows/dependabot-triage.yml` | Migrate to fit-eval action              |
| `.github/workflows/release-readiness.yml` | Migrate to fit-eval action              |
| `.github/workflows/release-review.yml`    | Migrate to fit-eval action              |

### Deleted files

| File                                | Reason                      |
| ----------------------------------- | --------------------------- |
| `.github/actions/claude/action.yml` | Replaced by fit-eval action |

## Ordering

Steps 1–7 can be implemented and tested locally without affecting CI. Steps 8–10
(action + migration) should be done in a single commit to avoid a state where
some workflows use the old action and some use the new one. Steps 11–12
(scenarios) are independent of each other and can land separately. Step 13
(delete old action) lands after migration is verified.

Recommended commit sequence:

1. Steps 1–7:
   `feat(libeval): add AgentRunner, Supervisor, and run/supervise commands`
2. Steps 8–10:
   `feat(ci): migrate workflows from claude action to fit-eval action`
3. Step 11: `feat(eval): add Guide setup supervised evaluation scenario`
4. Step 12:
   `feat(eval): add Guide onboarding scenario with product-manager supervisor`
5. Step 13: `chore(ci): remove deprecated .github/actions/claude/`
