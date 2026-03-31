# Plan 220 — Agent Execution and Supervised Evaluation

## Approach

Build bottom-up: AgentRunner first (the building block), then Supervisor (which
composes it), then CLI commands, then the GitHub Action, then workflow migration,
then the Guide scenario. Each step is independently testable.

The `run` command emits raw stream-json NDJSON — identical to what the `claude`
binary produces today — so TraceCollector works without changes. The `supervise`
command wraps each line with `source` and `turn` metadata, producing a richer
stream that requires filtering for TraceCollector compatibility. This asymmetry
is intentional: `run` is a drop-in replacement, `supervise` is a new capability.

Agent profiles (`.claude/agents/*.md`) are passed through to the SDK via the
`--agent` flag. The `supervise` command supports separate profiles for supervisor
and agent, since they serve different roles.

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
   * @param {string} [deps.agent] - Agent profile name (optional)
   */
  constructor({ cwd, query, output, model, maxTurns, allowedTools, agent }) {
    if (!cwd) throw new Error("cwd is required");
    if (!query) throw new Error("query is required");
    if (!output) throw new Error("output is required");
    this.cwd = cwd;
    this.query = query;
    this.output = output;
    this.model = model ?? "opus";
    this.maxTurns = maxTurns ?? 50;
    this.allowedTools = allowedTools ?? ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];
    this.agent = agent ?? null;
    this.sessionId = null;
  }
}
```

| Dependency     | Type       | Purpose                                   |
| -------------- | ---------- | ----------------------------------------- |
| `cwd`          | `string`   | Agent working directory                   |
| `query`        | `function` | SDK query function (injected for testing) |
| `output`       | `Writable` | Stream to emit NDJSON lines to            |
| `model`        | `string`   | Claude model identifier                   |
| `maxTurns`     | `number`   | Maximum agentic turns                     |
| `allowedTools` | `string[]` | Tools the agent may use                   |
| `agent`        | `string`   | Agent profile name (optional)             |

### `run(task)` method

Calls `this.query()` with the task prompt. Iterates the SDK's event stream and
writes each event as a JSON line to `this.output`. Stores `sessionId` from the
init event for session resumption.

Returns `{ success, turns, sessionId }`.

### `resume(prompt)` method

Calls `this.query()` with the prompt and the stored `sessionId` for session
resumption. Same event streaming as `run()`. Used by Supervisor to continue an
agent's session across relay turns.

Returns `{ success, turns, text }` where `text` is the agent's final text
response (for the supervisor to observe).

### Factory function

```javascript
export function createAgentRunner(deps) {
  return new AgentRunner(deps);
}
```

### Tests

**New file:** `libraries/libeval/test/agent-runner.test.js`

Mock `query` to return canned event streams. Verify:
- NDJSON lines written to output stream match expected events
- `sessionId` captured from init event
- `resume()` passes `sessionId` to `query()`
- Missing required deps throw
- Agent profile passed to `query()` when provided

## Step 3 — Supervisor class

**New file:** `libraries/libeval/src/supervisor.js`

Supervisor composes an AgentRunner for the agent side and manages a second
session for the supervisor side. It runs the relay loop.

### Constructor

```javascript
export class Supervisor {
  /**
   * @param {object} deps
   * @param {string} deps.supervisorCwd - Supervisor working directory
   * @param {string} deps.agentCwd - Agent working directory
   * @param {function} deps.query - SDK query function (injected for testing)
   * @param {import("stream").Writable} deps.output - Stream to emit NDJSON to
   * @param {string} deps.model - Claude model identifier
   * @param {number} deps.maxTurns - Maximum supervisor ↔ agent exchanges
   * @param {string[]} deps.allowedTools - Tools the agent may use
   * @param {string} [deps.supervisorAgent] - Supervisor agent profile (optional)
   * @param {string} [deps.agentAgent] - Agent agent profile (optional)
   */
  constructor({ supervisorCwd, agentCwd, query, output, model, maxTurns,
                allowedTools, supervisorAgent, agentAgent }) { ... }
}
```

| Dependency         | Type       | Purpose                                         |
| ------------------ | ---------- | ----------------------------------------------- |
| `supervisorCwd`    | `string`   | Path to supervisor workspace directory           |
| `agentCwd`         | `string`   | Path to agent workspace directory                |
| `query`            | `function` | SDK query function (injected for testing)        |
| `output`           | `Writable` | Stream to emit NDJSON lines to                   |
| `model`            | `string`   | Claude model identifier                          |
| `maxTurns`         | `number`   | Maximum supervisor ↔ agent exchanges             |
| `allowedTools`     | `string[]` | Tools the agent may use                          |
| `supervisorAgent`  | `string`   | Supervisor agent profile name (optional)         |
| `agentAgent`       | `string`   | Agent agent profile name (optional)              |

### Internal composition

The Supervisor creates an AgentRunner internally for the agent side. The
supervisor side is managed directly (not via AgentRunner) since it has different
output tagging and does not need the same `run()`/`resume()` interface.

Both sides use the same injected `query` function but with different `cwd` and
`agent` parameters.

### `run(task)` method — the relay loop

```javascript
async run(task) {
  // Turn 0: Agent receives the task and starts working
  let agentResult = await this.agentRunner.run(task);
  this.emitTagged("agent", 0, agentResult.events);

  for (let turn = 1; turn <= this.maxTurns; turn++) {
    // Supervisor observes the agent's output
    const supervisorPrompt =
      `The agent reported:\n\n${agentResult.text}\n\n` +
      `Decide: provide guidance, answer a question, or output DONE.`;

    const decision = await this.sendToSupervisor(supervisorPrompt);
    this.emitTagged("supervisor", turn, decision.events);

    if (isDone(decision.text)) {
      this.emitSummary({ success: true, turns: turn });
      return { success: true, turns: turn };
    }

    // Supervisor's response becomes the agent's next input
    agentResult = await this.agentRunner.resume(decision.text);
    this.emitTagged("agent", turn, agentResult.events);
  }

  this.emitSummary({ success: false, turns: this.maxTurns });
  return { success: false, turns: this.maxTurns };
}
```

The loop is generic. It does not parse the supervisor's response (beyond
checking for DONE). All intelligence lives in the supervisor's CLAUDE.md and
agent profile.

### `emitTagged(source, turn, events)` — output wrapping

For each raw NDJSON event from the SDK, wraps it with `source` and `turn`
fields before writing to the output stream:

```javascript
emitTagged(source, turn, events) {
  for (const event of events) {
    const tagged = { source, turn, ...event };
    this.output.write(JSON.stringify(tagged) + "\n");
  }
}
```

### `emitSummary(result)` — orchestrator line

Writes a final line with `source: "orchestrator"`:

```jsonl
{"source":"orchestrator","type":"summary","success":true,"turns":5}
```

### `isDone(text)` — completion detection

Checks whether the supervisor's text response contains the word `DONE` as a
standalone signal. Simple string check — the supervisor is instructed to output
DONE when the evaluation is complete.

### Factory function

```javascript
export function createSupervisor(deps) {
  return new Supervisor(deps);
}
```

### Tests

**New file:** `libraries/libeval/test/supervisor.test.js`

Mock `query` to simulate a multi-turn relay. Verify:
- Agent receives task on turn 0
- Supervisor receives agent output on each turn
- Supervisor DONE terminates the loop
- maxTurns limit enforced
- Output stream contains tagged lines with correct `source` and `turn`
- Orchestrator summary emitted at the end
- Different agent profiles passed to agent vs supervisor sessions

## Step 4 — CLI command: `run`

**New file:** `libraries/libeval/src/commands/run.js`

### Flag parsing

```
fit-eval run [options]

