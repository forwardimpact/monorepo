# libbridge

`services/ghbridge` and `services/msbridge` share these channel-agnostic
primitives.

## Invariants

- **No channel SDKs.** Never import `botbuilder`, `@octokit/*`, or any other
  channel-specific SDK from this package. Channel adapters own the SDKs.
- **No GraphQL or REST strings.** Never compose `addDiscussionComment` or
  `addReaction` mutations, or any channel-specific URL beyond the
  workflow-dispatch endpoint. That endpoint is GitHub-Actions-shaped. It is
  not channel-shaped.
- **Caller-injected clock.** `evaluateTrigger(trigger, observed, now)` takes
  `now` as a parameter. Never call `Date.now()` from trigger evaluation.

Security audits that cover libbridge apply these audit-time invariants:

- **Bridge-parity.** Every surface registered in `IDENTITY_CONTRACTS`
  (`services/ghuser/src/identity-contracts.js`) beyond `github-discussions`
  carries a contract at least as strong as the `bridgePendingDispatchProof`
  default. A weaker contract (e.g. equality-only) bypasses the
  `putPendingDispatch` proof and still issues dispatch. Flag unless the
  bridge README documents an explicit opt-out rationale.
- **Timing-parity.** Any `CallbackRegistry` (or sibling registry) lookup that
  scans a stored collection maintains a secondary index. Hits and misses then
  share an O(1) path. The lookup may instead carry an explicit
  `scan-by-design` comment with a security review of response-shape parity.

## Bridge contract

A "bridge" relays human messages from a channel (GitHub Discussions,
Microsoft Teams, …) to the Kata dispatch workflow. The bridge posts the
workflow's reply back. Every bridge composes the same libbridge primitives in
the same order. To add `xbridge`, implement four pieces:

1. **Channel intake** — `onWebhook: (c) => Response`. Verify the inbound
   request is authentic. Extract `(threadId, text, ackTarget)`. For
   SDK-driven intake (e.g. Bot Framework's `adapter.process`), wrap the
   SDK in `services/xbridge/src/<channel>.js` so `index.js` never sees the
   express/HTTP shim.

2. **Reaction adapter** —
   `{ add(target) -> reactionId | null, remove(reactionId, target) -> void }`.
   The channel's "I received your message" reaction. The `target` shape is
   opaque to libbridge.

3. **Typing adapter** *(optional)* — `{ send(target, text) -> void }`. Add it
   only if your channel benefits from filler "Crafting..." messages while the
   workflow runs. `Acknowledgement` owns the verb pool and cadence.

4. **Reply handler** — `handleReply(ctx, payload, meta) -> void`. It posts
   `payload.replies`. It appends them to `ctx.history`. It applies the
   verdict (`adjourned` / `failed` / `recessed`). Throw
   `CallbackHandlerError(status, message)` to short-circuit. If the bridge
   supports `recessed`, plug in `ResumeScheduler`. Call `enterRecess` /
   `cancelRecess` from the verdict branches.

Once those exist, the composition is mechanical. Instantiate
`Acknowledgement` with your adapters. Construct a `Dispatcher` over a
`CallbackRegistry` and a host-supplied object that satisfies the
`DiscussionAdapter` typedef. See `services/bridge`. Wire `createBridgeServer`
with `onWebhook` and `createCallbackHandler({ channel, handleReply, ...})`.
`services/ghbridge/src/index.js` shows the canonical way to wire a bridge.

Inside channel intake, the only dispatch call is:

```js
await dispatcher.dispatch({
  ctx, prompt: buildPrompt(text, ctx.history),
  requester, ackTarget, callbackMeta: { threadId },
});
```

`Dispatcher.dispatch` owns the rest. It registers the callback token, starts
the acknowledgement, fires the workflow, appends history, pushes the dispatch
timestamp, and flushes the store. On failure it rolls back.

## Configuration

Every bridge consumes the canonical `BridgeConfig` JSDoc typedef from
`src/index.js`. Channel-specific fields extend it. See each bridge's README
for the channel-specific surface.

## Suspend/resume

When a workflow returns `verdict: "recessed"` with a `trigger`, the
conversation waits. The trigger kind names the lead's intent. `missing_input`
resumes when N new replies arrive on the thread that dispatched. `elapsed`
resumes after an ISO-8601 duration. `escalation_needed` is reserved for
future signal-based resume. The scheduler throws if it sees that kind today.
`ResumeScheduler` owns that lifecycle:

```js
const resume = new ResumeScheduler({
  dispatcher, store, logger,
  buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
  buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
});
await resume.rearm();                         // service start
resume.clear();                               // service stop
const { freshDispatchAllowed } = await resume.processInbound(ctx);
resume.enterRecess(ctx, correlationId, trigger);
resume.cancelRecess(ctx, correlationId);
```

The two `build*` callbacks are the only per-channel inputs. `msbridge`
overrides `buildCallbackMeta` to `{ threadId: ctx.discussion_id }` to match
its `loadDiscussionId` lens.

## What lives where

| Export | Role |
|---|---|
| `Acknowledgement` | reaction + optional typing-verb lifecycle |
| `CallbackRegistry` | token → correlation map with TTL |
| `Dispatcher`, `dispatchWorkflow` | the dispatch dance + workflow URL |
| `TokenResolver` | `(surface, user) → DispatchAuth` via ghuser gRPC |
| `createCallbackHandler`, `validateCallbackPayload` | inbound-callback skeleton + payload validator |
| `RateLimiter` | per-thread dispatch rate cap |
| `ResumeScheduler`, `ElapsedScheduler` | suspend/resume lifecycle + chunked-setTimeout |
| `createBridgeServer` | bridge routes mounted on `@forwardimpact/libhttp` |
| `newDiscussionContext`, `evaluateTrigger`, `parseIsoDuration` | record factory + trigger helpers |
| `prepareLinkResume` | mints link token, augments authorize URL for resume |
| `createLinkCompleteHandler` | factory for the `/api/link-complete` GET handler |
