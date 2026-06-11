---
title: Resume a Recessed RFC When a Trigger Fires
description: Trace the suspend/resume contract — how a `recessed` verdict persists a trigger, accumulates replies, and re-dispatches with `resume_context` when the trigger condition is met.
---

An RFC posted as a GitHub Discussion may need to wait. The lead reads the
intake, judges that humans need time to respond (or wants a fixed window to
elapse), and returns a `recessed` verdict with a trigger — not a final
reply. The bridge persists that trigger, keeps the RFC open in the
discussion-context store, accumulates every follow-up comment into history,
and re-dispatches the workflow with `resume_context` when the trigger
condition is met. This page traces that bounded suspend/resume flow so you
can read logs, debug stuck triggers, and predict bridge behavior.

For the full setup including credentials, App configuration, and tunnel
startup, see
[Bridge GitHub Discussions to the Agent Team](/docs/services/bridge-discussions/).

## Prerequisites

- Completed the
  [Bridge GitHub Discussions to the Agent Team](/docs/services/bridge-discussions/)
  guide — `ghbridge` is running, the tunnel is published, the App webhook
  is configured, and a fresh discussion already triggered a workflow
  successfully.

## Trigger kinds

A `recessed` callback carries a `trigger` object that `ResumeScheduler`
evaluates via `evaluateTrigger` (from `@forwardimpact/libbridge`). The
kind names the lead's intent for the recess:

| Kind                 | Fires when                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_input`      | At least `replies` new history entries have accrued on the dispatching thread since the RFC opened.                                                   |
| `elapsed`            | An ISO-8601 duration (`P1D`, `PT12H`, `P1DT6H`) has passed since the RFC opened.                                                                      |
| `escalation_needed`  | Reserved for future use. The schema accepts `{ kind: "escalation_needed", signal: "<name>" }`, but the scheduler throws until signal-based resume ships. |

Triggers are evaluated against the caller's clock (libbridge's
`evaluateTrigger(trigger, observed, now)` takes `now` as a parameter), so
the bridge can predict the resume moment without depending on cron
scheduling outside the service.

## The recessed sequence

When the bridge receives a `recessed` callback, the libbridge
`createCallbackHandler` skeleton runs `ghbridge`'s `#handleReply`:

1. **Replies are posted first.** `postDiscussionReplies(...)` posts each
   unstreamed `payload.reply` (entries with no `kind` field — replies
   already streamed mid-run are filtered out) as a threaded
   `addDiscussionComment` mutation, and each posted reply is appended to
   `ctx.history` as an `assistant` turn — same as for `adjourned`. The
   `summary` field is not posted; on this verdict, it exists only for
   trace/debug purposes.
2. **`ResumeScheduler.enterRecess(ctx, correlation_id, trigger, requester)`**
   records `open_rfcs[correlation_id] = { trigger, opened_at, history_index_at_open, requester }`
   — the requester is the surface user id of the human whose message
   triggered the recessed run, kept so the eventual resume can be
   attributed.
3. **For an `elapsed` trigger**, the scheduler computes
   `due_at = opened_at + parseIsoDuration(elapsed)`, stores it on the
   rfc, and arms the embedded `ElapsedScheduler`. When it fires the
   scheduler re-dispatches without further inbound activity.
4. **For a `missing_input` trigger**, no timer is armed — every
   subsequent comment will re-evaluate the trigger inside
   `processInbound(ctx)`.
5. **The "EYES" reaction is removed** by `Acknowledgement.finish(...)`
   before the handler returns, signalling that the workflow run for this
   correlation id is complete.

The discussion record is flushed to JSONL at the end of the callback so
the recess state survives a bridge restart.

## The trigger-fires sequence

A trigger fires in one of two places:

- **Inbound comment path** — `#handleDiscussionComment` calls
  `resume.processInbound(ctx)` for every comment. The scheduler walks
  `ctx.open_rfcs`, computes `observed = { replies: history.length - history_index_at_open, opened_at }`,
  and feeds each `(trigger, observed, Date.now())` triple to
  `evaluateTrigger`. Fired RFCs are re-dispatched and cancelled.
- **Elapsed timer path** — `ElapsedScheduler` (embedded in
  `ResumeScheduler`) fires `#fireElapsed(correlationId)` on its own
  schedule. The scheduler looks up the context by walking
  `store.index.values()`, then re-dispatches and cancels.

Either way, re-dispatch goes through the shared `Dispatcher`:

1. **`resumeContext` is built** as
   `JSON.stringify({ correlation_id, history_since })` where
   `history_since = ctx.history.slice(history_index_at_open)`.
2. **`Dispatcher.dispatch(...)`** registers a fresh callback token,
   starts a new acknowledgement, fires the workflow with the resume
   payload, appends the prompt to history, and flushes the store. The
   *new* correlation id is the one the workflow sees on its next
   callback; the *original* correlation id only survives inside
   `resume_context`.
3. **The original RFC is cancelled** via `cancelRecess(ctx, correlationId)`
   — `open_rfcs[correlationId]` is deleted and any elapsed timer for it
   is cleared.
4. **The new workflow run produces a fresh verdict.** Usually
   `adjourned` with final replies, but a second `recessed` is also valid
   — `ResumeScheduler` will track the new RFC the same way.

## Accumulating replies without firing

If an RFC is open and a comment arrives but the trigger does not yet
fire (e.g., `replies: 3` and only one comment has arrived):

- The inbound comment is appended to `ctx.history` so the next
  evaluation sees the wider window.
- `processInbound(ctx)` returns `freshDispatchAllowed: false` because
  `hasOpenRfc` is true and `fired` is zero, so `#handleDiscussionComment`
  skips the rate-limit + `Dispatcher.dispatch` branch. No parallel
  workflow run is started on the same thread.
- `ctx.last_active_at` is updated and the store is flushed.

The rate limiter is consulted only when `freshDispatchAllowed` is true.
Comments that accumulate toward an open trigger are not rate-limited
because they do not consume workflow runs.

## Common failure shapes

| Symptom                                                       | Cause                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Elapsed trigger never fires after bridge restart              | `ResumeScheduler.rearm()` walks `store.index.values()` and re-schedules any rfc with a persisted `due_at`; check whether the rfc on disk has `due_at` and whether `rearm()` ran (called from `service.start()`) |
| `missing_input` trigger never fires despite enough comments   | The `replies` count is compared against `history.length - history_index_at_open`; check that webhook delivery is reaching the bridge and that comments are appearing in `ctx.history` |
| Re-dispatch happens but the workflow lacks prior context      | `resume_context` carries `history_since`, the slice from `history_index_at_open` onward — *not* the full history. The workflow must thread it through its prompt itself |
| Two parallel workflow runs on the same thread                 | A fresh dispatch fired while an RFC was open; inspect logs around `processInbound` to confirm `freshDispatchAllowed` was correctly false (and that no other code path bypassed it) |

## Verify

You have reached the outcome of this guide when:

- A `recessed` verdict posts every `reply` in the callback as a threaded
  comment, removes the "EYES" reaction, and leaves the discussion open
  with `open_rfcs[correlation_id]` written into the matching JSONL
  record at `data/bridges/discussions.jsonl` (saved through the shared
  `services/bridge` gRPC service).
- Subsequent comments on the discussion accrue into the bridge's
  history without spawning new workflow runs (verify with the Actions
  tab — no new run while `hasOpenRfc` holds).
- When the trigger condition is met (replies count reached or elapsed
  duration passed), a fresh workflow run appears in the Actions tab
  with a `resume_context` input carrying the original `correlation_id`
  and the `history_since` slice.
- The resumed workflow's lead reads the accumulated comments and posts
  a follow-up reply (or another `recessed`) back into the same thread.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