Options:
  --task=PATH          Path to task file (required)
  --cwd=DIR            Agent working directory (default: .)
  --agent=NAME         Agent profile from .claude/agents/ (optional)
  --model=MODEL        Claude model to use (default: from config)
  --max-turns=N        Maximum agentic turns (default: 50)
  --output=PATH        Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
```

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
  const agent = parseFlag(args, "agent") ?? undefined;
  const model = parseFlag(args, "model") ?? "opus";
  const maxTurns = parseInt(parseFlag(args, "max-turns") ?? "50", 10);
  const outputPath = parseFlag(args, "output");
  const allowedTools = (parseFlag(args, "allowed-tools") ?? "Bash,Read,Glob,Grep,Write,Edit").split(",");

  const taskContent = readFileSync(task, "utf8");
  const output = outputPath ? createWriteStream(outputPath) : process.stdout;

  const runner = createAgentRunner({ cwd, query, output, model, maxTurns, allowedTools, agent });
  const result = await runner.run(taskContent);

  if (outputPath && output !== process.stdout) {
    await new Promise((resolve) => output.end(resolve));
  }

  process.exit(result.success ? 0 : 1);
}
```

### Typical invocations

Single agent in CI (replaces the claude action):
```
fit-eval run --task=.github/tasks/security-audit.md --agent=security-engineer --model=opus --max-turns=50
```

