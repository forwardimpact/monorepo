---
title: Dispatch a Kata Session From a Teams Mention
description: Trace what happens between an `@Kata Agent` mention in Teams and the verdict reply posted back to the same thread.
---

A user mentions `@Kata Agent` in a Teams thread. The bridge needs to take
that message, build a conversation-history-aware prompt, dispatch the Kata
agent team, show progress while it runs, and post the verdict reply back to
the same thread when the workflow finishes -- all without losing the
correlation between the dispatch and the eventual callback. This page traces
the bounded flow for one such dispatch so you can read logs, debug
mismatches, and predict the bridge's behavior.

For the full setup including credentials and tunneling, see
[Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/).

## Prerequisites

- Completed the
  [Bridge Microsoft Teams to the Agent Team](/docs/services/bridge-conversations/)
  guide -- `msbridge` is running, the tunnel is published, the Teams app is
  sideloaded, and `@Kata Agent hello` is acknowledged in your test thread.

## The dispatch sequence

When the bridge receives an `activity.type === "message"` from the Bot
Framework, it runs a fixed sequence:

1. **Rate-limit check** — `RateLimiter` enforces a sliding-window cap per
   conversation. Above the cap, the bridge sends a short rejection notice
   and returns; nothing is dispatched.
2. **Discussion context load** — `DiscussionContextStore` loads any prior
   record for this conversation from `data/bridges/msbridge/`. A new
   conversation starts with an empty history.
3. **History append + prompt build** — `appendHistory` adds the new user
   message to the bounded history (default cap: 10 entries; oldest dropped).
   `buildPrompt` prepends recent history bounded by exchange count and
   character cap.
4. **Correlation registration** — a fresh `correlation_id` (UUIDv4) is
   minted. `CallbackRegistry` stores `correlation_id → callback_token`
   with a TTL so the eventual callback can find the right Teams thread.
5. **Workflow dispatch** — `dispatchWorkflow` POSTs to GitHub Actions with
   the workflow file `kata-dispatch.yml`, the prompt, and a
   `callback_url` constructed from `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` and
   the token.
6. **Progress ticker start** — `ProgressTicker` schedules a status update
   every ~25 seconds. Each tick rewrites the message with a new randomized
   verb (`Moonwalking`, `Unravelling`, `Tempering`, `Crafting`, `Simmering`,
   `Percolating`, `Decoding`) so the user can tell the work is still
   running.

The bridge returns from the webhook immediately after step 6. The
correlation registry holds the thread reference until the workflow calls
back.

## The callback sequence

When `kata-dispatch.yml` finishes, the workflow POSTs to
`POST /api/callback/:token` on the bridge. The bridge:

1. **Validates the payload** — `validateCallbackPayload` checks the JSON
   shape: a non-empty string `correlation_id`, a non-empty string `verdict`,
   a string `summary`, and a `run_url` that parses as `https://github.com`.
   Channel-specific extras (`replies`, `trigger`, `discussion_id`) are
   accepted but ignored — Teams does not render those surfaces.
2. **Resolves the conversation** — the registry consumes the token,
   yielding the original Teams conversation reference. If the token is
   missing or expired, the callback returns 404 and nothing is posted.
3. **Stops the progress ticker** — the ticker is cleared so no further
   randomized verbs overwrite the final reply.
4. **Posts the reply** — `formatReply(payload)` returns `payload.summary`
   as the message body, sent back into the same thread via the Bot
   Framework adapter.
5. **Appends the reply to history** — the assistant message is appended to
   `DiscussionContextStore` so the next mention in the same conversation
   has the full exchange in its prompt.

## Common failure shapes

| Symptom                                              | Cause                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Status verb cycles forever; no reply                 | Workflow ran but `callback_url` was unreachable (check tunnel hostname drift)    |
| Callback 404, summary never posted                   | Correlation token TTL expired before the workflow finished                       |
| Bridge log shows `TEI request failed` / similar      | Workflow failed upstream; the bridge has no payload to render — check Actions    |
| `Sorry, something went wrong.` posted to thread      | `onTurnError` caught an exception in `#handleMessages` — check bridge log        |

When `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` and the Azure Bot messaging
endpoint diverge (different tunnel hostnames), the inbound webhook works
but the callback fails. Both endpoints must be the current tunnel
hostname.

## Verify

You have reached the outcome of this guide when:

- A new `@Kata Agent <prompt>` mention shows the cycling status word
  within ~25 seconds of the mention.
- The Actions tab on the configured repository shows a fresh
  `kata-dispatch.yml` run triggered by the bridge dispatch.
- When the run finishes, the facilitator's summary replaces the status
  word in the same thread.
- A follow-up mention in the same thread reaches the agent team with the
  prior exchange in context (visible in the dispatched workflow's prompt
  input).

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
