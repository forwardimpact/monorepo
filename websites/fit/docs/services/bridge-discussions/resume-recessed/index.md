---
title: Resume a Recessed RFC When a Trigger Fires
description: Trace the suspend/resume contract. A `recessed` verdict persists a trigger, accumulates replies, and re-dispatches with `resume_context` when the trigger condition is met.
---

An RFC posted as a GitHub Discussion may need to wait. The lead reads the
intake. The lead judges that humans need time to respond, or wants a fixed
window to elapse. The lead then returns a `recessed` verdict with a trigger.
The lead does not return a final reply. The bridge persists that trigger. It
keeps the RFC open in the discussion-context store. It accumulates every
follow-up comment into history. It re-dispatches the workflow with
`resume_context` when the trigger condition is met. This page traces that
bounded suspend/resume flow. Use the page to read logs, debug stuck
triggers, and predict bridge behavior.

For the full setup with credentials, App configuration, and tunnel startup,
see
[Bridge GitHub Discussions to the Agent Team](/docs/services/bridge-discussions/).

## Prerequisites

- Complete the
  [Bridge GitHub Discussions to the Agent Team](/docs/services/bridge-discussions/)
  guide. `ghbridge` runs. The tunnel is published. The App webhook is
  configured. A fresh discussion already triggered a workflow
  successfully.

## Trigger kinds

A `recessed` callback carries a `trigger` object. `ResumeScheduler`
evaluates it with `evaluateTrigger` from `@forwardimpact/libbridge`. The
kind names the lead's intent for the recess:

| Kind                 | Fires when                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_input`      | The thread that dispatched the RFC accrued at least `replies` new history entries since the RFC opened.                                               |
| `elapsed`            | An ISO-8601 duration (`P1D`, `PT12H`, `P1DT6H`) passed since the RFC opened.                                                                          |
| `escalation_needed`  | Reserved for future use. The schema accepts `{ kind: "escalation_needed", signal: "<name>" }`, but the scheduler throws until signal-based resume ships. |

`evaluateTrigger` evaluates triggers against the caller's clock. The
libbridge function `evaluateTrigger(trigger, observed, now)` takes `now` as
a parameter. The bridge can then predict the resume moment. It does not
depend on a cron schedule outside the service.

## The recessed sequence

When the bridge receives a `recessed` callback, the libbridge
`createCallbackHandler` skeleton runs `ghbridge`'s `#handleReply`:

1. **The bridge posts the replies first.** `postDiscussionReplies(...)`
   posts each unstreamed `payload.reply` as a threaded
   `addDiscussionComment` mutation. An unstreamed reply is an entry with
   no `kind` field. The function filters out replies it already streamed
   mid-run. It appends each posted reply to `ctx.history` as an
   `assistant` turn, the same as for `adjourned`. The bridge does not post
   the `summary` field. On this verdict, `summary` exists only for trace
   and debug purposes.
2. **`ResumeScheduler.enterRecess(ctx, correlation_id, trigger, requester)`**
   records
   `open_rfcs[correlation_id] = { trigger, opened_at, history_index_at_open, requester }`.
   The requester is the surface user id of the human whose message triggered the
   recessed run. The record keeps it so the eventual resume can name the
   requester.
3. **For an `elapsed` trigger**, the scheduler computes
   `due_at = opened_at + parseIsoDuration(elapsed)`, stores it on the
   rfc, and arms the embedded `ElapsedScheduler`. When it fires the
   scheduler re-dispatches without further inbound activity.
4. **For a `missing_input` trigger**, the scheduler arms no timer. Every
   later comment re-evaluates the trigger inside `processInbound(ctx)`.
5. **`Acknowledgement.finish(...)` removes the "EYES" reaction** before
   the handler returns. The removal signals that the workflow run for
   this correlation id is complete.

The bridge flushes the discussion record to JSONL at the end of the
callback. The recess state then survives a bridge restart.

## The trigger-fires sequence

A trigger fires in one of two places:

