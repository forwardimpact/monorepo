# libbridge

Channel-agnostic primitives shared by `services/ghbridge` and `services/msbridge`.

## Invariants

- **No channel SDKs.** Never import `botbuilder`, `@octokit/*`, or any other
  channel-specific SDK from this package. Channel adapters own the SDKs.
- **No GraphQL or REST strings.** Never compose `addDiscussionComment` or
  `addReaction` mutations, or any channel-specific URL beyond
  `https://api.github.com/repos/${repo}/actions/workflows/...` (the workflow
  dispatch endpoint, which is GitHub-Actions-shaped not channel-shaped).
- **Caller-injected storage.** `DiscussionContextStore` takes a
  `StorageInterface` from the host service — no implicit `LocalStorage`
  construction inside this package.
- **Caller-injected clock.** `evaluateTrigger(trigger, observed, now)` takes
  `now` as a parameter; never call `Date.now()` from trigger evaluation.

## Bridge contract

A "bridge" is a service that relays human messages from a channel
(GitHub Discussions, Microsoft Teams, …) to the Kata dispatch workflow
and posts the workflow's reply back. Every bridge composes the same
libbridge primitives in the same order.

To add a new bridge `xbridge`, implement four things:

1. **Channel intake** — `onWebhook: (c) => Response`. Verify the inbound
   request is authentic (signature, OAuth, whatever the channel uses) and
   extract `(threadId, text, ackTarget)`. For channels with an
   SDK-driven intake (e.g. Bot Framework's `adapter.process`), wrap the
   SDK inside `services/xbridge/src/<channel>.js` so `index.js` never
   sees the express/HTTP shim.

2. **Reaction adapter** — `{ add(target) -> reactionId | null, remove(reactionId, target) -> void }`.
   The channel's "I received your message" reaction. The `target` shape
   is opaque to libbridge — pick whatever your channel needs (a GraphQL
   subject id, an activity reference, a Slack `(channel, ts)` tuple).

3. **Typing adapter** *(optional)* — `{ send(target, text) -> void }`.
   Only if your channel benefits from filler "Crafting..." messages
   while the workflow runs. `Acknowledgement` owns the verb pool and
   cadence; the adapter only delivers a string.

4. **Reply handler** — `handleReply(ctx, payload, meta) -> void`. Posts
   `payload.replies` to the channel, appends them to `ctx.history`, and
   applies the verdict (`adjourned` / `failed` / `recessed`). Throw
   `new CallbackHandlerError(status, message)` to short-circuit with a
   specific HTTP status (e.g. 410 if the conversation reference is gone).
   If the bridge supports `recessed`, plug in `ResumeScheduler` (below)
   and call `enterRecess` / `cancelRecess` from the verdict branches —
   no hand-rolled timer code.

Once those four pieces exist, the rest is composition:

```js
import {
  Acknowledgement, CallbackRegistry, DiscussionContextStore, Dispatcher,
  RateLimiter, createBridgeServer, createCallbackHandler,
  newDiscussionContext, normalizeBaseUrl,
} from "@forwardimpact/libbridge";

const ack = new Acknowledgement({
  reactionAdapter,         // your channel
  typingAdapter,           // optional
});
const dispatcher = new Dispatcher({
  callbacks: new CallbackRegistry(),
  ack,
  store: new DiscussionContextStore(storage),
  callbackBaseUrl: normalizeBaseUrl(config.callback_base_url),
  workflowFile: "kata-dispatch.yml",
  githubRepo: config.github_repo,
  getGithubToken: () => config.ghToken(),
});
const onCallback = createCallbackHandler({
  channel: "xchannel",
  callbacks, ack, store, logger, tracer,
  spanName: "XBridge.HandleCallback",
  loadDiscussionId: (meta) => meta.meta.threadId,
  handleReply,             // your channel
});
const bridge = createBridgeServer({
  config, logger, tracer,
  webhookPath: "/api/messages",
  onWebhook,               // your channel
  onCallback,
});
```

Inside your channel's intake, the only call you make for dispatch is:

```js
await dispatcher.dispatch({
  ctx,
  prompt: buildPrompt(text, ctx.history),
  ackTarget,               // your channel-shaped target
  historyText: text,
  callbackMeta: { threadId },
});
```

`Dispatcher.dispatch` owns the rest: register the callback token, start
the acknowledgement, fire the workflow, append history, push the
dispatch timestamp, flush the store, and on failure roll back the
acknowledgement and the callback registration.

## Configuration

Every bridge consumes the canonical `BridgeConfig` JSDoc typedef from
`src/index.js`. Channel-specific fields extend it — see each bridge's
README for the channel-specific surface.

## Suspend/resume

When a workflow returns `verdict: "recessed"` with a `trigger`, the
conversation waits — either for N more responses, an elapsed duration,
or "either". `ResumeScheduler` owns that lifecycle for both bridges:

```js
const resume = new ResumeScheduler({
  dispatcher,
  store,
  logger,
  buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
  buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
});

// service start:
await resume.rearm();
// service stop:
resume.clear();

// in the "new message in existing thread" handler:
const { freshDispatchAllowed } = await resume.processInbound(ctx);
if (freshDispatchAllowed) { /* rate-check + dispatcher.dispatch(...) */ }

// in handleReply:
switch (payload.verdict) {
  case "recessed":
    resume.enterRecess(ctx, meta.correlationId, payload.trigger);
    break;
  case "adjourned":
  case "failed":
    resume.cancelRecess(ctx, meta.correlationId);
    break;
}
```

The two `build*` callbacks are the only per-channel inputs. msbridge
overrides `buildCallbackMeta` to `{ threadId: ctx.discussion_id }` to
match its `loadDiscussionId` lens; everything else is shared.

## What lives where

- `Acknowledgement` — reaction + optional typing-verb lifecycle.
- `CallbackRegistry` — in-memory token → correlation map with TTL.
- `DiscussionContextStore` — persisted `(channel, discussion_id)` state.
- `Dispatcher` — the dispatch dance.
- `createCallbackHandler` — the inbound-callback skeleton.
- `RateLimiter` — per-thread dispatch rate cap.
- `ResumeScheduler` — suspend/resume lifecycle (channel-agnostic).
- `ElapsedScheduler` — chunked-setTimeout primitive used by `ResumeScheduler`.
- `createBridgeServer` — Hono + `@hono/node-server` wiring.
- `validateCallbackPayload` — lenient kata-dispatch payload validator.
- `newDiscussionContext` — canonical record-shape factory.
- `evaluateTrigger`, `parseIsoDuration` — recessed-resume trigger helpers.
- `dispatchWorkflow` — the one channel-specific URL (`workflow_dispatch`).
