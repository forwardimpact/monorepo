---
title: Coordinate an Agent Team
description: Run a lead and N participant agents in one asynchronous session. Choose supervise, facilitate, or discuss. Pass messages with Ask, Answer, and Announce. One NDJSON trace records everything that happened.
---

You have several agents, and each one is good at one thing. You also have a
task that needs more than one of them. A single autonomous agent would have to
do everything itself. Instead, you want a lead that delegates and a set of
specialists that each answer in their own voice.

`gemba-harness` gives you that. One lead LLM session coordinates N participant
sessions over an in-memory message bus. Every message and tool call goes into
one trace. The exchange runs asynchronously, so nothing blocks while a
participant works.

This guide covers coordination on its own. The same machinery powers
[Prove Agent Changes](/docs/prove-changes/). Start there if your goal is to
grade an agent change against pass/fail criteria.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the shell
- Agent profiles under `.claude/agents/` for the lead and each participant (see
  [Agent Teams](https://www.forwardimpact.team/docs/products/agent-teams/) to
  learn how to author them)
- Install the command family, or invoke one command ephemerally:

```sh
npm install -g @forwardimpact/gemba
```

```sh
npx gemba-harness --help
```

## Pick a coordination shape

Three subcommands of `gemba-harness` share one orchestration loop and one tool
surface. They differ in who leads, how many participants there are, and how the
session ends.

| Shape        | Lead        | Participants | Ends with             | Use it when                                                     |
| ------------ | ----------- | ------------ | --------------------- | --------------------------------------------------------------- |
| `supervise`  | supervisor  | one agent    | `Conclude`            | A second model should watch one agent and step in mid-run       |
| `facilitate` | facilitator | N named      | `Conclude`            | The work needs several specialists to coordinate in one sitting |
| `discuss`    | lead        | N named      | `Adjourn` or `Recess` | The session spans a human channel and may suspend and resume    |

`supervise` pairs one lead with one participant. `facilitate` connects the lead
to many named specialists. `discuss` works like `facilitate`, but it can
suspend and resume. It has a stable thread id, and it can pause for an
external reply, which makes it the right shape for a chat-channel bridge to
drive. `run` is a single agent with no lead and no coordination. It is the
building block under all three shapes.

## How the lead and participants take turns

Every coordinated session runs the same loop. The lead receives the task on its
first turn, and each participant waits until a message arrives in its inbox.
From then on, both sides repeat the same cycle: each drains its inbox, runs or
resumes the LLM with the drained messages, and then settles any question it
still owes an answer to.

The loop sends messages over an in-memory bus. It writes one
`{ source, seq, event }` NDJSON line for every tool call, bus message, and
orchestrator event. `seq` increases across the whole session, so the trace is
a single ordered record of who did what and when.

The lead only delegates the work. In facilitate and discuss runs the lead gets
`Read`, `Glob`, and `Grep`, with no `Edit`, `Write`, or sub-agent tools. A
supervise lead also gets `Bash` so that it can inspect the working tree
between rounds. Participants get whatever tool allowlist you grant them.

## Pass messages with Ask, Answer, and Announce

All coordination goes through three tools, and agents do not use free-form
chat. The trace records each call, so you can read later exactly how the team
reached its result.

```text
Ask({ question, to? })       →  { askIds: [N, …] }
Answer({ message, askId? })  →  routed back to the asker
Announce({ message })        →  broadcast to everyone, no reply expected
```

**`Ask` is asynchronous.** It returns immediately with one `askId` per
addressee and registers a pending question. The lead can issue several `Ask`s
in one turn, end that turn, and plan while participants work in parallel. Each
reply arrives later on the asker's next turn as a tagged inbox line:

```text
[ask#42]     facilitator: What is your current status?
[answer#41]  agent-1:     I finished 7 of the 10 checks.
[shared]     agent-2:     FYI I am editing the shared config file.
[system]     @orchestrator: You have an unanswered ask from facilitator (askId=42)…
```

**`Answer` routes by `askId`.** Quote the `N` from the `[ask#N]` tag so that
the reply reaches the right asker. The `askId` is optional. If you owe exactly
one answer, the handler selects it for you. If you owe none or several and you
omit the `askId`, the message broadcasts as an Announce instead.

**Addressees.** On a multi-participant lead, omit `to` to broadcast an `Ask` to
everyone. The `supervise` pair has only one possible target, so the harness
rejects `to` there.

Every participant also has `RollCall` to list who is currently in the session.

## Prevent a session deadlock

If a participant ends its turn and still owes an answer, the loop injects one
synthetic reminder and resumes the participant once. If the question is still
unanswered after the reminder, the loop emits a `protocol_violation` event and
unblocks the asker with a synthetic null answer. A silent participant can
therefore never deadlock the team. You see both the reminder and any violation
in the trace.

## End the session

A session ends explicitly. The end tool depends on the mode:

- **`Conclude`** ends a `supervise` or `facilitate` session with a `verdict`
  and a summary. Only the lead can use it. A `supervise` lead picks `success`
  or `failure`. A `facilitate` lead picks `success`, `failure`, or
  `stand_down`.
- **`Adjourn`** ends a `discuss` session with a verdict (`adjourned`, `failed`,
  or `stand_down`), a summary, and an optional outcome.
- **`Recess`** suspends a `discuss` session with a resumption trigger. It does
  not end the session, so a bridge can re-enter later.

Each of these tools cancels in-flight `Ask`s. Askers then see why their question
gets no answer, and they do not hang. The loop writes a terminal `summary`
event with the verdict and the turn count. The process exit code follows the
verdict. It is `0` when the lead ended with `success`, `adjourned`, or
`stand_down`, and `1` otherwise.

`stand_down` means that the task asked for nothing. A `--task-event` task opens
with an actor line when the caller sets `KATA_ACTOR_CLASS` and
`KATA_ACTOR_LOGIN` in the environment: `Caused by: human (@alice).` A `self` or
`bot` class adds a stand-down instruction to the line. It asks the lead to
engage nobody unless the body hands new actionable work to a named agent, and to
end with `stand_down` otherwise. The caller classifies the actor, and
`gemba-harness` renders the class it receives. Only the lead reads the rule.
Participants carry no stand-down sentence. `gemba-trace overview` and
`gemba-trace cost` report the verdict apart from `success` and `failure`.

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
`Acknowledge` posts a brief message straight to the thread, for example a
status update or a reply to a human follow-up. It does not count as the Answer
the participant still owes.

## Consult an advisor

An advisor is a single read-only question to a stronger model. An agent
participant sometimes reaches a hard decision, such as an architectural fork,
an unclear root cause, or a trade-off it cannot rank. The agent then calls the
`Advisor` tool with one focused question.

The harness forwards the question to a fresh session on the advisor model. It
also forwards the agent's full session context (its system prompt, delivered
prompts, and transcript so far). That session can read files, but it cannot
write, execute, or spawn agents. Its final text returns as the tool result, and
the caller stays in control of its own loop.

