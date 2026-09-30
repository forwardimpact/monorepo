---
title: Run an Eval
description: Run an agent-as-judge eval in CI and get a traceable verdict on whether an agent change improved outcomes.
---

You changed an agent profile, a tool allowlist, or a system prompt. Now you
need to know whether things got better or worse. `gemba-harness supervise`
runs a **judge agent** next to a **target agent** on a shared orchestration
loop. The judge sends `Ask` questions, the target replies with `Answer`, and
the judge calls `Conclude` with a verdict when it is satisfied. GitHub Actions
treats the exit code (`0` pass, `1` fail) like any other check, and the NDJSON
trace captures every turn so that you can inspect what happened with
`gemba-trace`.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the environment
- The `gemba-*` commands, which include `gemba-harness` and `gemba-trace`.
  Install them globally with `npm install -g @forwardimpact/gemba`, or run
  one in CI with `npx --yes gemba-harness ...` and no global install

## Write the task

A task file is a plain markdown prompt that says what the target agent should
do. Keep it specific and measurable.

```md
<!-- evals/refactor-utils/task.md -->
Refactor `src/utils/format.js` so that `formatDate` and `formatCurrency`
share a single locale-resolution helper. Do not change the public API of
either function. Add unit tests covering the en-US, en-GB, and de-DE
locales. Run the test suite and confirm it passes before finishing.
```

## Write the judge profile

The judge is an agent profile at `.claude/agents/<name>.md`. The runtime
appends an orchestration trailer that explains the available tools, so your
profile only needs to define **what good looks like**.

```md
<!-- .claude/agents/refactor-judge.md -->
---
name: refactor-judge
description: Judge a refactor of shared formatting utilities.
---

You are evaluating a refactor of `src/utils/format.js`. Watch the agent's
work and call `Conclude` when the session is finished.

Pass criteria. All of them must hold:

- `formatDate` and `formatCurrency` share a single locale-resolution helper.
- The public signatures of both functions are unchanged.
- New tests exist for en-US, en-GB, and de-DE.
- The full test suite passes on the agent's final run.

If the agent strays, send a fresh `Ask` to redirect it. Each `Ask` gets a
new `askId`, so a follow-up question coexists with any in-flight ones. If
it claims to be done, verify the criteria yourself with `Read` and `Bash`
before calling `Conclude`. Conclude with `verdict: "failure"` if any
criterion fails. Include a one-paragraph summary of the gap.
```

Give the judge read-only tools with `--supervisor-allowed-tools` (typically
`Read,Grep,Bash`). A judge with `Edit` access can rewrite the target's work
and hide failures.

## Run the eval locally

```sh
npx gemba-harness supervise \
  --task-file=evals/refactor-utils/task.md \
  --lead-profile=refactor-judge \
  --supervisor-cwd=. \
  --supervisor-allowed-tools=Read,Grep,Bash \
  --agent-cwd=/tmp/refactor-sandbox \
  --max-turns=200 \
  --output=trace--default.raw.ndjson
```

`--agent-cwd` should be a sandbox copy of your repository, because the target
agent edits files there. When you omit it, `gemba-harness` creates a temporary
directory. The judge stays in `--supervisor-cwd`, where it inspects the
target's work without writing to it. `--max-turns` is the turn budget for
each runner (default `200`). A separate internal cap on lead turns bounds the
orchestration loop between the judge and the agent. `--max-turns=0` removes
the cap on each runner.

Exit code `0` means the judge concluded with `success: true`. Exit code `1`
means the judge concluded with `success: false`, the run reached the turn
limit, or an error occurred.

## Run the eval in GitHub Actions

A two-step workflow is enough. Run the eval, then split and upload the trace.

