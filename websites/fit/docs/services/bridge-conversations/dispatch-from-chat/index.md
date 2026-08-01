---
title: Dispatch a Kata Session From a Teams Mention
description: Trace what happens between an `@Kata Agent` mention in Teams and the verdict reply posted back to the same thread.
---

A user mentions `@Kata Agent` in a Teams thread. The bridge must take that
message and build a prompt that carries the conversation history. It must
dispatch the Kata agent team. It must acknowledge the user while the team
runs. It must post the reply back into the same thread when the workflow
finishes. It must not lose the correlation between the dispatch and the
callback. This page traces the bounded flow for one dispatch. Use the page
to read logs, debug mismatches, and predict the bridge's behaviour.

For the full setup with credentials and the tunnel, see
[Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/).

## Prerequisites

- Complete the
  [Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/)
  guide. `msbridge` runs. The tunnel is published. The Teams app is
  sideloaded. The bridge acknowledges `@Kata Agent hello` in your test
  thread.

## The dispatch sequence

A Teams activity arrives at `POST /api/messages`. The Bot Framework adapter
routes it into `MsBridgeService.#handleNewMessage`. That method runs a fixed
sequence:

1. **Activity filter** — the handler returns immediately unless the activity
   has `activity.type === "message"`, a non-empty `text`, a
   `conversation.id`, and a `from.id`. It also drops messages the bot sent
   itself. The `from.id` becomes the dispatch's `requester`. The `requester`
   drives the per-user auth step and the inbox-injection step below. A
   multi-tenant deployment also resolves the activity's Entra tenant here.
   It drops activities from unknown tenants and from non-active tenants. A
   single-tenant deployment binds the `default` tenant.
2. **Conversation reference capture** — `TurnContext.getConversationReference`
   produces an opaque reference. The bridge needs that reference to post the
   reply later. The bridge stores it on `participants[0].metadata` of the
   discussion context.
3. **Discussion context load or create** —
   `DiscussionAdapter.loadByChannel("msteams", threadId)` calls the shared
   `services/bridge` gRPC service. The service returns any prior record for
   this conversation from `data/bridges/discussions.jsonl`, keyed by
   `msteams:<thread-id>`. A new conversation starts with an empty history
   from `newDiscussionContext`.
4. **History append** — `appendHistory` adds the user turn to `ctx.history`
   immediately as `{ role: "user", text, author: requester }`, with a cap of
   10 entries. The bridge then persists the context. Both steps happen
   before the bridge decides whether to dispatch. Messages that never
   dispatch still widen the next prompt's window.
5. **Resume gate** — `ResumeScheduler.processInbound(ctx)` evaluates any
   open RFCs. It uses the same library mechanics as
   [the ghbridge resume guide](/docs/services/bridge-discussions/resume-recessed/).
   When an RFC is open and no trigger fires, `freshDispatchAllowed` is
   false. The message already accrued to history. The handler then returns
   and dispatches nothing.
6. **Inbox injection** — a workflow run can already be in flight for this
   thread. `ctx.pending_callbacks` is then non-empty and
   `ctx.active_requester` is set. The bridge starts no parallel run:
   - the bridge queues a message from the *same* requester to the active
     session's inbox with `EnqueueInbox` on the shared `bridge` service, so
     the active run can pick it up mid-flight;
   - a message from a *different* requester gets `"A session is in
     progress on this thread. Your message was not forwarded to the
     active run."` and the bridge does not queue it.
7. **Rate-limit check** — `RateLimiter.check(threadId, ctx.dispatches)`
   enforces a sliding-window cap of 5 dispatches per 60 seconds. Above
   the cap, the bridge replies `"You're sending messages too quickly.
   Please wait a moment before trying again."`. It then persists the
   context and returns. It dispatches nothing.
8. **Dispatch dance** — `Dispatcher.dispatch({ ctx, prompt, requester,
   ackTarget, callbackMeta, workflowInputs })` from libbridge performs,
   in order:
   - resolves the tenant, then the dispatch credential for `requester`
     with per-user GitHub auth through `services/ghuser`. A user who did
     not link GitHub gets `{ kind: "link_required" }` back. The bridge
     then stashes a pending dispatch and posts a sign-in link. It does
     not run the workflow. It also renders `reauth_required` and
     `transient` results into the thread. It throws neither;
   - mints a fresh `correlation_id` with `randomUUID()`;
   - calls `CallbackRegistry.register(...)` to issue a callback token.
     The token is also a UUID and has a 2h TTL. It carries the requester
     and the tenant on its metadata. The call records
     `ctx.pending_callbacks[token] = correlationId`, and marks
     `ctx.active_requester = requester`;
   - starts the acknowledgement on the user's message. It adds a `like`
     reaction immediately through the Bot Framework reaction adapter. It
     then posts a randomized typing verb every ~25 seconds (`Moonwalking`,
     `Unravelling`, `Tempering`, `Crafting`, `Simmering`, `Percolating`,
     `Decoding`);
   - calls `dispatchWorkflow` with the workflow file `kata-dispatch.yml`, the
     prompt from `buildPrompt(text, ctx.history)`, the callback URL
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

