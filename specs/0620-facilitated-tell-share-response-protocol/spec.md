# Spec 0620 — Request–Response Primitives for libeval Orchestration

## Problem

1-on-1 coaching sessions (`.github/workflows/kata-coaching.yml`) end prematurely
after Q1. The improvement coach poses the first of the five coaching kata
questions via `Tell`, the participant agent produces a polished text answer
inside its own turn stream, and the session then stalls in silent deadlock — the
participant never calls `Share`, the facilitator waits forever on
`messageBus.waitForMessages`, and the Agent SDK reports `result: success` while
4 of 5 questions are never asked.

The same improvement-coach agent, using the same `kata-storyboard` skill, runs
team storyboard meetings successfully (all five questions, many Share round
trips, clean Conclude). The difference is not the agent or the skill; it is what
the coach's `Tell` message body contains, and what the participant's instruction
surface says about how to respond to a `Tell`.

### Evidence — two failing coaching runs, same pathway

Run
[`24850558182`](https://github.com/forwardimpact/monorepo/actions/runs/24850558182)
(2026-04-23, staff-engineer, opus 4.6, $0.90, 3m23s):

| Metric                              | Count      |
| ----------------------------------- | ---------- |
| `mcp__orchestration__Tell` (coach)  | 1          |
| `mcp__orchestration__Share` (agent) | **0**      |
| `mcp__orchestration__Conclude`      | **0**      |
| Coaching questions reached (Q1..Q5) | **1 of 5** |

The single `Tell` at turn 40 ended with:

> "Analyze the trace and come back with: 1. What the run was trying to
> accomplish 2. What actually happened (quote specific tool calls, errors, or
> token counts from the trace) 3. Any patterns you notice — good or concerning
> Take your time with the trace. Numbers over narratives."

The participant ran `kata-trace`, produced a 1 500-word analysis at turn 120
that ended with "Ready for the five questions whenever you are." — then emitted
`{"type":"result","subtype":"success","num_turns":29}` with no `Share` call.

Run
[`24844117144`](https://github.com/forwardimpact/monorepo/actions/runs/24844117144)
(2026-04-23, staff-engineer, opus 4.6, $0.21, 30s):

| Metric                              | Count      |
| ----------------------------------- | ---------- |
| `mcp__orchestration__Tell` (coach)  | 1          |
| `mcp__orchestration__Share` (agent) | **0**      |
| `mcp__orchestration__Conclude`      | **0**      |
| Coaching questions reached (Q1..Q5) | **1 of 5** |

The single `Tell` at turn 28 ended with:

> "What was the goal of your most recent workflow run? What outcome were you
> aiming for?"

The participant produced a polished three-paragraph answer at turn 46 — as plain
text. `result: success` at num_turns 5. No `Share`.

### Evidence — the successful baseline

Run
[`24824149683`](https://github.com/forwardimpact/monorepo/actions/runs/24824149683)
(2026-04-23, team storyboard, sonnet 4.6, $1.75, 8m4s):

| Metric                               | Count      |
| ------------------------------------ | ---------- |
| `mcp__orchestration__Tell` (coach)   | 18         |
| `mcp__orchestration__Share` (agents) | **34**     |
| `mcp__orchestration__Conclude`       | **1**      |
| Coaching questions reached (Q1..Q5)  | **5 of 5** |

Every Q2 `Tell` from the facilitator ends with the same closing clause. A
representative one, turn 317 to staff-engineer:

> "Record to `wiki/metrics/staff-engineer/specs/2026.csv`, **then Share**."

All five Q2 Tells in this run end with the two-word directive "then Share". All
five participants responded via `Share` within two turns. Q3, Q4 and Q5 Tells no
longer need the directive — by then the round-trip pattern is established in the
conversation.

Same agent. Same skill. The only thing that changed between coaching (0 Shares)
and storyboard (34 Shares) is whether the word "Share" appeared in the `Tell`
body. The protocol is being taught inline, per-message, and only by accident.

### Evidence — no participant-side instruction teaches the protocol

The participant has four possible sources of guidance about how to respond to a
`Tell`:

1. **The Agent SDK system prompt.** Silent — `Share` and `Tell` are not
   mentioned at the SDK layer.
2. **The facilitated-agent system prompt**
   (`libraries/libeval/src/facilitator.js:36`,
   `FACILITATED_AGENT_SYSTEM_PROMPT`). Reads: "Share broadcasts your message to
   all participants. Tell sends a direct message to one participant. Ask sends a
   question to the facilitator — you block until answered." Describes tool
   semantics; does not say "when the facilitator sends you a Tell, respond via
   Share before finishing your turn." No symmetric rule to the facilitator's own
   "do not proceed until you have received responses."
3. **The agent-side tool descriptions**
   (`libraries/libeval/src/orchestration-toolkit.js:196-206`). `Share`:
   "Broadcast a message to all participants." `Tell`: "Send a direct message to
   one participant." Neither names the Tell→Share response pattern.
4. **The `kata-storyboard` skill, Participant Protocol section**
   (`.claude/skills/kata-storyboard/SKILL.md` § Participant Protocol, lines
   140–162). Five steps, all scoped to team-storyboard Q2: "Prepare for Q2",
   "Record metrics to CSV", "Share measured data", "Ground obstacles in data",
   "Propose testable experiments". The "1-on-1 Coaching Adaptation" section
   lives in
   `.claude/skills/kata-storyboard/references/coaching-protocol.md:60-71` and is
   a question-rewording table ("Q1: What were you trying to achieve in this
   run?") with no participant-side steps. The sentence "In facilitated mode, the
   same tool pattern applies — Tell to pose, Share to respond" appears in that
   same reference, but only the coach reads `coaching-protocol.md` during its
   own Facilitator Process.

The participant does not load `kata-storyboard` at all. In the two failing runs,
the staff-engineer invoked `kata-trace` (its own trace-analysis skill); no
`Skill("kata-storyboard")` call exists in its session. So even the
team-storyboard Participant Protocol, such as it is, is not in its context.

### Evidence — the workflow task-text over-directs Q1

`.github/workflows/kata-coaching.yml` prescribes the coach's opening move in its
`task-text`:

> "Facilitate a 1-on-1 coaching session with the participant agent. Guide them
> through the five coaching kata questions. **Have them analyze their own most
> recent trace using kata-trace.** Help them identify obstacles and design their
> next experiment."

Contrast `.github/workflows/kata-storyboard.yml`, whose task-text is a single
sentence: "Facilitate the team storyboard meeting."

The coaching task-text drives the coach to front-load trace analysis into Q1 as
a work assignment rather than posing the kata question (Q1: "What were you
trying to achieve in this run?") and letting the participant reach for
`kata-trace` under Q2 ("What actually happened?") as the skill already
prescribes. In run `24850558182` this front-loading caused the participant to
spend 29 of its ~50-turn budget producing a trace analysis before any `Share`
could happen — even if the Tell→Share protocol had been honoured, Q2–Q5 would
have had no runway.

### Evidence — silent deadlock mechanism

`libraries/libeval/src/facilitator.js` models the session as two cooperating
loops:

- `#facilitatorLoop` (line 232) blocks on `eventQueue.dequeue()` and only
  resumes the coach when a participant has called `Share`/`Ask` or emitted a
  `lifecycle:turn_complete` that drains into a facilitator message.
- `#runAgent` (line 184) blocks on `messageBus.waitForMessages(agent.name)`
  until the coach sends a `Tell`/`Share`.

When an agent finishes its local turn loop without having called `Share`, the
facilitator receives a `lifecycle:turn_complete` event that drains zero messages
from the bus and falls through without advancing the coach. The facilitator's
own system prompt tells it "do not proceed to the next question or call Conclude
until you have received responses from participants" (`facilitator.js:30-33`),
so the coach correctly waits. The two loops now wait on each other.

The session can only exit via the workflow's `timeout-minutes: 30`. Worse, the
outer Agent SDK emits `result: success` for each participant whose own turn loop
terminated normally, so `bunx fit-trace overview` reports `"result":"success"`
on a run that completed 20 % of its goal. A kata-trace audit that trusts the
SDK's success flag reports a green run.

### Who is affected

- **Every kata-coaching workflow run.** The Tell→Share gap triggers on the first
  question of every 1-on-1 session.
- **Every agent that is ever a participant in a facilitated mode.** Today the
  gap is invisible in team-storyboard runs because the coach's Q2 Tell template
  contains "then Share"; any future facilitator that does not use that specific
  phrasing will reproduce the coaching failure.
- **The improvement-coach's coaching cadence as a whole.** Coaching is how
  domain agents reflect on their own traces. If it silently fails, agents do not
  reflect, improvements do not surface, and the Kata cadence is performative.
- **Anyone relying on workflow `result:success` for monitoring.** The SDK
  success flag does not reflect coaching completion.

## Proposal

The Tell→Share stall is a symptom, not a root cause. `Tell` and `Share` are
one-way messaging primitives that encode no request-response obligation; the
participant has no structural reason to reply. A four-layer defence-in-depth
that restates the rule in prose every time a facilitator sends a question is
evidence of the primitive, not the instructions, being wrong. Any future
facilitator, model update, or prompt edit re-introduces the same deadlock.

Fix the primitives. Reify the request-response contract in the libeval tool
surface on both facilitated and supervised sides, enforce it at the runtime, and
collapse the four prose layers into two short descriptive ones framed by the new
vocabulary.

### Request–response primitive pair

Replace the current messaging primitives with a pair that encodes the contract:

- **`Ask(to?, question)`** — the authoritative speech act. Sending an `Ask`
  registers a pending-ask record in the orchestration context keyed by the
  addressee. The asker's turn ends after the call (same as today's `Tell`).
- **`Answer(message)`** — the symmetric reply. Resolves the pending-ask from the
  asker's counterpart. On the participant side this replaces `Share`-as-
  response; on the supervisor/facilitator side this replaces the implicit text
  relay.
- **`Announce(message)`** — no-reply broadcast (the legitimate use of today's
  `Share`). Clearly distinguished from `Ask`.
- `Redirect`, `Conclude`, `RollCall` retain their current names and semantics in
  both modes.

The vocabulary is shared between supervision and facilitation. Supervision is
1:1 with a single pending-ask slot; facilitation is 1:N with one slot per
addressed participant.

### Runtime enforcement of the contract

The orchestrator (facilitator or supervisor) tracks outstanding asks per
addressee and refuses to finalise an agent's turn while that agent has an
unanswered ask. Recovery is bounded: exactly one nudge to answer, and if the ask
is still outstanding after that, the orchestrator emits a `protocol_violation`
trace event and allows the turn to complete so the session can advance (the
facilitator sees a null response and may Redirect or Conclude).

Keeping the session live and keeping the violation visible are orthogonal — both
are required. Silent deadlock becomes structurally impossible, and the violation
becomes a first-class trace fact rather than an inference. The specific data
structures, call sites, and nudge mechanism are design decisions; see
design-a.md.

### Participant-side coaching framing reaches participants via a generic,

consumer-controlled pass-through

Libeval stays domain-agnostic: its system prompts describe only the
Ask/Answer/Announce contract in generic language and name no specific skill,
kata concept, or domain vocabulary. Coaching framing (mode, target, protocol
pointer, participant-side summary) travels from the workflow into the
facilitator's context, and the facilitator propagates it to each participant
through a generic pass-through field on libeval's participant config. Delivery
via the coach's first `Ask` is rejected: it uses the very protocol that's being
bootstrapped. The specific field name, concatenation order, and CLI-to-config
mapping are design decisions; see design-a.md.

### Skill restructure: `kata-storyboard` → `kata-session`

The current skill name ties a generic coaching protocol to a single artifact
(the monthly storyboard) used in only one of the two meeting modes. Rename the
skill to `kata-session` with a mode-agnostic procedure and two mode-specific
references:

- `SKILL.md` — the five kata questions, the Ask/Answer turn-taking contract,
  Conclude.
- `references/team-storyboard.md` — storyboard artifact, XmR, CSV metrics,
  planning vs. review branch (content migrated from today's Facilitator Process
  steps and team-scoped pieces of `coaching-protocol.md`).
- `references/one-on-one.md` — participant-trace overlay (content migrated from
  today's "1-on-1 Coaching Adaptation" section).

All references to `kata-storyboard` across the repo (KATA.md, agent profiles,
workflows, prior spec designs that are live history) update to `kata-session`.

### Rewritten task-text for `kata-coaching.yml`

The coaching workflow's `task-text` primes the facilitator with the coaching
framing libeval's generic prompts deliberately omit — mode, target participant,
pointer to `kata-session`, and the participant-side summary the coach will
propagate. It must not prescribe Q1 content, must not assign participant-side
work, must not name participant tools, and must not carry enforcement phrasing.
Because libeval is now generic, domain framing is expected to live here; the
task-text is not reduced to a single sentence and its shape need not match
`kata-storyboard.yml`.

### Structured protocol-violation invariants

The kata-trace invariant catalogue gains two named entries whose evidence is the
count of `protocol_violation` trace events in a combined trace, plus the
`Conclude` cardinality check. One entry per mode (facilitated, supervised); the
evidence function is shared.

## Scope

### Included

- `libraries/libeval/src/orchestration-toolkit.js` — the tool surface for both
  facilitator and supervisor modes switches to `Ask` / `Answer` / `Announce`.
  `Tell`, `Share`, and the participant-side blocking `Ask` are removed with no
  aliases or compatibility shims.
- `libraries/libeval/src/facilitator.js` and
  `libraries/libeval/src/supervisor.js` — both orchestrators gain pending-ask
  tracking and a turn-complete guard with bounded single recovery and
  `protocol_violation` trace emission (observable properties asserted by SC 2
  and SC 3). `FACILITATOR_SYSTEM_PROMPT`, `FACILITATED_AGENT_SYSTEM_PROMPT`,
  `SUPERVISOR_SYSTEM_PROMPT`, and `AGENT_SYSTEM_PROMPT` are rewritten to match
  the new vocabulary in generic, domain-agnostic language — no skill names, no
  kata concepts, no domain vocabulary. The `Facilitator` participant config
  exposes a generic `systemPromptAmend: string?` pass-through so consumers can
  supply participant framing; libeval treats its content as opaque. The
  `taskAmend` concatenation currently performed by
  `libraries/libeval/src/commands/*` is exposed in the same shape as a public
  config field on `Facilitator`, `Supervisor`, and `AgentRunner`, with the CLI
  flag driving that field. `taskAmend` (task-content level) and
  `systemPromptAmend` (system-prompt level) share one naming family.
- `libraries/libeval/src/message-bus.js` — bus API updated to the new
  vocabulary; existing `tell` / `share` methods are removed in favour of `ask` /
  `answer` / `announce` counterparts. Message-tag shape is a design decision.
- `libraries/libeval/src/index.js` — public exports reflect the new vocabulary
  and the new config fields.
- `libraries/libeval/test/**` — test coverage updated and extended for the new
  primitives, pending-ask transitions, turn-complete guard, `protocol_violation`
  event emission, and the `taskAmend` / `systemPromptAmend` pass-throughs.
  File-level test decomposition is a plan decision.
- `.claude/skills/kata-storyboard/` — renamed to `.claude/skills/kata-session/`
  with `SKILL.md` holding the mode-agnostic procedure, and
  `references/team-storyboard.md` + `references/one-on-one.md` carrying the
  mode-specific overlays. Existing `references/coaching-protocol.md`,
  `references/metrics.md`, and `references/storyboard-template.md` are
  redistributed into the new structure. `SKILL.md` Facilitator Process gains a
  step describing how the coach derives a participant-side summary from the
  relevant overlay and passes it as `systemPromptAmend` to libeval's
  `Facilitator` participant config.
- `.github/workflows/kata-coaching.yml` — `task-text` rewritten to carry the
  coaching framing (mode, target participant, pointer to `kata-session`,
  participant-side summary to be passed through as `systemPromptAmend`). Does
  not prescribe Q1 content, does not assign participant-side work, does not
  carry enforcement phrasing. Not reduced to a single sentence; shape need not
  match `kata-storyboard.yml`.
- `.github/workflows/kata-storyboard.yml` — any skill-name references updated;
  workflow behaviour otherwise unchanged.
- `.claude/agents/*.md` — agent profiles referencing `kata-storyboard`
  (improvement-coach, staff-engineer, security-engineer, release-engineer,
  technical-writer, product-manager) update to `kata-session`.
- `.claude/agents/references/memory-protocol.md` — skill name reference update.
- `KATA.md` — Skills table entry updated to `kata-session`.
- `.claude/skills/kata-trace/references/invariants.md` — two new entries:
  facilitated-mode and supervised-mode protocol-violation invariants (counts of
  `protocol_violation` trace events plus `Conclude` cardinality).

### Excluded

- **Facilitated-agent identity (spec 0500 scope).** The participant's persona,
  voice, and scope constraints stay as-is. Only its tool surface and system-
  prompt framing change.
- **Facilitator-as-pure-orchestrator posture (spec 0490 scope).** That spec
  established the coach as a pure facilitator with orchestration-tool-only
  interaction. This spec refines the vocabulary of those tools; it does not
  revert the posture. Prompt text introduced by spec 0490 is rewritten to the new
  vocabulary, not removed.
- **Behavioural recovery strategies.** Shorter timeouts, automatic retry on
  protocol_violation, or re-dispatching a stalled coaching session are out of
  scope. The runtime's one bounded resume-once is the only recovery action;
  further escalation is a separate spec.
- **`agent-runner.js` core loop.** Per-turn mechanics of the individual agent
  runner are unchanged. The orchestrator (Facilitator / Supervisor) reads ctx at
  existing checkpoints; no new callbacks into the runner are introduced.
- **Trace format changes beyond the new `protocol_violation` event type.**
  Existing tool-call records, message tags, and orchestrator events keep their
  shapes.
- **New facilitated workflows or agents.** No new workflow, no new agent
  persona. Scope is limited to the two existing facilitated workflows
  (`kata-storyboard.yml`, `kata-coaching.yml`) and the supervised mode consumed
  by `fit-eval supervise`.

## Dependencies

- **Spec 0460** (`plan implemented`) — `kata-storyboard` skill exists and is
  renamed by this spec.
- **Spec 0490** (`plan implemented`) — facilitator-as-pure-orchestrator posture.
  This spec refines the vocabulary that spec 0490 introduced; the posture itself
  is preserved.
- **Spec 0500** (`plan implemented`) — facilitated-agent identity. Unchanged; the
  participant-side coaching-framing surface this spec selects (libeval's generic
  `systemPromptAmend` pass-through populated by the facilitator) sits alongside
  the identity surface, not inside it.

## Success Criteria

The spec is done when these **artifact properties** hold. Each criterion is a
property of a file or a testable runtime behaviour, checkable without scheduling
a workflow run. The validation note at the end confirms that the artifact
properties compose into the intended runtime behaviour; it is not a criterion.

1. **The new primitive vocabulary is the only tool surface.**
   `orchestration-toolkit.js` exposes `Ask`, `Answer`, `Announce`, `Redirect`,
   `Conclude`, `RollCall` across both facilitator and supervisor tool servers
   and their counterparts on the participant / agent side. `Tell`, `Share`, and
   the participant-side blocking `Ask` (as a distinct tool) are removed — no
   aliases, no compatibility shims. Checkable by reading the file.

2. **Pending-ask tracking is structural, not inferred.** The orchestration
   context exposes a `pendingAsks` map populated by the `Ask` handler and
   cleared by the `Answer` handler. Tests in
   `libraries/libeval/test/orchestration-toolkit.test.js` assert the map's
   transitions. Checkable by reading the tests and running them.

3. **Runtime refuses silent turn-completion while an ask is pending.** In both
   facilitated and supervised modes, the orchestrator's agent loop injects
   exactly one synthetic reminder on first detection of a pending ask at
   turn-end, then on a second detection emits a `protocol_violation` trace event
   and permits the turn to complete so the session can advance. Covered by a
   test that drives an agent which ignores the first `Ask`, observes the
   synthetic reminder, ignores again, and verifies the `protocol_violation`
   event appears exactly once and the session does not deadlock.

4. **System prompts match the new vocabulary, are descriptive not enforcing, and
   stay domain-agnostic.** `FACILITATOR_SYSTEM_PROMPT`,
   `FACILITATED_AGENT_SYSTEM_PROMPT`, `SUPERVISOR_SYSTEM_PROMPT`, and
   `AGENT_SYSTEM_PROMPT` name the `Ask` / `Answer` / `Announce` primitives in
   generic language. No prompt contains enforcing phrases (e.g. "then Share",
   "respond via Share", "stop making tool calls") — runtime enforcement replaces
   them. No prompt names a specific skill, a coaching/storyboard domain concept,
   or artifact vocabulary; libeval is a generic library and its prompts must
   stay domain-agnostic. Checkable by reading the four prompt constants in
   `facilitator.js` and `supervisor.js`.

5. **`kata-session` skill replaces `kata-storyboard` with a mode-agnostic
   procedure.** The directory `.claude/skills/kata-session/` exists with
   `SKILL.md` (mode-agnostic: five questions, Ask/Answer contract, Conclude),
   `references/team-storyboard.md` (storyboard overlay), and
   `references/one-on-one.md` (participant-trace overlay).
   `.claude/skills/kata-storyboard/` does not exist. Checkable by `ls` and by
   reading the SKILL.md front-matter name field.

6. **All repo references to the old name are updated.** No file under
   `.claude/`, `.github/`, `KATA.md`, or `website/docs/` contains the string
   `kata-storyboard` except in historical spec/design artifacts under `specs/`
   that document prior work. Checkable by `grep -rn kata-storyboard`.

7. **Participant-side coaching framing is delivered via a consumer-controlled
   pass-through, not via libeval's system prompt or the coach's first `Ask`.**
   Libeval exposes two public, consumer-controlled append surfaces in a single
   naming family: one at task-content level (the existing `--task-amend`
   promoted from CLI-only to the programmatic config) and one at system-prompt
   level (new). Both accept opaque strings; libeval never inspects their
   content. The coaching framing itself (mode, target, pointer to
   `kata-session`, participant-side summary) originates in
   `.github/workflows/kata-coaching.yml` `task-text` and is propagated to
   participants by the facilitator as derived from the `kata-session` skill.
   Checkable by (a) a libeval test asserting that a provided system-prompt-level
   addendum reaches the participant's system prompt before the first `Ask` is
   delivered, and that the absence of one leaves the prompt purely generic; (b)
   a libeval test asserting that the promoted task-content-level config field
   produces the same concatenation semantics that the CLI flag produced
   previously; (c) `kata-session/SKILL.md` containing a Facilitator Process step
   that constructs and passes the participant-side summary; and (d)
   `kata-coaching.yml` `task-text` priming that step. Specific field names are a
   design decision.

8. **Coaching workflow task-text does not over-direct the facilitator or assign
   participant work.** `.github/workflows/kata-coaching.yml` `task-text` does
   not prescribe Q1 content, does not assign participant-side work (no "have
   them analyze their trace using kata-trace"), does not name tools the
   participant should use, and does not carry enforcement phrasing ("stop making
   tool calls", "then Share"). Checkable by reading the workflow. (SC 7 covers
   the positive content the task-text carries.)

9. **Protocol-violation invariants are catalogued for both modes.**
   `.claude/skills/kata-trace/references/invariants.md` contains one entry per
   mode (facilitated, supervised). Each entry's evidence query counts
   `protocol_violation` events in the combined trace and asserts `Conclude`
   cardinality equals 1 on success. Checkable by reading the entries and running
   their documented queries against the baseline artifacts.

10. **Test suite passes with new coverage.** `bun run check` and `bun run test`
    pass. New tests cover: `Ask` registers pending, `Answer` clears pending,
    `Announce` does not, the turn-complete guard in both modes, the
    `protocol_violation` event shape, and the `messageBus`/tool-server rename
    migration.

**Validation note (not a criterion).** Once the ten criteria above hold,
schedule one `kata-coaching.yml` run against the staff-engineer (same agent as
the two failing runs `24850558182` and `24844117144`), one `kata-storyboard.yml`
run, and one supervised run of an arbitrary agent. Download all three combined
traces and confirm: (a) the new invariants in criterion 9 report no violations
on any of the three, (b) the coaching run contains at least one `Answer` from
the participant and exactly one `Conclude`, and (c) no run exhibits silent
deadlock. Persistent monitoring is the invariants, not manual runs.