- **Inbound comment path** — `#handleDiscussionComment` calls
  `resume.processInbound(ctx)` for every comment. The scheduler walks
  `ctx.open_rfcs`, computes
  `observed = { replies: history.length - history_index_at_open, opened_at }`,
  and feeds each `(trigger, observed, Date.now())` triple to `evaluateTrigger`.
  The scheduler re-dispatches and cancels the RFCs that fired.
- **Elapsed timer path** — `ElapsedScheduler` (embedded in
  `ResumeScheduler`) fires `#fireElapsed(correlationId)` on its own
  schedule. The scheduler walks `store.index.values()` to look up the
  context. It then re-dispatches and cancels.

Either way, re-dispatch goes through the shared `Dispatcher`:

1. **The scheduler builds `resumeContext`** as
   `JSON.stringify({ correlation_id, history_since })` where
   `history_since = ctx.history.slice(history_index_at_open)`.
2. **`Dispatcher.dispatch(...)`** registers a fresh callback token,
   starts a new acknowledgement, fires the workflow with the resume
   payload, appends the prompt to history, and flushes the store. The
   workflow sees the *new* correlation id on its next callback. The
   *original* correlation id only survives inside `resume_context`.
3. **`cancelRecess(ctx, correlationId)` cancels the original RFC** and
   deletes `open_rfcs[correlationId]`. It also clears any elapsed timer
   for that RFC.
4. **The new workflow run produces a fresh verdict.** It is usually
   `adjourned` with final replies. A second `recessed` is also valid.
   `ResumeScheduler` then tracks the new RFC the same way.

## Accumulate replies before the trigger fires

If an RFC is open and a comment arrives but the trigger does not yet
fire (e.g., `replies: 3` and only one comment arrived):

- The bridge appends the inbound comment to `ctx.history`. The next
  evaluation then sees the wider window.
- `processInbound(ctx)` returns `freshDispatchAllowed: false` because
  `hasOpenRfc` is true and `fired` is zero. `#handleDiscussionComment`
  then skips the rate-limit + `Dispatcher.dispatch` branch. It starts no
  parallel workflow run on the same thread.
- The bridge updates `ctx.last_active_at` and flushes the store.

The bridge consults the rate limiter only when `freshDispatchAllowed` is
true. The rate limiter ignores comments that accumulate toward an open
trigger, because those comments do not consume workflow runs.

## Common failure shapes

| Symptom                                                       | Cause                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Elapsed trigger never fires after bridge restart              | `ResumeScheduler.rearm()` walks `store.index.values()` and re-schedules any rfc with a persisted `due_at`. Check whether the rfc on disk has `due_at`. Check whether `rearm()` ran. `service.start()` calls it |
| `missing_input` trigger never fires despite enough comments   | The scheduler compares the `replies` count against `history.length - history_index_at_open`. Check that webhook delivery reaches the bridge. Check that comments appear in `ctx.history` |
| Re-dispatch happens but the workflow lacks prior context      | `resume_context` carries `history_since`, the slice from `history_index_at_open` onward. It does *not* carry the full history. The workflow must thread it through its prompt itself |
| Two parallel workflow runs on the same thread                 | A fresh dispatch fired while an RFC was open. Inspect the logs around `processInbound` to confirm `freshDispatchAllowed` was correctly false, and that no other code path bypassed it |

## Verify

You have reached the outcome of this guide when:

- A `recessed` verdict posts every `reply` in the callback as a threaded
  comment. It removes the "EYES" reaction. It leaves the discussion open
  with `open_rfcs[correlation_id]` written into the matching JSONL
  record at `data/bridges/discussions.jsonl`. The shared
  `services/bridge` gRPC service saves that record.
- Later comments on the discussion accrue into the bridge's history and
  spawn no new workflow runs. Verify with the Actions tab. No new run
  appears while `hasOpenRfc` holds.
- When the trigger condition is met (replies count reached or elapsed
  duration passed), a fresh workflow run appears in the Actions tab. Its
  `resume_context` input carries the original `correlation_id` and the
  `history_since` slice.
- The resumed workflow's lead reads the accumulated comments and posts
  a follow-up reply (or another `recessed`) back into the same thread.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