Single agent with trace file:
```
fit-eval run --task=.github/tasks/release-readiness.md --agent=release-engineer --output=traces/release.ndjson
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
  --supervisor-agent=NAME   Supervisor agent profile (optional)
  --agent-agent=NAME        Agent agent profile (optional)
  --model=MODEL             Claude model to use (default: from config)
  --max-turns=N             Maximum supervisor ↔ agent exchanges (default: 20)
  --output=PATH             Write NDJSON trace to file (default: stdout)
  --allowed-tools=LIST      Comma-separated tools (default: Bash,Read,Glob,Grep,Write,Edit)
```

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

Different agent profiles:
```
fit-eval supervise \
  --task=scenarios/guide-setup/task.md \
  --supervisor-agent=security-engineer \
  --agent-agent=
```

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
  agent:
    description: Agent profile name (for "run" mode)
    required: false
    default: ""
  cwd:
    description: Agent working directory (for "run" mode)
    required: false
    default: "."
  supervisor-cwd:
    description: Supervisor working directory (for "supervise" mode)
    required: false
    default: "."
  supervisor-agent:
    description: Supervisor agent profile (for "supervise" mode)
    required: false
    default: ""
  agent-cwd:
    description: Agent working directory (for "supervise" mode)
    required: false
  agent-agent:
    description: Agent agent profile (for "supervise" mode)
    required: false
    default: ""
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
        AGENT: ${{ inputs.agent }}
        SUPERVISOR_CWD: ${{ inputs.supervisor-cwd }}
        AGENT_CWD: ${{ inputs.agent-cwd }}
        SUPERVISOR_AGENT: ${{ inputs.supervisor-agent }}
        AGENT_AGENT: ${{ inputs.agent-agent }}
        MODEL: ${{ inputs.model }}
        MAX_TURNS: ${{ inputs.max-turns }}
        TOOLS: ${{ inputs.allowed-tools }}
        TRACE_ENABLED: ${{ inputs.trace }}
        TRACE_DIR: ${{ steps.setup.outputs.trace-dir }}
      run: |
        OUTPUT_FLAG=""
        if [ "$TRACE_ENABLED" = "true" ] && [ -n "$TRACE_DIR" ]; then
          OUTPUT_FLAG="--output=$TRACE_DIR/trace.ndjson"
        fi

        if [ "$MODE" = "supervise" ]; then
          AGENT_CWD_FLAG=""
          if [ -n "$AGENT_CWD" ]; then
            AGENT_CWD_FLAG="--agent-cwd=$AGENT_CWD"
          else
            AGENT_CWD_FLAG="--agent-cwd=$(mktemp -d)"
          fi

          SUP_AGENT_FLAG=""
          if [ -n "$SUPERVISOR_AGENT" ]; then
            SUP_AGENT_FLAG="--supervisor-agent=$SUPERVISOR_AGENT"
          fi

          AGENT_AGENT_FLAG=""
          if [ -n "$AGENT_AGENT" ]; then
            AGENT_AGENT_FLAG="--agent-agent=$AGENT_AGENT"
          fi

          bunx fit-eval supervise \
            --task="$TASK" \
            --supervisor-cwd="$SUPERVISOR_CWD" \
            $AGENT_CWD_FLAG \
            $SUP_AGENT_FLAG \
            $AGENT_AGENT_FLAG \
            --model="$MODEL" \
            --max-turns="$MAX_TURNS" \
            --allowed-tools="$TOOLS" \
            $OUTPUT_FLAG
        else
          AGENT_FLAG=""
          if [ -n "$AGENT" ]; then
            AGENT_FLAG="--agent=$AGENT"
          fi

          bunx fit-eval run \
            --task="$TASK" \
            --cwd="$CWD" \
            $AGENT_FLAG \
            --model="$MODEL" \
            --max-turns="$MAX_TURNS" \
            --allowed-tools="$TOOLS" \
            $OUTPUT_FLAG
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
- Agent profile passed as `--agent` flag, not via the SDK's `--agent` CLI flag
- Supports `supervise` mode with separate supervisor/agent profiles

## Step 9 — Create task files

**New directory:** `.github/tasks/`

