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
   with a non-empty `text` and a `conversation.id` returns immediately;
   no further work is done.
2. **Conversation reference capture** — `TurnContext.getConversationReference`
   produces an opaque reference that the bridge needs to post the reply
   later. It is stored on `participants[0].metadata` of the discussion
   context.
3. **Discussion context load or create** — `DiscussionContextStore.loadByChannel("msteams", threadId)`
   returns any prior record for this conversation from
   `data/bridges/msbridge/`. A new conversation starts with an empty
   history via `newDiscussionContext`.
4. **Rate-limit check** — `RateLimiter.check(threadId, ctx.dispatches)`
   enforces a sliding-window cap of 5 dispatches per 60 seconds. Above
   the cap, the bridge replies `"You're sending messages too quickly.
   Please wait a moment before trying again."`, persists the context,
   and returns; nothing is dispatched.
5. **Dispatch dance** — `Dispatcher.dispatch({ ctx, prompt, ackTarget,
   historyText, callbackMeta })` from libbridge performs, in order:
   - mints a fresh `correlation_id` with `randomUUID()`;
   - calls `CallbackRegistry.register(correlationId, { threadId })` to
     issue a callback token (also a UUID, with a 2h TTL) and records
     `ctx.pending_callbacks[token] = correlationId`;
   - starts the acknowledgement on the user's message — adds a `like`
     reaction immediately via the Bot Framework reaction adapter, then
     posts a randomized typing verb every ~25 seconds (`Moonwalking`,
     `Unravelling`, `Tempering`, `Crafting`, `Simmering`, `Percolating`,
     `Decoding`);
   - calls `dispatchWorkflow` with the workflow file `kata-dispatch.yml`,
     the prompt produced by `buildPrompt(text, ctx.history)`, the
     callback URL `${SERVICE_MSBRIDGE_CALLBACK_BASE_URL}/api/callback/<token>`,
     and the correlation ID;
   - on success: appends the user turn to `ctx.history` (cap 10 entries
     via `appendHistory`), pushes the dispatch timestamp into
     `ctx.dispatches`, and flushes the store;
   - on failure: stops the acknowledgement, consumes the token from the
     registry, removes the pending callback, and rethrows.

If the dispatch throws, the catch in `#handleNewMessage` posts `"Failed to
reach the agent team. Please try again later."` into the thread. The
webhook then returns 200 and the bridge waits for the callback.

## The callback sequence

When `kata-dispatch.yml` finishes, the workflow POSTs to
`/api/callback/<token>` on the bridge. The shared
`createCallbackHandler` skeleton from libbridge runs, in order:

1. **Token consume** — `CallbackRegistry.consume(token)` atomically looks
   up and deletes the registry entry. Unknown or expired tokens return
   404 and nothing is posted.
2. **Acknowledgement finish** — `Acknowledgement.finish(token)` stops the
   typing ticker and removes the `like` reaction from the user's
   message.
3. **Payload validation** — `validateCallbackPayload(body)` is lenient
   by design: only `correlation_id` is required. Missing `verdict` is
   coerced to `"unknown"`, missing `summary` to `""`, missing `replies`
   to `[]`. Strings beyond `MAX_FIELD_LENGTH` (2000) are truncated.
   Optional `discussion_id`, `trigger`, and `run_url` are passed through
   when present. An invalid payload returns 400.
4. **Correlation match** — if the payload's `correlation_id` does not
   equal the one stored against the token, the request returns 400. This
   stops a leaked token from delivering a reply that does not belong to
   this dispatch.
5. **Context load** — `loadByChannel("msteams", threadId)` is called
   with the `threadId` from the token's metadata. A missing context
   returns 410.
6. **Pending callback cleanup** — `ctx.pending_callbacks[token]` is
   deleted so the same token is never honoured twice.
7. **Reply delivery** — msbridge's `#handleReply` posts each
   `payload.replies[i].body` as a separate `sendActivity` through the
   stored conversation reference, then appends each one to
   `ctx.history` as an `{role: "assistant"}` entry. If the conversation
   reference is missing the handler throws `CallbackHandlerError(410,
   "Conversation reference missing")` and the request returns 410.
8. **Verdict application** — `#applyVerdict` branches:
   - `adjourned` — replies are the whole story; the `summary` is not
     posted into the thread.
   - `failed` — the `summary` is posted into the thread *after* the
     replies as a final message.
   - `recessed` — the bridge logs `resume not yet supported on msteams`
     and does not start a resume timer. The replies are still posted
     (step 7) so the user sees what the team has so far.
9. **Store flush** — the updated context (`last_active_at`, history,
   pending callbacks) is written to disk.

## Common failure shapes

| Symptom                                              | Cause                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Typing verb cycles forever; no reply                 | Workflow ran but `callback_url` was unreachable (check tunnel hostname drift)  |
| Callback 404, summary never posted                   | Callback token TTL (2h) expired before the workflow finished                   |
| Callback 400 "Correlation ID mismatch"               | Two dispatches against the same registry entry; only the first wins           |
| Callback 410 "Conversation context missing"          | The JSONL record under `data/bridges/msbridge/` was deleted between dispatch and callback |
| `Sorry, something went wrong.` posted to thread      | `onTurnError` caught an exception inside the Bot Framework turn                |
| `Failed to reach the agent team. Please try again later.` | `Dispatcher.dispatch` rethrew (typically the `workflow_dispatch` POST failed) |

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