Two flags enable it on `run`, `supervise`, `facilitate`, and `discuss`:

```sh
npx gemba-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=facilitator \
  --agent-profiles=security-reviewer,release-reviewer \
  --advisor-model="claude-opus-4-8[1m]" \
  --advisor-max-uses=3 \
  --output=trace.ndjson
```

If you omit `--advisor-model`, the tool is off. The session then has no
advisor prompt text, no tool, and no advisor cost. `--advisor-max-uses`
(default 3) is a budget for the whole session. All participants share it, and
the code enforces it. After participants spend the budget, further consults
return "proceed with your best judgment" and do not start an advisor session.

A failed consult does not stop the caller. A consult that times out, errors,
or stops early returns the same "proceed with your best judgment" text, and
the caller's session continues as normal. Only agent participants get the
tool. A lead role never gets it.

Every consult appears in the trace. An `advisor_consult` orchestrator event
records the caller, question, model, duration, and remaining budget. The
advisor session's own lines appear under a distinct `advisor` source, and they
include its result event with token usage and cost.

## Run a facilitated session

Write a facilitator profile and one profile per participant. Each participant
profile only needs to describe its specialism, because the runtime adds the
coordination tools for you. Then run:

```sh
npx gemba-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=facilitator \
  --facilitator-cwd=. \
  --agent-profiles=security-reviewer,release-reviewer,doc-reviewer \
  --agent-cwd=. \
  --max-turns=200 \
  --output=trace--review.ndjson
```