One markdown file per CI workflow, containing the prompt that was previously
inline in the workflow YAML.

| Workflow              | Task file                            | Current inline prompt                                              |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| security-audit        | `.github/tasks/security-audit.md`    | "Perform a security audit of the repository."                      |
| product-backlog       | `.github/tasks/product-backlog.md`   | Review all open PRs for product alignment...                       |
| product-feedback      | `.github/tasks/product-feedback.md`  | Review all open GitHub issues for product alignment                |
| improvement-coach     | `.github/tasks/improvement-coach.md` | Pick one random agent workflow trace and deep-analyze it            |
| dependabot-triage     | `.github/tasks/dependabot-triage.md` | Review and triage open Dependabot pull requests                    |
| release-readiness     | `.github/tasks/release-readiness.md` | Check all open pull requests for merge readiness                   |
| release-review        | `.github/tasks/release-review.md`    | Review main branch for unreleased changes and cut new versions     |

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
    agent: "security-engineer"
    model: "opus"
    max-turns: "50"
    app-id: ${{ secrets.CI_APP_ID }}
```

The `prompt:` input becomes `task:` (a file path). The `agent:` input remains
the same. All other inputs are unchanged. Environment variables are unchanged.

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
> try to install and configure it in a fresh project. Do not clone the monorepo —
> install from npm. Write notes about your experience in ./notes/.

### `scenarios/guide-setup/supervisor/CLAUDE.md`

Encodes the supervisor's judgement rules:

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

In practice, the supervisor can also run from the monorepo root (`--supervisor-cwd=.`)
to inherit the full project context. The purpose-built directory is for fully
isolated scenarios.

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

## Step 12 — Remove old action

**Deleted:** `.github/actions/claude/action.yml`

Only after all workflows have been migrated and verified. This is the last step
to avoid breaking CI during the transition.

## Blast Radius

### New files

| File | Purpose |
| ---- | ------- |
| `libraries/libeval/src/agent-runner.js` | AgentRunner class |
| `libraries/libeval/src/supervisor.js` | Supervisor class |
| `libraries/libeval/src/commands/run.js` | `run` command handler |
| `libraries/libeval/src/commands/supervise.js` | `supervise` command handler |
| `libraries/libeval/test/agent-runner.test.js` | AgentRunner tests |
| `libraries/libeval/test/supervisor.test.js` | Supervisor tests |
| `.github/actions/fit-eval/action.yml` | New composite action |
| `.github/tasks/*.md` (7 files) | Task files for CI workflows |
| `scenarios/guide-setup/task.md` | Guide scenario task |
| `scenarios/guide-setup/supervisor/CLAUDE.md` | Supervisor context |
| `scenarios/guide-setup/agent/CLAUDE.md` | Agent context |

### Modified files

| File | Change |
| ---- | ------ |
| `libraries/libeval/package.json` | Add Agent SDK dependency |
| `libraries/libeval/bin/fit-eval.js` | Register `run` and `supervise` commands |
| `libraries/libeval/index.js` | Export AgentRunner and Supervisor |
| `.github/workflows/security-audit.yml` | Migrate to fit-eval action |
| `.github/workflows/product-backlog.yml` | Migrate to fit-eval action |
| `.github/workflows/product-feedback.yml` | Migrate to fit-eval action |
| `.github/workflows/improvement-coach.yml` | Migrate to fit-eval action |
| `.github/workflows/dependabot-triage.yml` | Migrate to fit-eval action |
| `.github/workflows/release-readiness.yml` | Migrate to fit-eval action |
| `.github/workflows/release-review.yml` | Migrate to fit-eval action |

### Deleted files

| File | Reason |
| ---- | ------ |
| `.github/actions/claude/action.yml` | Replaced by fit-eval action |

## Ordering

Steps 1–7 can be implemented and tested locally without affecting CI. Steps
8–10 (action + migration) should be done in a single commit to avoid a state
where some workflows use the old action and some use the new one. Step 11 (Guide
scenario) is independent and can land separately. Step 12 (delete old action)
lands after migration is verified.

Recommended commit sequence:

1. Steps 1–7: `feat(libeval): add AgentRunner, Supervisor, and run/supervise commands`
2. Steps 8–10: `feat(ci): migrate workflows from claude action to fit-eval action`
3. Step 11: `feat(eval): add Guide setup supervised evaluation scenario`
4. Step 12: `chore(ci): remove deprecated .github/actions/claude/`
