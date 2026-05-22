# Spec 1280 — Suspend/resume support for msbridge

## Persona and job

Hired by the **Teams Using Agents** user group's
[`<job goal="Run a Continuously Improving Agent Team">`](../../JTBD.md) entry
— specifically, the discuss-mode surface where an agent reasons before
answering rather than answering immediately every time. This spec extends
that surface on Microsoft Teams to match what `services/ghbridge` already
delivers on GitHub Discussions.

## Problem

The Kata dispatch workflow can return any of three terminal verdicts —
`adjourned`, `failed`, or `recessed`. The `recessed` verdict carries a
`trigger` describing when the agent wants to be re-summoned: after N more
responses, or after an elapsed ISO-8601 duration, or either.

The `services/ghbridge` service implements this fully. When a GitHub
Discussion thread receives a `recessed` verdict the bridge persists the
trigger on the conversation, watches comments accrue, and on trigger
satisfaction re-dispatches the workflow carrying `resume_context` that the
facilitator uses to continue where it left off.

The `services/msbridge` service does not. Its callback handler logs
`"resume not yet supported on msteams"` on a `recessed` verdict and applies
the same code path as `adjourned`. The agent's request to be re-summoned is
silently dropped.

Three consequences:

1. **Teams users get different behaviour from the same workflow than
   Discussions users.** The same `kata-dispatch.yml`, posed the same way,
   produces a recess on Discussions and a no-op on Teams. The disparity is
   undocumented to the user.

2. **Discuss-mode work on Teams is artificially constrained.** A
   facilitator running a quorum-style task must adjourn synchronously or fail
   — it cannot say "ask three teammates, come back when two answer." The
   contract that `kata-dispatch.yml` already exposes is unreachable from
   Teams.

3. **`services/ghbridge` and `services/msbridge` carry a feature delta**
   that a contributor reading either file must hold in their head. The
   bridge-parity work that landed `libraries/libbridge`'s `ResumeScheduler`
   primitive closed the structural gap; only the wiring remains.

## Proposal

Wire `libraries/libbridge`'s `ResumeScheduler` into `services/msbridge` so
the Teams bridge supports both response-count and elapsed-duration triggers
end-to-end. Behaviour matches `services/ghbridge` exactly except for the
channel-specific callback-meta convention.

Three observable changes for the Teams user:

- A `recessed` verdict now suspends the conversation. The acknowledgement
  reaction is removed (existing behaviour); the facilitator's `replies` are
  posted (existing behaviour); the trigger is persisted (new).
- Subsequent messages from the user in the same Teams thread accrue toward
  the trigger. When the trigger fires, the workflow re-dispatches with the
  same `resume_context` payload `services/ghbridge` produces.
- Elapsed triggers fire even when no further user message arrives. A
  persisted `due_at` survives a `services/msbridge` restart.

Three non-changes:

- `libraries/libbridge` gains no new exports. The primitives exist.
- The `kata-dispatch.yml` workflow contract is unchanged. The
  `resume_context` envelope already produced by `services/ghbridge` is
  reused byte-for-byte.
- `services/msbridge`'s response to `adjourned` and `failed` verdicts is
  unchanged.

## Scope

### In scope

- `services/msbridge` learns to suspend a recess on a `recessed` verdict,
  watch subsequent inbound messages and elapsed time for the trigger's
  satisfaction, and re-dispatch the workflow with `resume_context` when
  the trigger fires. Behaviour matches `services/ghbridge`'s resume
  surface; the design decides the exact composition.
- Trigger evaluation occurs before any fresh dispatch on the inbound
  path, and recess state transitions occur on receipt of the workflow
  verdict.
- Persisted recess deadlines survive a `services/msbridge` restart.
- End-to-end tests at the `services/msbridge/test` layer matching the
  shape of `services/ghbridge/test/resume.test.js`: both
  `responses`-trigger and `elapsed`-trigger paths, with the same
  assertions on `resume_context` content.

### Excluded

Permanent non-goals:

- Changes to `libraries/libbridge`. The scheduler is the contract; this
  spec is the consumer side.
- Channel-specific resume semantics. The trigger evaluation, the
  `resume_context` shape, and the cancellation rules are all defined by
  `libraries/libbridge`'s primitive and inherited unchanged.
- A user-facing notification when a recess begins. Teams will not see "the
  agent is waiting for two more responses" — the existing reply text the
  facilitator chose to post is the user-facing signal.

Deferred:

- A per-recess timeout failsafe (auto-fail a recess that never resolves
  beyond a hard limit). The libbridge `evaluateTrigger` contract already
  treats elapsed as the natural failsafe; adding a second one is future
  work.
- Cross-channel resumption (a recess opened on Teams resolving via a
  comment on Discussions, or vice versa). Each channel resumes its own
  recesses only.

Out of scope by inheritance:

- Conversation state shape (`open_rfcs`, `pending_callbacks`,
  `discussion_id`). `services/msbridge` already writes the canonical
  `DiscussionContextStore` record from spec 1230; the `open_rfcs` field is
  already part of that record and survives reload.

## Success criteria

| Claim | Verifies via |
|---|---|
| A `recessed` verdict on Teams persists the trigger on `open_rfcs` rather than no-opping. | An end-to-end test that drives a Teams message → `recessed` callback returns the discussion context with one entry in `open_rfcs` carrying the trigger payload. |
| A subsequent Teams message that satisfies a `responses` trigger re-dispatches the workflow with `resume_context`. | An end-to-end test that observes exactly two workflow dispatches (initial + resume) on the captured GitHub Actions fetch, with the second carrying a `resume_context` whose `correlation_id` matches the original dispatch and whose `history_since` contains the post-recess messages. |
| A subsequent Teams message during an open recess that does NOT satisfy the trigger accrues into history without spawning a parallel fresh dispatch. | An end-to-end test where the dispatch fetch is observed once total and the stored context shows the user's intermediate message in `history`. |
| An `elapsed` trigger persists `due_at` and the bridge rearms it on start. | A test that seeds an `open_rfcs` record with a future `due_at` into the same storage backing, starts a fresh bridge, and observes that a timer is armed for that deadline without any inbound message — verifiable by any read-only observable the host exposes on its scheduler. |
| The Teams resume behaviour matches `services/ghbridge` for the same trigger shapes. | The new `services/msbridge/test` resume tests assert the same end-to-end claims that `services/ghbridge/test/resume.test.js` asserts, with the only differences being the channel name (`msteams` vs `github-discussions`), the inbound activity shape, and the absence of GraphQL reactions in the assertions. |
| The `adjourned` and `failed` paths in `services/msbridge` continue to behave as today. | Existing tests in `services/msbridge/test/msbridge.test.js` for `adjourned` and `failed` verdicts continue to pass without modification. |
| `services/msbridge` no longer logs a "resume not supported" notice on a `recessed` verdict. | An end-to-end test that POSTs a `recessed` callback and observes the logger captured no entry matching that phrase. |
| Service shutdown cancels every armed elapsed timer. | A test that arms an `elapsed` trigger via the bridge, calls `stop()`, and observes — by any read-only observable the host exposes on its scheduler — that no timer remains armed. |