`kata-dispatch.yml` finishes, or it streams an interim reply mid-run. The
workflow then POSTs to `/api/callback/<tenant_id>/<token>` on the bridge.
The shared `createCallbackHandler` skeleton from libbridge runs, in
order:

1. **Payload validation** — `validateCallbackPayload(body)` is lenient by
   design. It requires only `correlation_id`. It coerces a missing
   `verdict` to `"unknown"`, a missing `summary` to `""`, and missing
   `replies` to `[]`, capped at 50 entries. It truncates strings beyond
   `MAX_FIELD_LENGTH` (2000). It passes through optional `discussion_id`,
   `trigger`, and `run_url` when they are present. It treats a payload
   without a `kind` field as `kind: "terminal"`. Invalid JSON or a
   missing `correlation_id` returns 400.
2. **Token lookup** — a `terminal` payload **consumes** the token.
   `CallbackRegistry.consume(token)` atomically looks up and deletes the
   registry entry. A streamed payload only **peeks**. The token stays
   valid for the run's later callbacks. Unknown tokens and expired
   tokens return 404. The bridge posts nothing.
3. **Acknowledgement finish** — on terminal callbacks only,
   `Acknowledgement.finish(token)` stops the typing ticker and removes
   the `like` reaction from the user's message.
4. **Correlation match** — if the payload's `correlation_id` does not
   equal the one stored against the token, the request returns 400. A
   leaked token then cannot deliver a reply that does not belong to this
   dispatch.
5. **Context load** — the bridge calls
   `loadByChannel("msteams", threadId, tenant_id)` with the metadata
   stored against the token. A missing context returns 410.
6. **Streamed-reply dedupe** — a streamed payload whose `seq` is at or
   below `ctx.last_posted_seq` returns 200 with `{ dedupe: true }` and
   posts nothing. For any other streamed payload, the bridge wraps the
   `body` as a single reply for delivery. `ctx.last_posted_seq` then
   advances after the post.
7. **Pending callback cleanup** — on terminal callbacks, the bridge
   deletes `ctx.pending_callbacks[token]` and clears
   `ctx.active_requester`. The bridge then never honours the same token
   twice. The inbox accepts no more injections for this run.
8. **Reply delivery** — msbridge's `#handleReply` posts each unstreamed
   reply as a separate `sendActivity` through the stored conversation
   reference. An unstreamed reply is a `payload.replies` entry with no
   `kind` field. The handler filters out replies it already streamed
   mid-run. It then appends each posted reply to `ctx.history` as an
   `{role: "assistant"}` entry. If the conversation reference is missing,
   the handler throws
   `CallbackHandlerError(410, "Conversation reference missing")` and the
   request returns 410.
9. **Verdict application** — `#handleReply` switches on `payload.verdict`:
   - `adjourned` — the replies are the whole story. `cancelRecess` clears
     the recess state for this correlation id. The bridge does not post
     the `summary` into the thread.
   - `failed` — the bridge clears the recess state. It posts the
     `summary` into the thread *after* the replies as a final message.
   - `recessed` — the bridge calls
     `ResumeScheduler.enterRecess(ctx, correlationId, trigger, requester)`
     to persist the trigger on `ctx.open_rfcs[correlationId]`. It also
     persists the requester whose message triggered the run. Later
     inbound messages in the same Teams thread accrue toward a
     `missing_input` trigger. An `elapsed` trigger arms a timer, and that
     timer survives a service restart through `rearm()`. The bridge still
     posts the replies (step 8) so the user sees what the team has so far.
   - any other verdict — the bridge clears the recess state. It posts the
     `summary` only when the payload carried no replies.
10. **Inbox reconciliation** — after every non-`recessed` verdict the
    bridge drains the run's inbox with `DrainInbox` past the workflow's
    `last_acted_seq`. It coalesces the messages the run never acted on
    into one prompt. It re-dispatches that prompt as a fresh run. Nothing
    the user typed mid-run is lost.
11. **Store flush** — the bridge writes the updated context
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

When `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` and the Azure Bot messaging
endpoint diverge (different tunnel hostnames), the inbound webhook works
but the callback fails. Both endpoints must be the current tunnel
hostname.

## Verify

You have reached the outcome of this guide when:

- A new `@Kata Agent <prompt>` mention shows a `like` reaction on the
  user's message. A typing verb also cycles in the thread within ~25
  seconds of the mention.
- The Actions tab on the configured repository shows a fresh
  `kata-dispatch.yml` run triggered by the bridge dispatch.
- When the run finishes, the typing ticker stops. The bridge removes the
  reaction. It posts each entry in `payload.replies` as its own message
  in the same thread.
- A follow-up mention in the same thread reaches the agent team with the
  prior exchange in context. You can see it in the prompt input of the
  dispatched workflow.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
