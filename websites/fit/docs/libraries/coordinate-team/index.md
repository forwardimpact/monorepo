---
title: Coordinate an Agent Team
description: Run a lead and N participant agents in one asynchronous session — supervise, facilitate, or discuss — with Ask/Answer/Announce message passing and a single NDJSON trace of everything that happened.
---

You have several agents, each good at one thing, and a task that needs more than
one of them. A single autonomous agent would have to be a generalist; what you
want instead is a lead that delegates and a set of specialists that each answer
in their own voice. `@forwardimpact/libharness` gives you that: one lead LLM
session coordinates N participant sessions over an in-memory message bus, every
message and tool call lands in one trace, and the whole exchange runs
asynchronously so nothing blocks while a participant works.

This guide covers coordination as a capability in its own right. If your goal is
to grade an agent change against pass/fail criteria, the same machinery powers
[Prove Agent Changes](/docs/libraries/prove-changes/) — start there instead.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` set in the shell
- Agent profiles under `.claude/agents/` for the lead and each participant (see
  [Agent Teams](/docs/products/agent-teams/) for authoring them)
- Install the library, or invoke it ephemerally:

```sh
npm install -g @forwardimpact/libharness
```

```sh
npx --yes @forwardimpact/libharness fit-harness --help
```

## Pick a coordination shape

Three subcommands of `fit-harness` share one orchestration loop and one tool
surface. They differ in who leads, how many participants there are, and how the
session ends.

| Shape        | Lead          | Participants | Ends with             | Reach for it when                                              |
| ------------ | ------------- | ------------ | --------------------- | ------------------------------------------------------------- |
| `supervise`  | supervisor    | one agent    | `Conclude`            | A second model should watch one agent and step in mid-run     |
| `facilitate` | facilitator   | N named      | `Conclude`            | The work needs several specialists coordinating in one sitting |
| `discuss`    | lead          | N named      | `Adjourn` or `Recess` | The session spans a human channel and may suspend and resume  |

`supervise` is a one-lead, one-participant relay. `facilitate` fans the lead out
to many named specialists. `discuss` is the suspendable sibling of `facilitate`:
it carries a stable thread id and can pause for an external reply, which makes it
the shape a chat-channel bridge drives. (`run` — a single agent with no lead — is
the autonomous building block under all three, but it does no coordination.)

## How the lead and participants take turns

Every coordinated session runs the same loop. The lead receives the task on its
first turn; each participant waits until a message lands on its inbox. From then
on, both sides repeat the same cycle: drain the inbox, run or resume the LLM with
the drained messages, then settle any questions they still owe an answer to.

The loop fans messages out over an in-memory bus and writes one
`{ source, seq, event }` NDJSON line for every tool call, bus message, and
orchestrator event. `seq` is monotonic across the whole session, so the trace is
a single ordered record of who did what and when.

The lead has no tools to do the work itself — it is wired with `Read`, `Glob`,
and `Grep` only, with `Bash`, `Edit`, `Write`, and sub-agent tools removed. It
exists to delegate. Participants carry whatever tool allowlist you grant them.

## Pass messages with Ask, Answer, and Announce

Coordination happens through three tools rather than free-form chat. The trace
records each call, so you can later read exactly how the team converged.

```text
Ask({ question, to? })       →  { askIds: [N, …] }
Answer({ message, askId? })  →  routed back to the asker
Announce({ message })        →  broadcast to everyone, no reply expected
```

**`Ask` is asynchronous.** It returns immediately with one `askId` per
addressee and registers a pending question. The lead can issue several `Ask`s in
one turn, end that turn, and plan in the gap while participants work in
parallel. Each reply arrives later on the asker's next turn as a tagged inbox
line:

```text
[ask#42]     facilitator: What is your current condition?
[answer#41]  agent-1:     We're at 7 out of 10.
[shared]     agent-2:     FYI I'm switching to Bun 1.2.
[system]     @orchestrator: You have an unanswered ask from facilitator (askId=42)…
```

**`Answer` routes by `askId`.** Quote the `N` from the `[ask#N]` tag so the
reply reaches the right asker. The `askId` is optional and the handler is
forgiving: if you owe exactly one answer it is auto-picked; if you owe none or
many and omit it, the message broadcasts as an Announce instead.

**Addressing.** On a multi-participant lead, omit `to` to broadcast an `Ask` to
everyone. The `supervise` pair has only one possible target, so passing `to`
there is rejected.

Every participant also has `RollCall` to list who is currently in the session.

## Keep the session from deadlocking

If a participant ends its turn while still owing an answer, the loop injects one
synthetic reminder and resumes it once. If the question is still unanswered after
the reminder, the loop emits a `protocol_violation` event and unblocks the asker
with a synthetic null answer — so a silent participant can never deadlock the
team. You will see both the reminder and any violation in the trace.

## End the session

Termination is explicit and mode-specific:

- **`Conclude`** ends a `supervise` or `facilitate` session with a `verdict`
  (`success` or `failure`) and a summary. It is available only to the lead.
- **`Adjourn`** ends a `discuss` session with a verdict (`adjourned` or
  `failed`), a summary, and an optional outcome.
- **`Recess`** suspends a `discuss` session with a resumption trigger instead of
  ending it, so a bridge can re-enter later.

Any of these cancels in-flight `Ask`s, so askers see why their question will go
unanswered rather than hanging. The loop then writes a terminal `summary` event
carrying the verdict and turn count, and the process exit code reflects it: `0`
when the lead concluded with success, `1` otherwise.

## Tool surface by role

| Role             | Ask | Answer | Announce | RollCall | Conclude | Also                              |
| ---------------- | --- | ------ | -------- | -------- | -------- | --------------------------------- |
| Supervisor       | ✓   | ✓      | ✓        | ✓        | ✓        |                                   |
| Supervised agent | ✓   | ✓      | ✓        | ✓        |          |                                   |
| Facilitator      | ✓   | ✓      | ✓        | ✓        | ✓        |                                   |
| Facilitated agent| ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`               |
| Discuss lead     | ✓   | ✓      | ✓        | ✓        |          | `Recess`, `Adjourn`, `Acknowledge`|
| Discuss agent    | ✓   | ✓      | ✓        | ✓        |          | `RequestForComment`, `Acknowledge`|

`RequestForComment` lets a participant queue an intent to open a new discussion
thread for a question that outlives the current session. In `discuss` mode,
`Acknowledge` posts a brief message straight to the thread (a status update or a
reply to a human follow-up) without discharging an owed Answer.

## Run a facilitated session

Write a facilitator profile and one profile per participant. Each participant
profile only needs to describe its specialism — the runtime appends the
coordination tools automatically. Then run:

```sh
npx fit-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=release-facilitator \
  --facilitator-cwd=. \
  --agent-profiles=security-engineer,release-engineer,technical-writer \
  --agent-cwd=. \
  --max-turns=200 \
  --output=trace--review.ndjson
```

The `--task-file` content is the opening prompt every participant sees. The
facilitator profile steers how the goal is pursued; each participant applies its
own specialism. Pass the task as exactly one of `--task-file=<path>`,
`--task-text="<inline>"`, or `--task-event=<path>` (a native GitHub event
payload).

Participants share `--agent-cwd` by default. If two might edit the same file,
give each its own working directory or restrict tool allowlists so only one can
write. `--max-turns` is applied uniformly to the lead and every participant —
always set a budget so a stuck participant cannot run the session forever. The
CLI default is `20`; raise it for sessions that do real implementation work.

## Run a supervised relay

For one agent watched by one lead, use `supervise`. The supervisor sees the
agent at each `Ask` boundary, plans the next step, and eventually calls
`Conclude`:

```sh
npx fit-harness supervise \
  --task-file=task.md \
  --lead-profile=reviewer \
  --agent-profile=coder \
  --supervisor-cwd=. \
  --agent-cwd=/tmp/sandbox \
  --allowed-tools=Read,Edit,Write,Bash,Grep,Glob \
  --max-turns=200 \
  --output=trace--relay.ndjson
```

For a tighter feedback loop, size the agent's per-turn budget down so each `Ask`
returns sooner.

## Run a suspendable discussion

`discuss` adds `--discussion-id` (the stable thread identifier carried through
the trace) and `--resume-context` (JSON-serialized prior state for a resumed
run). A bridge service relays the workflow callback when the conversation
suspends on a `Recess` and re-enters later. Each participant's `Answer` to the
lead is streamed to the thread as a separate reply as it is produced, not batched
at the end.

```sh
npx fit-harness discuss \
  --task-file=task.md \
  --lead-profile=release-engineer \
  --agent-profiles=staff-engineer,security-engineer \
  --discussion-id=GD_kwExample \
  --output=trace--discuss.ndjson
```

To wire a human channel into a discussion — webhook intake, callback tokens, and
the suspend/resume lifecycle — see
[Bridge a Threaded Channel to the Agent Team](/docs/libraries/bridge-channels/).

## Inspect the trace

Every coordinated run produces one NDJSON file. Read it as text for a quick
sanity check, then hand it to `fit-trace` for structured analysis:

```sh
npx fit-harness output --format=text < trace--review.ndjson
npx fit-trace overview --file trace--review.ndjson
npx fit-trace tool trace--review.ndjson Ask
npx fit-trace tool trace--review.ndjson Announce
```

`Ask`/`Answer` show the targeted exchanges and `Announce` shows the broadcasts,
so you can trace where participants converged or diverged. For the full reading
method, see [Analyze Traces](/docs/libraries/prove-changes/trace-analysis/).

## Redaction

Redaction is on by default for `supervise` and `facilitate`. It replaces
allowlisted environment-variable values (`ANTHROPIC_API_KEY`, `GH_TOKEN`,
`GITHUB_TOKEN` by default) and credential-shaped strings in the trace. Leave it
on for any run whose trace might be shared — workflow artifacts are downloadable
through retention.

## Verify

You have reached the outcome of this guide when:

- You can run a `facilitate` session with a lead profile and two or more named
  participant profiles, and it produces a single NDJSON trace.
- You can read the trace and see `Ask`/`Answer` exchanges routed by `askId`,
  `Announce` broadcasts, and a terminal `summary` event with the verdict.
- A `supervise` run exits `0` when the lead concludes with success and `1`
  otherwise.
- A `discuss` run carries your `--discussion-id` through the trace and ends on
  `Adjourn`, or suspends on `Recess` for a bridge to resume.

## What's next

<div class="grid">

<!-- part:card:../bridge-channels -->
<!-- part:card:../prove-changes -->

</div>