```yaml
# .github/workflows/eval.yml
name: Agent eval

on:
  push:
    branches: [main]
  pull_request:

jobs:
  refactor-utils:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Run eval
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          mkdir -p /tmp/sandbox /tmp/trace
          cp -r . /tmp/sandbox
          npx --yes gemba-harness supervise \
            --task-file=evals/refactor-utils/task.md \
            --lead-profile=refactor-judge \
            --supervisor-cwd=. \
            --supervisor-allowed-tools=Read,Grep,Bash \
            --agent-cwd=/tmp/sandbox \
            --max-turns=200 \
            --output=/tmp/trace/trace--default.raw.ndjson

      - name: Split trace
        if: always()
        run: |
          npx --yes gemba-trace split \
            /tmp/trace/trace--default.raw.ndjson \
            --mode=supervise \
            --case=default \
            --output-dir=/tmp/trace

      - name: Upload trace
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: trace--default
          path: /tmp/trace/trace--*.ndjson
```

`if: always()` on the split and upload steps preserves the trace even when the
eval fails, which is when you need it most.
`split --mode=supervise --case=default` produces
`trace--default--agent.agent.ndjson` and
`trace--default--supervisor.supervisor.ndjson` next to the original
`trace--default.raw.ndjson`.

## Read the results

When an eval fails, download the artifact. Start with `overview` and
`timeline` to get oriented, then drill into the verdict. The download
extracts the artifact's `.ndjson` members. Here that is the raw trace plus
the two split lanes, and every verb reads them directly.

```sh
npx gemba-trace runs                              # find the failed run
npx gemba-trace download <run-id>                 # extracts the .ndjson members
npx gemba-trace overview --file trace--default--agent.agent.ndjson
npx gemba-trace timeline --file trace--default--agent.agent.ndjson
npx gemba-trace tool trace--default--supervisor.supervisor.ndjson Conclude
```

Cross-trace verbs (`overview`, `timeline`, …) take their file through `--file`
and print text by default. `tool` works on a single trace, so it takes a
positional argument. Add `--format json` to any verb for the machine-parseable
shape. The download produces a `structured.json` only when the artifact has a
single `.ndjson` member. The verbs read multi-member bundles like this one
as they are.

The `Conclude` tool call holds the judge's verdict and summary. From there,
follow the timeline backwards to find the turn where the agent went wrong.

Run `npx gemba-trace --help` for the full command surface.

## Benchmark-driven evals

A workflow that calls the reusable benchmark workflow
(`forwardimpact/benchmark/.github/workflows/benchmark.yml`) mints `trace--*`
artifacts on every shard. The caller adds no steps, and it needs no manual
split or upload step like the harness-driven example above. Each cell
preserves its traces under `runs/<taskId>/<runIndex>/`. The cell holds the
raw combined trace (`trace--<case>.raw.ndjson`), the agent and supervisor
lanes, and a judge lane on judged cells. The `<case>` value is
`<taskId>-r<runIndex>`. Download and analyze the files with the same `runs` /
`find` / `download` flow. See the
[trace analysis guide](/docs/prove-changes/trace-analysis/).

## Scale to a suite

Each eval is a `task.md` plus a judge profile. Add a matrix to run them all:

```yaml
strategy:
  fail-fast: false
  matrix:
    eval:
      - { task: refactor-utils, judge: refactor-judge }
      - { task: fix-flaky-test, judge: test-judge }
      - { task: add-rate-limiter, judge: ratelimit-judge }
```

`fail-fast: false` makes sure that every eval runs and produces a trace, so
the run does not stop at the first failure.

## Tips

- **`--max-turns=0`** removes the turn cap on each runner. The orchestration
  loop's internal cap on lead turns still applies. Use it for exploratory
  local runs, and always set a real budget in CI.
- **`--task-amend`** appends extra text to the task and leaves the task file
  unchanged. This helps you parameterize the same task across a matrix.
- **The judge profile is a system prompt.** It steers the judge but does not
  bind it. Treat an eval verdict like a code review from a strong but fallible
  reviewer. It gives a useful signal, but you cannot treat it as ground truth.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../run-benchmark -->
<!-- part:card:../trace-analysis -->

</div>
