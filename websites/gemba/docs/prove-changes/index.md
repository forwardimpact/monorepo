---
title: Prove Agent Changes
description: Reproducible evidence that agent changes improved outcomes, from the eval session through the trace analysis.
---

You changed an agent profile, tightened a tool allowlist, or rewrote a system
prompt. The question is whether the change helped. To answer that question you
need a session that captures every turn. You also need an analysis method that
connects observed behavior to actionable findings. This guide runs the eval with
`gemba-harness`. It then hands off to `gemba-trace` so you can read the traces.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the shell (`gemba-harness` reads it)
- A repository where agents will work
- The `gemba-*` command family. Install it once:

```sh
npm install -g @forwardimpact/gemba
```

Or invoke each command ephemerally with `npx`:

```sh
npx gemba-harness --help
npx gemba-trace --help
```

An eval also needs content for the agent to work on. A small repository with
real files is enough for a first run. For a larger environment, generate a
synthetic one and regenerate it when the schema changes. See
[Generate a Synthetic Dataset](https://www.forwardimpact.team/docs/libraries/generate-dataset/)
on the Forward Impact site.

## 1. Write the eval task and profiles

Write the task file and the agent profiles that exercise the change you want to
evaluate. The task is a markdown prompt. The profiles live under
`.claude/agents/`. The [Run an Eval](/docs/prove-changes/run-eval/) guide walks
one judge profile line by line.

A task that evaluates a refactored formatting utility:

```md
<!-- evals/refactor-utils/task.md -->
Refactor `src/utils/format.js` so that `formatDate` and `formatCurrency`
share a single locale-resolution helper. Do not change the public API of
either function. Add unit tests covering the en-US, en-GB, and de-DE
locales. Run the test suite and confirm it passes before finishing.
```

A judge profile for supervised evaluation:

```md
<!-- .claude/agents/refactor-judge.md -->
---
name: refactor-judge
description: Evaluate a refactor of shared formatting utilities.
---

You are evaluating a refactor of `src/utils/format.js`. Watch the agent's
work and call `Conclude` when the session is finished.

Pass criteria -- all must hold:

- `formatDate` and `formatCurrency` share a single locale-resolution helper.
- The public signatures of both functions are unchanged.
- New tests exist for en-US, en-GB, and de-DE.
- The full test suite passes on the agent's final run.

If the agent strays, send a fresh `Ask` to redirect it -- each `Ask` gets a
new `askId`, so a follow-up coexists with any in-flight ones. If it claims
to be done, verify the criteria yourself with `Read` and `Bash` before
calling `Conclude`. Conclude with `verdict: "failure"` if any criterion fails;
include a one-paragraph summary of the gap.
```

For facilitated sessions with multiple specialists, write a facilitator profile
and one profile per participant. Each participant only needs to describe its
specialism. The runtime appends the orchestration tools (`Ask`, `Answer`,
`Announce`, `RollCall`, `Conclude`) automatically.

```md
<!-- .claude/agents/release-facilitator.md -->
---
name: release-facilitator
description: Coordinate a release-readiness review across specialist agents.
---

You are facilitating a release-readiness review. The participants are
`security-engineer`, `release-engineer`, and `technical-writer`.

1. `Announce` the goal: confirm whether the current release is ready to ship.
2. `Ask` each participant for their go/no-go, one at a time.
3. If any participant reports a blocker, `Announce` the blocker so the
   others can react, then ask whether they want to revise their position.
4. `Conclude` with `verdict: "success"` if all three are go; otherwise
   `verdict: "failure"` with a one-paragraph summary of the blocker.
```

## 2. Run the eval

For a **supervised evaluation** (one agent, one judge):

```sh
npx gemba-harness supervise \
  --task-file=evals/refactor-utils/task.md \
  --lead-profile=refactor-judge \
  --supervisor-cwd=. \
  --supervisor-allowed-tools=Read,Grep,Bash \
  --agent-cwd=/tmp/refactor-sandbox \
  --allowed-tools=Read,Edit,Write,Bash,Grep,Glob \
  --max-turns=200 \
  --output=trace--demo.raw.ndjson
```

`--max-turns` is the per-runner invocation budget for both the judge and the
agent. An internal lead-turn cap separately bounds the orchestration loop that
drives the supervisor↔agent exchange. `0` removes the per-runner cap. Exit code
`0` means the judge concluded with `success: true`. Exit code `1` means it
concluded `success: false`, ran out of turns, or errored.

For a **facilitated session** (one facilitator, N participants):

```sh
npx gemba-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=release-facilitator \
  --facilitator-cwd=. \
  --agent-profiles=security-engineer,release-engineer,technical-writer \
  --agent-cwd=. \
  --max-turns=200 \
  --output=trace--demo.raw.ndjson
```

Participants share `--agent-cwd` by default. If two participants might edit the
same file, give each its own working directory. Or restrict tool allowlists so
only one participant can write. `--max-turns` applies uniformly to the
facilitator and to every participant. Always set a budget so a stuck
participant cannot run the session indefinitely. The CLI default is `20`. Raise
it for sessions that do real implementation work.

For a **threaded discussion** (Chair + N participants, suspendable across a
bridged channel), use `gemba-harness discuss`. It accepts the same lead and
agent flags. It also accepts `--discussion-id` and `--resume-context`.
`--discussion-id` is the stable thread identifier that traces carry.
`--resume-context` is the JSON-serialized prior state for a resumed run. A
bridge service relays the workflow callback when the conversation suspends and
re-enters. See
[Bridge Channels](https://www.forwardimpact.team/docs/libraries/bridge-channels/)
on the Forward Impact site for that surface.

Every mode accepts the task as one of three inputs (exactly one required):
`--task-file=<path>`, `--task-text="<inline>"`, or
`--task-event=<path>` for a native GitHub event payload.
Every agent in the session sees the `--task-file` content as the opening
prompt. The facilitator profile steers how the session pursues the goal. The
participants apply their specialisms.

## 3. Verify the trace

After the run, confirm the trace file exists and contains the expected structure
before you invest time in analysis:

```sh
npx gemba-trace overview --file trace--demo.raw.ndjson
npx gemba-trace timeline --file trace--demo.raw.ndjson
npx gemba-trace stats --file trace--demo.raw.ndjson
```

`overview` reports metadata, turn count, and tool usage frequency. `timeline`
prints one line per turn so you can see the shape of the session at a glance.
`stats` breaks down token usage and cost. Cross-trace verbs take their files
through `--file` (repeat it, or pass a quoted glob). They print text by
default. Add `--format json` for the machine-parseable envelope.

For supervised and facilitated runs, split the combined trace into per-source
files:

```sh
npx gemba-trace split trace--demo.raw.ndjson --mode=supervise --case=demo
npx gemba-trace split trace--demo.raw.ndjson --mode=facilitate --case=demo
```

This produces files that follow the
`trace--<case>--<participant>.<role>.ndjson` convention. For `supervise`, you
get `trace--demo--agent.agent.ndjson` and
`trace--demo--supervisor.supervisor.ndjson`. For `facilitate`, you get
`trace--demo--facilitator.facilitator.ndjson` plus one
`trace--demo--<participant>.agent.ndjson` per participant. `--case` defaults
to `default`. Pass it to disambiguate matrix shards. Per-source traces are
essential when participants disagreed. You can read each one's view
independently.

## 4. Analyze traces for findings

The trace is qualitative data. The most useful analysis comes when you read the
trace like a researcher. A checklist does not produce it. Drill into specific
tools and message exchanges:

```sh
npx gemba-trace tool trace--demo.raw.ndjson Conclude
npx gemba-trace tool trace--demo.raw.ndjson Ask
npx gemba-trace tool trace--demo.raw.ndjson Announce
npx gemba-trace filter --file trace--demo.raw.ndjson --tool Edit
npx gemba-trace search trace--demo.raw.ndjson 'error|fail' --context 1
npx gemba-trace reasoning --file trace--demo.raw.ndjson
```

`tool` and `search` pin a single trace, so they take the file as a positional.
The cross-trace verbs (`filter`, `reasoning`, and the rest) take `--file`.

The `Conclude` call carries the verdict. Start there when an eval fails. Then
follow the timeline backwards. For facilitated sessions, walk `Announce`
(broadcasts) and `Ask`/`Answer` (targeted exchanges) to see how the
participants converged or where they diverged.

See the [Trace Analysis](/docs/prove-changes/trace-analysis/) guide
for the full analysis method. That method covers grounded-theory coding,
pattern identification, and how to write findings that are grounded, testable,
and actionable.

## What's next

<div class="grid">

<!-- part:card:run-eval -->
<!-- part:card:run-benchmark -->
<!-- part:card:trace-analysis -->
<!-- part:card:../coordinate-team -->
<!-- part:card:../predictable-team -->

</div>
