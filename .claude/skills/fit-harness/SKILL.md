---
name: fit-harness
description: >
  Prove whether agent changes improved outcomes with reproducible
  evidence. Use when an eval passes locally but fails in CI and the only
  output is 'assertion failed', when you need a pass/fail verdict from a
  judge agent, or when coordinating multiple specialist agents in one
  session. Pair with `fit-trace` for trace analysis.
---

# fit-harness

`fit-harness` is the plumbing for running agents and capturing what they did. It
orchestrates the run; `fit-trace` analyzes what happened. The boundary between
the two is a single NDJSON trace file.

The same plumbing serves two parallel use cases.

## Two Use Cases

### 1. Agent evaluations

A **judge agent** observes a **target agent** via `fit-harness supervise`. The
judge signals the verdict by calling `Conclude`; the exit code (`0` pass, `1`
fail) makes the eval surface as a regular CI check. The trace captures the full
session for inspection. (In CLI flag names, _supervisor_ = judge, _agent_ =
target.)

→
[Run an Eval guide](https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md)

### 2. Agent collaboration

A **facilitator** coordinates **N participant agents** via
`fit-harness facilitate`. Participants and the facilitator pass targeted
messages with `Ask`/`Answer` and broadcast with `Announce`; the facilitator ends
the session with `Conclude`. The trace records every message and tool call.

→
[Prove Agent Changes guide](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)

`run` is the autonomous building block under both — a single agent on a defined
task, no supervisor or facilitator.

## Modes at a Glance

| Mode         | Shape                                     | Pick when                                                        |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| `run`        | One agent, autonomous                     | Task is well-scoped and you trust the agent to finish unattended |
| `supervise`  | Supervisor + agent, relay loop            | A second model should observe and intervene during the run       |
| `facilitate` | Facilitator + N participants, message bus | The work needs multiple specialists coordinating in one session  |

## CLI

Install and run via npm:

```sh
npx fit-harness <command> [options]
```

The full flag surface — execution commands, shared options, mode-specific
options, and output commands — lives in [references/cli.md](references/cli.md).

## Orchestration Tools

In `supervise` and `facilitate` modes, agents coordinate via tool calls instead
of free-form chat. The same tools serve both use cases — verdict signaling for
evaluations, message passing for collaboration. The trace records each call.

| Tool       | Caller                   | Effect                                                                                                                                |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Ask`      | Any                      | Send a question to a participant (or omit `to` to broadcast); blocks until the reply arrives. The `tool_result` carries the answer(s) |
| `Answer`   | Any                      | Reply to an `Ask` addressed to you. Quote `askId` from the `[ask#N]` tag — optional when only one ask is owed                         |
| `Announce` | Any                      | Broadcast a message with no reply expected                                                                                            |
| `Conclude` | Supervisor / facilitator | End the session with a verdict and summary                                                                                            |
| `RollCall` | Any                      | List the participants currently in the session                                                                                        |

Tool surface is uniform across modes: leads (supervisor, facilitator,
discuss-lead) use `Ask`/`Answer`/`Announce`/`Conclude`/`RollCall`;
participants use the same set minus `Conclude` (discuss-lead also gets
`RequestForComment`/`Recess`/`Adjourn` in place of `Conclude`).

---

## Typical Workflow

```sh
# 1. Run an agent and save the trace
npx fit-harness run \
  --task-file task.md \
  --model opus \
  --output trace.ndjson

# 2. Read the trace as text for a quick sanity check
npx fit-harness output --format=text < trace.ndjson

# 3. Hand off to fit-trace for structured analysis
npx fit-trace overview --file trace.ndjson
```

For a supervised run, swap `run` for `supervise` and add a supervisor profile:

```sh
npx fit-harness supervise \
  --task-file task.md \
  --lead-profile reviewer \
  --agent-profile coder \
  --output trace.ndjson
```

For a multi-agent session, use `facilitate` and list the participants:

```sh
npx fit-harness facilitate \
  --task-file task.md \
  --agent-profiles "security-engineer,technical-writer" \
  --output trace.ndjson
```

---

## Handing Off to `fit-trace`

Every `fit-harness` execution command produces NDJSON. Once it's on disk, the
work shifts from running to understanding — that's where `fit-trace` takes over.
Use `fit-trace overview`, `timeline`, `errors`, and `stats` (cross-trace verbs
take `--file`; `search` takes a positional file) against the same trace to study
what the agent did and why. These print text by default; add `--format json` for
a machine-parseable envelope.

The `fit-harness` skill stops at the trace file. The `fit-trace` skill picks up
from there.

---

## Documentation

- [Coordinate an Agent Team](https://www.forwardimpact.team/docs/libraries/coordinate-team/index.md)
  — Run a lead and N participant agents in one async session — supervise,
  facilitate, or discuss — with Ask/Answer/Announce and a single NDJSON trace.
- [Run an Eval](https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md)
  — Author a judge profile, run an eval locally, wire it into CI, and inspect
  the resulting trace.
- [Prove Agent Changes](https://www.forwardimpact.team/docs/libraries/prove-changes/index.md)
  — End-to-end workflow from dataset generation through evaluation to trace
  analysis, including multi-agent collaboration sessions.
- [Analyze Traces](https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md)
  — Read the NDJSON traces produced by `fit-harness` with `fit-trace` —
  grounded-theory method and worked examples.
- [Agent Teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md)
  — How to author the agent and lead profiles that
  `--agent-profile`, `--lead-profile`, and
  `--agent-profiles` consume.
