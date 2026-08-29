---
title: Dispatch an Agent Session From a Teams Mention
description: Trace what happens between a bot mention in Teams and the verdict reply posted back to the same thread.
---

A user mentions the configured bot in a Teams thread. The bridge must take
that message and build a prompt that carries the conversation history. It must
dispatch the agent team. It must acknowledge the user while the team runs. It
must post the reply back into the same thread when the workflow finishes. It
must not lose the correlation between the dispatch and the callback.

This page traces the bounded flow for one dispatch. Use the page to read logs,
debug mismatches, and predict the bridge's behaviour. For the full setup with
credentials and the tunnel, see
[Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/).
The [Kata agent team](https://www.kata.team/) ships the reference dispatch
workflow.

## Prerequisites

- Complete the
  [Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/)
  guide. `msbridge` runs. The tunnel publishes a hostname. You sideloaded the
  Teams app. The bridge acknowledges a mention in your test thread.

## The dispatch sequence

A Teams activity arrives at `POST /api/messages`. The Bot Framework adapter
routes it into `MsBridgeService.#handleNewMessage`. That method runs a fixed
sequence:

1. **Activity filter.** The handler returns unless the activity has
   `activity.type === "message"`, a non-empty `text`, a `conversation.id`, and
   a `from.id`. It drops messages the bot sent itself. The `from.id` becomes
   the dispatch's `requester`, which drives the auth and inbox-injection steps
   below. A multi-tenant deployment resolves the Entra tenant and drops
   unknown or non-active tenants. A single-tenant deployment binds `default`.
2. **Conversation reference capture.** `TurnContext.getConversationReference`
   produces an opaque reference. The bridge stores it on the context's
   `participants[0].metadata` to post the reply later.
3. **Discussion context load or create.**
   `DiscussionAdapter.loadByChannel("msteams", threadId)` calls the shared
   `services/bridge` gRPC service. The service returns any prior record from
   `data/bridges/discussions.jsonl`, keyed by `msteams:<thread-id>`. A new
   conversation starts with an empty history from `newDiscussionContext`.
4. **History append.** `appendHistory` adds the user turn to `ctx.history` as
   `{ role: "user", text, author: requester }`, capped at 10 entries. The
   bridge then persists the context before the dispatch decision. Messages
   that never dispatch still widen the next prompt's window.
5. **Resume gate.** `ResumeScheduler.processInbound(ctx)` evaluates any open
   RFCs. It uses the same library mechanics as
   [the ghbridge resume guide](/docs/services/bridge-discussions/resume-recessed/).
   When an RFC is open and no trigger fires, `freshDispatchAllowed` is false.
   The handler then returns and dispatches nothing.
6. **Inbox injection.** When a run is in flight, `ctx.pending_callbacks` is
   non-empty and `ctx.active_requester` is set. It starts no parallel run:
   - It queues a message from the *same* requester to the active session's
     inbox with `EnqueueInbox` on the shared `bridge` service. The active run
     can pick it up mid-flight.
   - A message from a *different* requester gets `"A session is in progress
     on this thread. The bridge did not forward your message to the active
     run."`. The bridge does not queue that message.
7. **Rate-limit check.** `RateLimiter.check(threadId, ctx.dispatches)`
   enforces a sliding-window cap of 5 dispatches per 60 seconds. Above the
   cap, the bridge replies `"Your messages arrive too quickly. Please wait a
   moment before you try again."`. It then persists the context and returns
   without a dispatch.
8. **Dispatch dance.** `Dispatcher.dispatch({ ctx, prompt, requester,
   ackTarget, callbackMeta, workflowInputs })` from libbridge performs these
   steps in order:
   - It resolves the tenant, then the dispatch credential for `requester`
     with per-user GitHub auth through `services/ghuser`. A user who did not
     link GitHub gets `{ kind: "link_required" }` back. The bridge then
     stashes a pending dispatch, posts a sign-in link, and runs no workflow.
     It renders `reauth_required` and `transient` results into the thread and
     throws neither.
   - It mints a fresh `correlation_id` with `randomUUID()`.
   - It calls `CallbackRegistry.register(...)` to issue a callback token. The
     token is a UUID with a 2h TTL. Its metadata carries the requester and
     tenant. The call records `ctx.pending_callbacks[token] = correlationId`
     and marks `ctx.active_requester = requester`.
   - It starts the acknowledgement on the user's message: a `like` reaction
     through the Bot Framework reaction adapter, then a randomized typing
     verb every ~25 seconds (`Moonwalking`, `Unravelling`, `Tempering`,
     `Crafting`, `Simmering`, `Percolating`, `Decoding`).
   - It calls `dispatchWorkflow` with the bridge's configured dispatch
     workflow file and the prompt from `buildPrompt(text, ctx.history)`. It
     passes the callback URL
     `${SERVICE_MSBRIDGE_CALLBACK_BASE_URL}/api/callback/<tenant_id>/<token>`
     (`default` tenant when self-hosted). It also passes an inbox URL the
     workflow can poll for mid-run messages, and the correlation ID.
   - On success, it pushes the dispatch timestamp into `ctx.dispatches` and
     flushes the store.
   - On failure, it stops the acknowledgement, consumes the registry token,
     removes the pending callback, clears `ctx.active_requester`, and rethrows.

If the dispatch throws, the catch in `#handleNewMessage` posts `"Failed to
reach the agent team. Please try again later."` into the thread. The webhook
then returns 200. The bridge waits for the callback.

## The callback sequence

The dispatch workflow finishes, or it streams an interim reply mid-run. It
then POSTs to `/api/callback/<tenant_id>/<token>` on the bridge. The shared
`createCallbackHandler` skeleton from libbridge runs these steps in order:

1. **Payload validation.** `validateCallbackPayload(body)` requires only
   `correlation_id`. It coerces a missing `verdict` to `"unknown"`, a missing
   `summary` to `""`, and missing `replies` to `[]`, capped at 50 entries. It
   truncates strings beyond `MAX_FIELD_LENGTH` (2000). It passes through
   optional `discussion_id`, `trigger`, and `run_url`. It treats a payload
   without a `kind` field as `kind: "terminal"`. Invalid JSON or a missing
   `correlation_id` returns 400.
2. **Token lookup.** A `terminal` payload **consumes** the token.
   `CallbackRegistry.consume(token)` atomically looks up and deletes the
   registry entry. A streamed payload only **peeks**, and the token stays
   valid for the run's later callbacks. Unknown or expired tokens return
   404, and the bridge posts nothing.
3. **Acknowledgement finish.** On terminal callbacks only,
   `Acknowledgement.finish(token)` stops the typing ticker and removes the
   `like` reaction from the user's message.
4. **Correlation match.** If the payload's `correlation_id` does not equal
   the one stored against the token, the request returns 400. A leaked token
   then cannot deliver a reply for a different dispatch.
5. **Context load.** The bridge calls
   `loadByChannel("msteams", threadId, tenant_id)` with the metadata stored
   against the token. A missing context returns 410.
6. **Streamed-reply dedupe.** A streamed payload whose `seq` is at or below
   `ctx.last_posted_seq` returns 200 with `{ dedupe: true }` and posts
   nothing. For any other streamed payload, the bridge wraps the `body` as a
   single reply. `ctx.last_posted_seq` advances after the post.
7. **Pending callback cleanup.** On terminal callbacks, the bridge deletes
   `ctx.pending_callbacks[token]` and clears `ctx.active_requester`. The
   bridge then never honours the same token twice, and the inbox accepts no
   more injections for this run.
8. **Reply delivery.** The msbridge `#handleReply` method posts each
   unstreamed reply as its own `sendActivity` through the stored conversation
   reference. An unstreamed reply is a `payload.replies` entry with no `kind`
   field. The handler filters out replies it already streamed mid-run. It
   appends each posted reply to `ctx.history` as an `{role: "assistant"}`
   entry. A missing conversation reference returns 410 through
   `CallbackHandlerError(410, "Conversation reference missing")`.
9. **Verdict application.** `#handleReply` switches on `payload.verdict`:
   - `adjourned`: The replies are the complete response. `cancelRecess`
     clears the recess state for this correlation id. The bridge does not
     post the `summary` into the thread.
   - `failed`: The bridge clears the recess state. It posts the `summary`
     into the thread *after* the replies as a final message.
   - `recessed`: The bridge calls
     `ResumeScheduler.enterRecess(ctx, correlationId, trigger, requester)` to
     persist the trigger on `ctx.open_rfcs[correlationId]` with the requester
     whose message triggered the run. Later inbound messages accrue toward a
     `missing_input` trigger. An `elapsed` trigger arms a timer that survives
     a restart through `rearm()`. The bridge still posts the replies (step 8).
   - Any other verdict: The bridge clears the recess state. It posts the
     `summary` only when the payload carried no replies.
10. **Inbox reconciliation.** After every non-`recessed` verdict the bridge
    drains the run's inbox with `DrainInbox` past the workflow's
    `last_acted_seq`. It coalesces the unacted messages into one prompt and
    re-dispatches it as a fresh run. It keeps every mid-run user message.
11. **Store flush.** The bridge writes the updated context
    (`last_active_at`, history, pending callbacks) to disk.

## Common failure shapes

| Symptom                                              | Cause                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Typing verb cycles forever; no reply                 | Workflow ran but `callback_url` was unreachable (check tunnel hostname drift)  |
| Callback 404, summary never posted                   | Callback token TTL (2h) expired before the workflow finished                   |
| Callback 400 "Correlation ID mismatch"               | Two dispatches against the same registry entry. Only the first wins           |
| Callback 410 "Conversation context missing"          | Someone deleted the JSONL record in `data/bridges/discussions.jsonl` between dispatch and callback, or the `bridge` service swept it past its conversation TTL |
| `Sorry, something went wrong.` posted to thread      | `onTurnError` caught an exception inside the Bot Framework turn                |
| `Failed to reach the agent team. Please try again later.` | `Dispatcher.dispatch` rethrew (typically the `workflow_dispatch` POST failed) |
| `A session is in progress on this thread. …` posted to thread | A different user messaged while a run was active. The bridge forwards only the messages of the requester that dispatched the run |
| Sign-in link posted instead of a workflow run               | The requester did not link GitHub (`link_required`). The bridge stashes the dispatch and resumes it once the link completes |

When `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` and the Azure Bot messaging endpoint
use different tunnel hostnames, the inbound webhook works but the callback
fails. Set both to the current tunnel hostname.

## Verify

You have reached the outcome of this guide when:

- A new mention of the configured bot shows a `like` reaction on the user's
  message. A typing verb also cycles in the thread within ~25 seconds.
- The Actions tab on the configured repository shows a fresh dispatch-workflow
  run triggered by the bridge dispatch.
- When the run finishes, the typing ticker stops. The bridge removes the
  reaction and posts each `payload.replies` entry as its own thread message.
- A follow-up mention in the same thread reaches the agent team with the
  prior exchange in context. The dispatched workflow's prompt input shows it.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
