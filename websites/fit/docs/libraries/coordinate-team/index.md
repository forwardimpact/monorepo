---
title: Coordinate an Agent Team
description: Run a lead and N participant agents in one asynchronous session. Choose supervise, facilitate, or discuss. Pass messages with Ask, Answer, and Announce. One NDJSON trace records everything that happened.
---

You have several agents, each good at one thing. You also have a task that needs
more than one of them. A single autonomous agent would have to be a generalist.
You want a lead that delegates and a set of specialists that each answer in
their own voice. `@forwardimpact/libharness` gives you that. One lead LLM
session coordinates N participant sessions over an in-memory message bus. Every
message and tool call lands in one trace. The exchange runs asynchronously, so
nothing blocks while a participant works.

This guide covers coordination as a capability in its own right. The same
machinery powers [Prove Agent Changes](/docs/libraries/prove-changes/). Start
there if your goal is to grade an agent change against pass/fail criteria.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the shell
- Agent profiles under `.claude/agents/` for the lead and each participant (see
  [Agent Teams](/docs/products/agent-teams/) to learn how to author them)
- Install the library, or invoke it ephemerally:

```sh
npm install -g @forwardimpact/libharness
```

```sh
npx --yes @forwardimpact/libharness gemba-harness --help
```

## Pick a coordination shape

Three subcommands of `gemba-harness` share one orchestration loop and one tool
surface. They differ in who leads, how many participants there are, and how the
session ends.

| Shape        | Lead        | Participants | Ends with             | Reach for it when                                               |
| ------------ | ----------- | ------------ | --------------------- | --------------------------------------------------------------- |
| `supervise`  | supervisor  | one agent    | `Conclude`            | A second model should watch one agent and step in mid-run       |
| `facilitate` | facilitator | N named      | `Conclude`            | The work needs several specialists to coordinate in one sitting |
| `discuss`    | lead        | N named      | `Adjourn` or `Recess` | The session spans a human channel and may suspend and resume    |

`supervise` is a one-lead, one-participant relay. `facilitate` fans the lead out
to many named specialists. `discuss` is the suspendable sibling of `facilitate`.
It carries a stable thread id. It can pause for an external reply, which makes
it the shape a chat-channel bridge drives. `run` is a single agent with no lead.
It is the autonomous building block under all three shapes. It does no
coordination.

## How the lead and participants take turns

Every coordinated session runs the same loop. The lead receives the task on its
first turn. Each participant waits until a message lands on its inbox. From then
on, both sides repeat the same cycle: drain the inbox, run or resume the LLM
with the drained messages, then settle any questions they still owe an answer
to.

The loop fans messages out over an in-memory bus. It writes one
`{ source, seq, event }` NDJSON line for every tool call, bus message, and
orchestrator event. `seq` is monotonic across the whole session, so the trace is
a single ordered record of who did what and when.

The lead delegates the work. It does not do the work itself. In facilitate and
discuss runs the lead gets `Read`, `Glob`, and `Grep` only. It does not get
`Edit`, `Write`, or sub-agent tools. A supervise lead also gets `Bash` so it can
inspect the working tree between rounds. Participants carry whatever tool
allowlist you grant them.

## Pass messages with Ask, Answer, and Announce

Coordination happens through three tools. It does not happen through free-form
chat. The trace records each call, so you can later read exactly how the team
converged.

```text
Ask({ question, to? })       →  { askIds: [N, …] }
Answer({ message, askId? })  →  routed back to the asker
Announce({ message })        →  broadcast to everyone, no reply expected
```

**`Ask` is asynchronous.** It returns immediately with one `askId` per
addressee. It registers a pending question. The lead can issue several `Ask`s in
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
reply reaches the right asker. The `askId` is optional. The handler is
forgiving. If you owe exactly one answer, the handler picks it automatically. If
you owe none or many and you omit the `askId`, the message broadcasts as an
Announce instead.

**Addressees.** On a multi-participant lead, omit `to` to broadcast an `Ask` to
everyone. The `supervise` pair has only one possible target. The harness rejects
`to` there.

Every participant also has `RollCall` to list who is currently in the session.

## Prevent a session deadlock

If a participant ends its turn and still owes an answer, the loop injects one
synthetic reminder. The loop then resumes the participant once. If the question
is still unanswered after the reminder, the loop emits a `protocol_violation`
event. It also unblocks the asker with a synthetic null answer. A silent
participant can never deadlock the team. You will see both the reminder and any
violation in the trace.

## End the session

A session ends explicitly. The end tool depends on the mode:

- **`Conclude`** ends a `supervise` or `facilitate` session with a `verdict`
  (`success` or `failure`) and a summary. Only the lead can use it.
- **`Adjourn`** ends a `discuss` session with a verdict (`adjourned` or
  `failed`), a summary, and an optional outcome.
- **`Recess`** suspends a `discuss` session with a resumption trigger. It does
  not end the session, so a bridge can re-enter later.

