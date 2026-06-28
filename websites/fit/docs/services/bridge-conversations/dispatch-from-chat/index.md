---
title: Dispatch a Kata Session From a Teams Mention
description: Trace what happens between an `@Kata Agent` mention in Teams and the verdict reply posted back to the same thread.
---

A user mentions `@Kata Agent` in a Teams thread. The bridge needs to take
that message, build a conversation-history-aware prompt, dispatch the Kata
agent team, acknowledge the user while it runs, and post the reply back
into the same thread when the workflow finishes — all without losing the
correlation between the dispatch and the eventual callback. This page
traces the bounded flow for one such dispatch so you can read logs, debug
mismatches, and predict the bridge's behaviour.

For the full setup including credentials and tunnelling, see
[Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/).

## Prerequisites

- Completed the
  [Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/)
  guide — `msbridge` is running, the tunnel is published, the Teams app is
  sideloaded, and `@Kata Agent hello` is acknowledged in your test thread.

## The dispatch sequence

When a Teams activity arrives at `POST /api/messages`, the Bot Framework
adapter routes it into `MsBridgeService.#handleNewMessage`, which runs a
fixed sequence:

1. **Activity filter** — anything that isn't `activity.type === "message"`
   with a non-empty `text`, a `conversation.id`, and a `from.id` returns
   immediately; messages sent by the bot itself are also dropped. The
   `from.id` becomes the dispatch's `requester`, which drives the
   per-user auth and inbox-injection steps below. (Multi-tenant
   deployments additionally resolve the activity's Entra tenant here and
   drop activities from unknown or non-active tenants; single-tenant
   deployments bind the `default` tenant.)
2. **Conversation reference capture** — `TurnContext.getConversationReference`
   produces an opaque reference that the bridge needs to post the reply
   later. It is stored on `participants[0].metadata` of the discussion
   context.
3. **Discussion context load or create** —
   `DiscussionAdapter.loadByChannel("msteams", threadId)` calls the shared
   `services/bridge` gRPC service, which returns any prior record for this
   conversation from `data/bridges/discussions.jsonl` (keyed by
   `msteams:<thread-id>`). A new conversation starts with an empty history via
   `newDiscussionContext`.
4. **History append** — the user turn is appended to `ctx.history`
   immediately (`{ role: "user", text, author: requester }`, cap 10
   entries via `appendHistory`) and the context is persisted — before
   any dispatch decision, so messages that never dispatch still widen
   the next prompt's window.
5. **Resume gate** — `ResumeScheduler.processInbound(ctx)` evaluates any
   open RFCs (same library mechanics as
   [the ghbridge resume guide](/docs/services/bridge-discussions/resume-recessed/)).
   When an RFC is open and no trigger fires, `freshDispatchAllowed` is
   false: the message has already accrued to history, and the handler
   returns without dispatching.
6. **Inbox injection** — if a workflow run is already in flight for this
   thread (`ctx.pending_callbacks` non-empty and `ctx.active_requester`
   set), no parallel run is started:
   - a message from the *same* requester is enqueued to the running
     session's inbox (`EnqueueInbox` on the shared `bridge` service) so
     the active run can pick it up mid-flight;
   - a message from a *different* requester gets `"A session is in
     progress on this thread. Your message was not forwarded to the
     active run."` and is not enqueued.
7. **Rate-limit check** — `RateLimiter.check(threadId, ctx.dispatches)`
   enforces a sliding-window cap of 5 dispatches per 60 seconds. Above
   the cap, the bridge replies `"You're sending messages too quickly.
   Please wait a moment before trying again."`, persists the context,
   and returns; nothing is dispatched.
8. **Dispatch dance** — `Dispatcher.dispatch({ ctx, prompt, requester,
   ackTarget, callbackMeta, workflowInputs })` from libbridge performs,
   in order:
   - resolves the tenant, then the dispatch credential for `requester`
     (per-user GitHub auth via `services/ghuser`). A user who has not
     linked GitHub gets `{ kind: "link_required" }` back — the bridge
     stashes a pending dispatch and posts a sign-in link instead of
     running the workflow; `reauth_required` and `transient` results
     are likewise rendered into the thread rather than thrown;
   - mints a fresh `correlation_id` with `randomUUID()`;
   - calls `CallbackRegistry.register(...)` to issue a callback token
     (also a UUID, with a 2h TTL) carrying the requester and tenant on
     its metadata, records `ctx.pending_callbacks[token] = correlationId`,
     and marks `ctx.active_requester = requester`;
   - starts the acknowledgement on the user's message — adds a `like`
     reaction immediately via the Bot Framework reaction adapter, then
     posts a randomized typing verb every ~25 seconds (`Moonwalking`,
     `Unravelling`, `Tempering`, `Crafting`, `Simmering`, `Percolating`,
     `Decoding`);
   - calls `dispatchWorkflow` with the workflow file `kata-dispatch.yml`, the
     prompt produced by `buildPrompt(text, ctx.history)`, the callback URL
     `${SERVICE_MSBRIDGE_CALLBACK_BASE_URL}/api/callback/<tenant_id>/<token>`
     (`default` tenant when self-hosted), an inbox URL the workflow can poll for
     mid-run messages, and the correlation ID;
   - on success: pushes the dispatch timestamp into `ctx.dispatches` and
     flushes the store;
   - on failure: stops the acknowledgement, consumes the token from the
     registry, removes the pending callback, clears
     `ctx.active_requester`, and rethrows.

If the dispatch throws, the catch in `#handleNewMessage` posts `"Failed to
reach the agent team. Please try again later."` into the thread. The
webhook then returns 200 and the bridge waits for the callback.

## The callback sequence

