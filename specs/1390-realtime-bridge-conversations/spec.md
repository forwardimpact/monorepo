# 1390 — Realtime Bridge Conversations

Serves **Teams Using Agents — Run a Continuously Improving Agent Team**
([JTBD](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)).
A team talks to the Kata agent team through a GitHub Discussion (or, via the
sibling Teams bridge, a Teams thread). Today that conversation feels like batch
email; this spec makes it feel like a chat.

## Problem

A bridge conversation is the primary way a human interacts with the agent team
in natural language. The current dispatch contract is a batch request/response:
the bridge fires one workflow run, the agent team works in silence, and the
human sees nothing on the thread until the lead **Adjourns** and the single
terminal callback is delivered. Three concrete failures follow.

### 1. No feedback until the whole team is done

The only reply the human receives arrives after the lead concludes the entire
session. A run is budgeted for up to five hours, and a realistic
multi-participant discussion (lead delegates to several domain agents, each does
substantial work) routinely runs for many minutes before anything is posted.
During that window the only progress signal on the thread is a single **EYES**
reaction. From the human's seat the team looks idle, then a wall of replies
appears at once. Partial answers that already exist mid-run — one agent has
finished while others are still working — are withheld until the end even though
they are ready to read.

### 2. Agents go silent between accepting work and finishing it

When the lead delegates with **Ask**, the addressed agent may pick up a
long-running task (a security audit, an implementation pass). There is no way
for that agent to say "I've got this, here's what I'm about to do" before it
disappears into the work. The human cannot tell whether the question was even
received, let alone what the agent intends. The first and only sign that the
Ask landed is the eventual **Answer**.

### 3. A new message during a run cannot reach the run