The `--task-file` content is the opening prompt of the facilitator.
Participants see only the messages that the facilitator sends them. The
facilitator profile steers how the team pursues the goal, and each participant
applies its own specialism. Pass the task as exactly one of
`--task-file=<path>`, `--task-text="<inline>"`, or `--task-event=<path>` (a
native GitHub event payload). A `--task-event` task can open with an actor line,
which [End the session](/docs/coordinate-team/#end-the-session) describes.

The profile names above are examples, and you choose your own. The
[Kata agent team](https://www.kata.team/) is the reference tenant for this
platform, and its profiles run through these same shapes.

Participants share `--agent-cwd` by default. If two of them might edit the
same file, give each one its own working directory, or restrict the tool
allowlists so that only one can write. `--max-turns` applies to the lead and to
every participant in the same way. Always set a budget so that a stuck
participant cannot run the session forever. The CLI default is `20`. Raise it
for sessions that do real implementation work.

## Run a supervised relay

When one lead watches one agent, use `supervise`. The supervisor sees the agent
at each `Ask` boundary, plans the next step, and calls `Conclude` when it is
done:

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

For faster feedback, lower the agent's turn budget so that each `Ask` returns
sooner.

## Run a suspendable discussion

`discuss` adds two flags. `--discussion-id` is the stable thread identifier
that the trace records. `--resume-context` holds JSON-serialized prior state
for a resumed run. A bridge service relays the workflow callback when the
conversation suspends on a `Recess` and re-enters later. Each participant's
`Answer` to the lead streams to the thread as a separate reply as soon as the
participant produces it. The harness does not hold the replies back for one
batch at the end.

```sh
npx gemba-harness discuss \
  --task-file=task.md \
  --lead-profile=discussion-lead \
  --agent-profiles=architect,security-reviewer \
  --discussion-id=GD_kwExample \
  --output=trace--discuss.ndjson
```

See
[Bridge a Threaded Channel to the Agent Team](https://www.forwardimpact.team/docs/libraries/bridge-channels/)
to connect a human channel to a discussion. That guide covers webhook intake,
callback tokens, and the suspend/resume lifecycle.

## Inspect the trace

Every coordinated run produces one NDJSON file. Read it as text for a quick
check, then give it to `gemba-trace` for structured analysis:

```sh
npx gemba-harness output --format=text < trace--review.ndjson
npx gemba-trace overview --file trace--review.ndjson
npx gemba-trace tool trace--review.ndjson Ask
npx gemba-trace tool trace--review.ndjson Announce
```

`Ask`/`Answer` show the targeted exchanges and `Announce` shows the broadcasts,
so you can see where the participants agreed and where they differed. See
[Analyze Traces](/docs/prove-changes/trace-analysis/) for the full method to
read a trace.

## Redaction

Redaction is on by default across `supervise`, `facilitate`, and `discuss`. It
replaces allowlisted environment-variable values (`ANTHROPIC_API_KEY`,
`GH_TOKEN`, `GITHUB_TOKEN`, and more) and credential-shaped strings in the
trace. Leave it on for any run whose trace you might share. Workflow artifacts
stay downloadable through retention.

## Verify

This guide is complete when:

- You can run a `facilitate` session with a lead profile and two or more named
  participant profiles, and it produces a single NDJSON trace.
- You can read the trace and see `Ask`/`Answer` exchanges routed by `askId`,
  `Announce` broadcasts, and a terminal `summary` event with the verdict.
- A `supervise` run exits `0` when the lead concludes with success and `1`
  otherwise.
- A `discuss` run keeps your `--discussion-id` in the trace and ends on
  `Adjourn`, or suspends on `Recess` for a bridge to resume.

## What's next

To connect a human channel to a `discuss` session, see
[Bridge a Threaded Channel to the Agent Team](https://www.forwardimpact.team/docs/libraries/bridge-channels/)
on the Forward Impact site.

<div class="grid">

<!-- part:card:../prove-changes -->
<!-- part:card:../prove-changes/trace-analysis -->
<!-- part:card:../predictable-team -->

</div>