Each of these tools cancels in-flight `Ask`s. Askers then see why their question
will go unanswered, and they do not hang. The loop writes a terminal `summary`
event with the verdict and the turn count. The process exit code reflects the
verdict. It is `0` when the lead concluded with success, and `1` otherwise.

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
reply to a human follow-up). It does not discharge an owed Answer.

## Consult an advisor

An advisor is a bounded, read-only, one-shot consult on a stronger model. An
agent participant sometimes hits a hard decision. Examples are an architectural
fork, an unclear root cause, and a trade-off it cannot rank. The agent then
calls the `Advisor` tool with one focused question. The harness forwards the
question to a fresh session on the advisor model. It also forwards the agent's
full session context (its system prompt, delivered prompts, and transcript so
far). That session can read files. It cannot write, execute, or spawn agents.
Its final text returns as the tool result. The caller stays in control of its
own loop.

Two flags enable it on `run`, `supervise`, `facilitate`, and `discuss`:

```sh
npx gemba-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=release-facilitator \
  --agent-profiles=security-engineer,release-engineer \
  --advisor-model="claude-opus-4-8[1m]" \
  --advisor-max-uses=3 \
  --output=trace.ndjson
```

Omit `--advisor-model` to disable the tool entirely. You then get no advisor
prompt text, no tool, and no cost. `--advisor-max-uses` (default 3) is a
session-wide budget. All participants share it, and the code enforces it. After
participants spend the budget, further consults return "proceed with your best
judgment". They do not start an advisor session. Consults are fail-open. A
consult that times out, errors, or is aborted resolves the same way. The
caller's session continues normally. Lead roles never get the tool. Only agent
participants get it.

Every consult is evident in the trace. An `advisor_consult` orchestrator event
records the caller, question, model, duration, and remaining budget. The advisor
session's own lines appear under a distinct `advisor` source. Those lines
include its result event with token usage and cost.

## Run a facilitated session

Write a facilitator profile and one profile per participant. Each participant
profile only needs to describe its specialism. The runtime appends the
coordination tools automatically. Then run:

```sh
npx gemba-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=release-facilitator \
  --facilitator-cwd=. \
  --agent-profiles=security-engineer,release-engineer,technical-writer \
  --agent-cwd=. \
  --max-turns=200 \
  --output=trace--review.ndjson
```

The `--task-file` content is the opening prompt every participant sees. The
facilitator profile steers how the team pursues the goal. Each participant
applies its own specialism. Pass the task as exactly one of
`--task-file=<path>`, `--task-text="<inline>"`, or `--task-event=<path>` (a
native GitHub event payload).

Participants share `--agent-cwd` by default. If two might edit the same file,
give each one its own working directory. You can instead restrict tool
allowlists so only one can write. `--max-turns` applies uniformly to the lead
and every participant. Always set a budget so a stuck participant cannot run
the session forever. The CLI default is `20`. Raise it for sessions that do
real implementation work.

## Run a supervised relay

When one lead watches one agent, use `supervise`. The supervisor sees the agent
at each `Ask` boundary, plans the next step, and eventually calls `Conclude`:

```sh
npx gemba-harness supervise \
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

`discuss` adds two flags. `--discussion-id` is the stable thread identifier
carried through the trace. `--resume-context` holds JSON-serialized prior state
for a resumed run. A bridge service relays the workflow callback when the
conversation suspends on a `Recess` and re-enters later. Each participant's
`Answer` to the lead streams to the thread as a separate reply as the
participant produces it. The harness does not batch the replies at the end.

```sh
npx gemba-harness discuss \
  --task-file=task.md \
  --lead-profile=release-engineer \
  --agent-profiles=staff-engineer,security-engineer \
  --discussion-id=GD_kwExample \
  --output=trace--discuss.ndjson
```

See
[Bridge a Threaded Channel to the Agent Team](/docs/libraries/bridge-channels/)
to wire a human channel into a discussion. That guide covers webhook intake,
callback tokens, and the suspend/resume lifecycle.

## Inspect the trace

Every coordinated run produces one NDJSON file. Read it as text for a quick
sanity check. Then hand it to `gemba-trace` for structured analysis:

```sh
npx gemba-harness output --format=text < trace--review.ndjson
npx gemba-trace overview --file trace--review.ndjson
npx gemba-trace tool trace--review.ndjson Ask
npx gemba-trace tool trace--review.ndjson Announce
```

`Ask`/`Answer` show the targeted exchanges and `Announce` shows the broadcasts,
so you can trace where participants converged or diverged. See
[Analyze Traces](/docs/libraries/prove-changes/trace-analysis/) for the full
method to read a trace.

## Redaction

Redaction is on by default across `supervise`, `facilitate`, and `discuss`. It
replaces allowlisted environment-variable values (`ANTHROPIC_API_KEY`,
`GH_TOKEN`, `GITHUB_TOKEN`, and more) and credential-shaped strings in the
trace. Leave it on for any run whose trace might be shared. Workflow artifacts
stay downloadable through retention.

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