If the human thinks of a clarification, correction, or follow-up while a run is
in progress, there is no path for that message to reach the live session. The
bridge holds no binding from a discussion to its in-progress run, so a mid-run
comment is simply treated as a new request: it dispatches a **second,
independent run** with no shared context (it is the in-task recursion guard,
not any per-thread serialization, that keeps that second run from blindly
redoing the first run's work). The human's only options are to wait for the
run to finish or to accept a competing dispatch. The conversation cannot adapt
while it is happening — the defining property of a chat.

### Why this matters

These are not three independent bugs; together they make the bridge a
fire-and-forget RPC wearing a chat interface. The experience the team wants is a
live conversation: work-in-progress is visible as it happens, agents
acknowledge before they dig in, and the human can steer mid-flight. The
machinery to run multi-agent discussions already exists (discuss mode, the
Ask/Answer message bus, the callback path); what is missing is a *streaming*,
*steerable* contract between the bridge and the running session.

## Solution

Turn the bridge↔run contract from a single terminal callback into a live
session that streams events out as they happen and accepts messages in while the
run is live. Four capabilities, layered.

### 1. Stream replies as they are produced

Each agent answer that is routed to the lead is posted to the thread at the
moment it is produced, rather than being accumulated and delivered only when the
session ends. A run that produces five answers over ten minutes posts five
comments over ten minutes. The terminal conclusion remains the close of the
session, but it is no longer the first thing the human sees.

### 2. `Acknowledge` — early, interactive feedback

Add an **Acknowledge** capability to the agent participant surface. An agent can
acknowledge an Ask it has received — "picking this up, here's my plan" — before
it begins the work. (This agent-facing capability is named for the act of
acknowledging an Ask; it is distinct from the bridge's existing internal
`Acknowledgement` reaction/typing-indicator lifecycle, which it neither uses nor
replaces.) An acknowledgement:

- is posted to the thread as its **own comment**, so progress feels interactive
  and live (a separate visible message, not a status edit);
- does **not** discharge the Ask — the agent still owes a real Answer, and the
  acknowledgement does not count as one for any resumption or completion
  accounting;
- is distinguishable on the thread and in the trace from a final Answer.

### 3. Inject new messages into a live run

The bridge tracks which discussion is bound to which in-progress run. When a new
message arrives on a discussion that already has a live run:

- **From the original requester** (the human who triggered the run): the message
  is injected into the running session and delivered to the lead, who may
  delegate it with further Asks. No second run is started.
- **From anyone else:** the bridge posts a brief, static notice on the thread
  explaining that a run is in progress and their message was not injected. The
  live run is not disturbed and no new run is dispatched on their behalf.

When no run is live, a new message dispatches a fresh run exactly as it does
today. When the run has recessed, the existing suspend/resume path continues to
apply.

### 4. Longer conversations, unchanged mode semantics

Injected continuations make a single run legitimately span many more turns than
a one-shot dispatch. This is accommodated by **raising the default
conversation-length budget** so an injected conversation is not cut off
mid-flight — not by reworking the turn model. The requirement is *symmetry*: the
`run`, `supervise`, and `facilitate` modes are not behaviourally changed by this
spec, and within `discuss` mode the orchestration loop and the Ask/Answer
protocol are unchanged apart from the additive `Acknowledge` tool and the
streaming emission of events. (The streamed reply/ack events and `discuss`
mode's existing `meta`/summary events make its trace richer than the one-shot
`run` mode's; "symmetry" means a shared envelope *shape* and a shared turn
model, not an identical event *set*.) The concrete budget value is a plan
decision.

### Boundaries that hold

- **No addressable runtime required.** Realtime is achieved within the existing
  ephemeral run substrate; the run is never made addressable from the outside.
  The streaming and injection channels are established by the run reaching out,
  not by anything reaching in. The exact mechanism is a design concern; what the
  spec commits to is that this works without the persistent runtime listed in
  Out of scope.
- **Realtime is bounded to the active run window.** Streaming and injection only
  apply while a run is live (within its execution-time budget). Across the gaps
  between runs, the conversation falls back to the existing recess/resume
  behaviour. This bound is accepted, not worked around.
- **Channel-agnostic.** The streaming/injection contract lives at the shared
  bridge library (`libbridge`) so both the GitHub Discussions bridge
  (`services/ghbridge`) and the Microsoft Teams bridge (`services/msbridge`)
  inherit it; only the channel-specific reply-posting differs.
- **At-most-once thread posts.** A streamed reply or acknowledgement is posted
  to the thread at most once even if the underlying delivery is retried or the
  conversation later resumes, and the bridge continues to suppress webhook
  echoes of its own posts.

## Scope

### In scope

| Area | Change |
| --- | --- |
| Reply delivery | Replies stream to the thread as produced, not only at session end |
| Agent tools | New `Acknowledge` capability on the discuss-mode agent surface |
| Acknowledgement semantics | Own comment; does not discharge the Ask; distinct from Answer in thread and trace |
| Message injection | Original requester's mid-run messages reach the live lead; no new run spawned |
| Non-requester messages | Brief static notice; live run untouched |
| Bridge session state | Bridge tracks discussion ↔ in-progress run binding and the pending inbound messages for a run |
| Callback contract | Supports many in-progress deliveries per run plus one terminal conclusion, with at-most-once thread posting |
| Conversation budget | Default conversation-length budget raised so injected continuations are not cut off (concrete value deferred to the plan) |
| Both bridges | Behaviour delivered at the shared `libbridge` layer so `services/ghbridge` and `services/msbridge` both inherit it |
| Crash safety | The existing terminal-verdict-on-failure guarantee is preserved once replies stream inline — a run that dies without concluding still yields a failure verdict on the thread |

### Out of scope

- **Persistent / addressable run runtime.** Keeping the run on the existing
  ephemeral CI substrate is assumed; moving runs onto a long-lived service to
  get push-based delivery is a separate effort.
- **Cross-run realtime.** Steering a conversation between runs (after a run has
  ended or recessed) beyond the existing resume behaviour.
- **Multi-requester authority.** Allowing participants other than the original
  requester to steer a live run, or transferring run ownership.
- **New resumption trigger kinds.** The `missing_input` / `elapsed` /
  `escalation_needed` trigger set is unchanged.
- **Per-channel UX beyond comment posting** (reactions as progress bars, typing
  indicators, etc.).

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | An agent answer is posted to the thread before the session concludes, not only at Adjourn | Observe a discuss run with multiple answers: comments appear on the thread as each answer is produced, ahead of the terminal conclusion |
| 2 | `Acknowledge` posts a distinct comment that does not discharge the Ask | A run where an agent acknowledges then later answers produces two thread comments; the acknowledgement is not counted as the Answer and the agent is still expected to answer |
| 3 | The original requester's mid-run message reaches the live lead without starting a second run | Post a follow-up as the requester during a live run; the lead receives it and may delegate it, and no new workflow run is dispatched |
| 4 | A non-requester's mid-run message yields a static notice and leaves the run undisturbed | Post as a different user during a live run; a brief notice is posted and the live run continues unaffected |
| 5 | A streamed reply or acknowledgement is posted at most once under delivery retry | Re-delivery of the same reply event produces no duplicate thread comment |
| 6 | Other modes are not behaviourally changed, and an injected conversation is not cut off by the default budget | `run` / `supervise` / `facilitate` mode behaviour is unchanged (their existing tests pass unmodified); a multi-round injected `discuss` conversation runs to a natural conclusion without hitting the default turn cap |
| 7 | Both bridges inherit streaming and injection | The shared `libbridge` layer carries the contract; `services/msbridge` gains the behaviour without channel-specific streaming logic |
| 8 | A run that ends without concluding (crash, timeout, runner eviction) still delivers a terminal verdict to the thread | Terminate a live run before it concludes; the thread receives a failure conclusion |
