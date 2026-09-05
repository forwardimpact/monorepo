---
title: "Getting Started: Your First Trace"
description: "Install the Gemba skill pack and the gemba-* command family, run one agent session, and read the NDJSON trace it captured."
---

Gemba is the agent-runtime platform. It runs one loop: stand up, run, see,
remember, and measure. This page covers the first three steps. You start with
nothing installed and you finish with one captured trace you can read.

## Prerequisites

- Node.js 22+ and npm
- An Anthropic API key
- The `apm` agent package manager in your terminal
- An empty scratch directory, because the agent writes files where it runs

Put the key in the environment before the first run:

```sh
export ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

## Install the skill pack

The pack carries the seven platform skills. They teach a coding agent the command
family and the published actions.

```sh
apm install forwardimpact/gemba-skills
```

## Install the command family

One npm package ships every `gemba-*` command:

```sh
npm install -g @forwardimpact/gemba
gemba-harness --help
```

To run one command without a global install, call it through `npx`:

```sh
npx gemba-harness --help
```

The steps below use `npx`. Drop that prefix if you installed the package
globally.

## Write the task

A task is a plain markdown file. It states what the agent must do. Keep the
first one small and checkable.

```md
<!-- first-task.md -->
Create a file named `greeting.js` in the current directory. Export one
function `greet(name)` that returns the string `Hello, <name>!`. Then create
`greeting.test.js` with one `node:test` case that checks `greet("world")`.
Create no other file.
```

## Run one session

`gemba-harness run` gives the task to a single agent and lets it work alone.
Run this from your scratch directory:

```sh
npx gemba-harness run \
  --task-file=first-task.md \
  --cwd=. \
  --allowed-tools=Read,Glob,Grep,Write \
  --max-turns=20 \
  --output=trace.ndjson
```

Readable text streams to your terminal while the raw NDJSON trace lands in
`trace.ndjson`. Each flag does one thing:

- `--task-file` names the markdown task. `--task-text` takes the prompt inline
  instead.
- `--cwd` is the directory the agent works in. Keep it a scratch directory.
- `--allowed-tools` is the tool allowlist. The default also allows `Bash`,
  `Edit`, `Agent`, and `TodoWrite`, so this run is deliberately narrower.
- `--max-turns` caps the agentic turns. The default is 50, and `0` removes the
  cap.
- `--output` writes the trace to a file. Without the flag, the NDJSON goes to
  stdout.

The command exits `0` when the session succeeded. It exits `1` when the session
errored. Add `--agent-model` to run a different Claude model.

## Read the trace

`gemba-trace` queries the file `gemba-harness` wrote. Start with the overview:

```sh
npx gemba-trace overview --file trace.ndjson
```

```text
metadata: {"timestamp":"2026-08-26T09:14:02.118Z","sessionId":"b7c1a0d2","model":"claude-opus-4-8[1m]","claudeCodeVersion":"2.0.31"}
summary: {"result":"success","isError":false,"totalCostUsd":0.0412,"durationMs":41883,"numTurns":6}
turnCount: 11
resultEventTurns: 6
turnPopulations: {"turnCount":"rendered-trace-turns","resultEventTurns":"result-event-turns"}
tools: [{"tool":"Write","count":2},{"tool":"Read","count":1}]
taskPrompt: Create a file named greeting.js in the current directory.
```

Every object value prints on one line. This sample omits some lines.
`turnCount` counts the turns the trace holds. `resultEventTurns` counts the
turns the model reported. Add `--format json` for the machine-readable shape.

## Run the same loop in CI

The
[`forwardimpact/gemba-bootstrap`](https://github.com/forwardimpact/gemba-bootstrap)
action installs the pinned toolchain and the platform CLIs on a GitHub Actions
runner. Name the commands you need in its `clis` input. Pin the action to a
full commit SHA. Read
[Automate with GitHub Actions](/docs/prove-changes/run-benchmark/ci-workflow/)
for a complete workflow.

## Verify

Your first trace is good when all of the following hold.

- **The session exited `0`.** Run `echo $?` straight after the harness command.
- **The trace parses.** `npx gemba-trace count --file trace.ndjson` prints an
  integer turn count above zero. The reader skips an unparseable line silently,
  so a count well below the turns you expected is the signal that a line is
  malformed.
- **The overview reports success.** The `summary` line carries
  `"result":"success"` and `"isError":false`.
- **The agent stayed inside the allowlist.** The `tools` line names `Write` and
  names nothing you left out of `--allowed-tools`.
- **The work landed.** Your scratch directory holds `greeting.js` and
  `greeting.test.js`.

## What's next

<div class="grid">

<!-- part:card:../coordinate-team -->
<!-- part:card:../prove-changes -->
<!-- part:card:../prove-changes/run-eval -->
<!-- part:card:../prove-changes/trace-analysis -->
<!-- part:card:../predictable-team -->

</div>