When `kata-dispatch.yml` finishes — or streams an interim reply mid-run —
the workflow POSTs to `/api/callback/<tenant_id>/<token>` on the bridge.
The shared `createCallbackHandler` skeleton from libbridge runs, in
order:

1. **Payload validation** — `validateCallbackPayload(body)` is lenient
   by design: only `correlation_id` is required. Missing `verdict` is
   coerced to `"unknown"`, missing `summary` to `""`, missing `replies`
   to `[]` (capped at 50 entries). Strings beyond `MAX_FIELD_LENGTH`
   (2000) are truncated. Optional `discussion_id`, `trigger`, and
   `run_url` are passed through when present. A payload without a
   `kind` field is treated as `kind: "terminal"`. Invalid JSON or a
   missing `correlation_id` returns 400.
2. **Token lookup** — a `terminal` payload **consumes** the token
   (`CallbackRegistry.consume(token)` atomically looks up and deletes
   the registry entry); a streamed payload only **peeks**, leaving the
   token valid for the run's later callbacks. Unknown or expired tokens
   return 404 and nothing is posted.
3. **Acknowledgement finish** — on terminal callbacks only,
   `Acknowledgement.finish(token)` stops the typing ticker and removes
   the `like` reaction from the user's message.
4. **Correlation match** — if the payload's `correlation_id` does not
   equal the one stored against the token, the request returns 400. This
   stops a leaked token from delivering a reply that does not belong to
   this dispatch.
5. **Context load** — `loadByChannel("msteams", threadId, tenant_id)` is
   called with the metadata stored against the token. A missing context
   returns 410.
6. **Streamed-reply dedupe** — a streamed payload whose `seq` is at or
   below `ctx.last_posted_seq` returns 200 with `{ dedupe: true }` and
   posts nothing; otherwise its `body` is wrapped as a single reply for
   delivery and `ctx.last_posted_seq` advances after the post.
7. **Pending callback cleanup** — on terminal callbacks,
   `ctx.pending_callbacks[token]` is deleted and `ctx.active_requester`
   is cleared, so the same token is never honoured twice and the inbox
   stops accepting injections for this run.
8. **Reply delivery** — msbridge's `#handleReply` posts each unstreamed
   reply (`payload.replies` entries with no `kind` field — replies
   already streamed mid-run are filtered out) as a separate
   `sendActivity` through the stored conversation reference, then
   appends each one to `ctx.history` as an `{role: "assistant"}` entry.
   If the conversation reference is missing the handler throws
   `CallbackHandlerError(410, "Conversation reference missing")` and the
   request returns 410.
9. **Verdict application** — `#handleReply` switches on `payload.verdict`:
   - `adjourned` — replies are the whole story; recess state for this
     correlation id is cleared (`cancelRecess`) and the `summary` is not
     posted into the thread.
   - `failed` — recess state is cleared and the `summary` is posted into
     the thread *after* the replies as a final message.
   - `recessed` — the bridge calls
     `ResumeScheduler.enterRecess(ctx, correlationId, trigger, requester)`
     to persist the trigger (and the triggering requester) on
     `ctx.open_rfcs[correlationId]`. Subsequent inbound messages in the
     same Teams thread accrue toward a `missing_input` trigger; an
     `elapsed` trigger arms a timer that survives a service restart via
     `rearm()`. The replies are still posted (step 8) so the user sees
     what the team has so far.
   - any other verdict — recess state is cleared; the `summary` is
     posted only when the payload carried no replies.
10. **Inbox reconciliation** — after every non-`recessed` verdict the
    bridge drains the run's inbox (`DrainInbox` past the workflow's
    `last_acted_seq`); messages the run never acted on are coalesced
    into one prompt and re-dispatched as a fresh run, so nothing typed
    mid-run is lost.
11. **Store flush** — the updated context (`last_active_at`, history,
    pending callbacks) is written to disk.

## Common failure shapes

| Symptom                                              | Cause                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Typing verb cycles forever; no reply                 | Workflow ran but `callback_url` was unreachable (check tunnel hostname drift)  |
| Callback 404, summary never posted                   | Callback token TTL (2h) expired before the workflow finished                   |
| Callback 400 "Correlation ID mismatch"               | Two dispatches against the same registry entry; only the first wins           |
| Callback 410 "Conversation context missing"          | The JSONL record in `data/bridges/discussions.jsonl` was deleted (or the `bridge` service swept it past its conversation TTL) between dispatch and callback |
| `Sorry, something went wrong.` posted to thread      | `onTurnError` caught an exception inside the Bot Framework turn                |
| `Failed to reach the agent team. Please try again later.` | `Dispatcher.dispatch` rethrew (typically the `workflow_dispatch` POST failed) |
| `A session is in progress on this thread. …` posted to thread | A different user messaged while a run was active; only the dispatching requester's messages are forwarded into the active run |
| Sign-in link posted instead of a workflow run               | The requester has not linked GitHub (`link_required`); the dispatch is stashed and resumes once the link completes |

When `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` and the Azure Bot messaging
endpoint diverge (different tunnel hostnames), the inbound webhook works
but the callback fails. Both endpoints must be the current tunnel
hostname.

## Verify

You have reached the outcome of this guide when:

- A new `@Kata Agent <prompt>` mention shows a `like` reaction on the
  user's message and a cycling typing verb in the thread within ~25
  seconds of the mention.
- The Actions tab on the configured repository shows a fresh
  `kata-dispatch.yml` run triggered by the bridge dispatch.
- When the run finishes, the typing ticker stops, the reaction is
  removed, and each entry in `payload.replies` is posted as its own
  message in the same thread.
- A follow-up mention in the same thread reaches the agent team with the
  prior exchange in context (visible in the dispatched workflow's prompt
  input).

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
