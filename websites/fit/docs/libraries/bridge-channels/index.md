---
title: Bridge a Threaded Channel to the Agent Team
description: Threaded-channel adapters share an intake skeleton, callback registry, durable thread state, and resume-trigger contract — one library, every channel.
---

You are building an adapter that relays messages between a human channel
(GitHub Discussions, Microsoft Teams, the next chat platform someone asks for)
and the Kata agent team's `kata-dispatch` workflow. The first time you do this,
you reach for last project's callback registry, rate limiter, and history-bound
prompt builder. `@forwardimpact/libbridge` gives you those primitives so the
host service can focus on the channel-specific SDK glue and leave thread state,
callback verification, prompt construction, and workflow dispatch to a shared
library.

## Prerequisites

- Node.js 18+
- Install the library and its peers:

```sh
npm install @forwardimpact/libbridge @forwardimpact/libstorage @forwardimpact/libindex
```

- A workflow on the target repository that accepts the channel-bridge payload
  via `workflow_dispatch` (the Kata Agent Team's `kata-dispatch.yml` is the
  reference implementation).
- A GitHub token with `actions:write` on that repository.

## What libbridge owns

libbridge is channel-agnostic: it never imports `botbuilder`, `@octokit/*`, or
any channel-specific SDK. The host service (`services/ghbridge`,
`services/msbridge`, your next adapter) owns the SDK glue, signature
verification, and channel-shaped responses. libbridge owns the shared
primitives every adapter needs:

| Primitive | Purpose |
| --- | --- |
| `createBridgeServer` | Hono server with health, callback, and webhook routes wired together |
| `CallbackRegistry` | Token-based callback verification with TTL and one-shot redemption |
| `DiscussionContextStore` | Durable per-thread state in `libindex` JSONL |
| `RateLimiter` | Per-thread rate limit so a noisy channel cannot DOS the workflow |
| `ProgressTicker` | Status-word ticker so humans see "thinking…" while the workflow runs |
| `appendHistory` | Bounded message history with a host-supplied truncation policy |
| `buildPrompt` | Prompt template fill with history, participants, and channel metadata |
| `dispatchWorkflow` | GitHub Actions `workflow_dispatch` POST with retry and auth |
| `evaluateTrigger` | Caller-clock resume-trigger evaluation (elapsed, message, mention) |

The store is **caller-injected**: pass a `StorageInterface` from
`@forwardimpact/libstorage` (or your own implementation), and the library
never constructs storage on its own. The trigger evaluator is **clock-injected**:
pass `now` as a parameter, never relying on `Date.now()` inside the library.
Both decisions keep the surface testable from any host.

## Compose a bridge server

The minimum shape a channel adapter needs is a Hono server with health, a
channel-shaped webhook route, and a workflow callback route. `createBridgeServer`
wires the standard pieces; the host adds its channel route:

```js
import { createBridgeServer, CallbackRegistry } from "@forwardimpact/libbridge";
import { createStorage } from "@forwardimpact/libstorage";
import { DiscussionContextStore } from "@forwardimpact/libbridge";

const storage = createStorage({ prefix: "data/bridges/example/" });
const store = new DiscussionContextStore({ storage });
const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000 });

const server = createBridgeServer({
  store,
  registry,
  onCallback: async ({ thread, payload }) => {
    if (payload.verdict === "adjourned") {
      for (const reply of payload.replies) {
        await postChannelMessage(thread.id, reply.body);
      }
    } else if (payload.verdict === "recessed") {
      await store.recordRecess(thread.id, payload.trigger);
    } else {
      await postChannelMessage(thread.id, `Failed: ${payload.summary}`);
    }
  },
});

server.post("/api/messages", async (c) => {
  const event = await verifyChannelSignature(c);
  await handleChannelEvent({ event, store, registry });
  return c.text("ok");
});

server.listen({ port: 8080 });
```

`onCallback` is the only host-specific verdict handler — libbridge verifies the
callback token via the registry, looks up the thread context via the store, and
hands `(thread, payload)` to the host. The host's only job is to translate
the verdict into channel-shaped output (a GraphQL `addDiscussionComment` for
GitHub, a `botbuilder` activity for Teams, etc.).

## Persist per-thread context

Each thread (a Discussion, a Teams conversation) carries its own context:
message history, participants, the workflow run ID, open RFCs, and the recess
trigger (if any). `DiscussionContextStore` persists this as JSONL under the
host's configured storage prefix:

```js
import { DiscussionContextStore } from "@forwardimpact/libbridge";

const store = new DiscussionContextStore({ storage });

await store.append(threadId, {
  authorName: "Alice",
  body: "Should we add nested levels?",
  channelMessageId: "MSG_kw...",
});

const context = await store.load(threadId);
console.log(context.history.length);     // 1
console.log(context.participants);       // ["Alice"]
```

The store reads, appends, and writes through the injected storage — no
filesystem access inside the library. Hosts that run on Lambda or a managed
storage tier swap the storage implementation without touching libbridge.

## Issue and verify callback tokens

A bridge dispatches a workflow run and waits for the workflow to POST back its
verdict. The callback URL carries a token issued by the bridge; the workflow
echoes it; the bridge redeems the token once and rejects all subsequent
attempts:

```js
import { CallbackRegistry } from "@forwardimpact/libbridge";

const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000 });

const token = registry.issue({ threadId, runIntent: "discuss" });
await dispatchWorkflow({
  repo: "owner/repo",
  workflow: "kata-dispatch.yml",
  ref: "main",
  inputs: { callback_url: `${publicUrl}/api/callback/${token}` },
  authToken,
});

// Later, when the workflow POSTs back:
server.post("/api/callback/:token", async (c) => {
  const entry = registry.redeem(c.req.param("token"));
  if (!entry) return c.text("forbidden", 403);
  await onCallback({ thread: await store.load(entry.threadId), payload: await c.req.json() });
  return c.text("ok");
});
```

The registry is in-memory by default; for multi-process bridges, inject a
persistent backing store via the registry's adapter interface.

## Evaluate recess triggers

Long-running RFCs use the `Recess` verdict to wait for an external signal
(elapsed time, a new message, a mention). `evaluateTrigger` decides whether a
recess should resume based on a host-supplied `now` and the observation that
just arrived:

```js
import { evaluateTrigger } from "@forwardimpact/libbridge";

const trigger = { kind: "elapsed", durationMs: 24 * 60 * 60 * 1000 };
const observed = { kind: "elapsed", at: Date.now() - 25 * 60 * 60 * 1000 };

if (evaluateTrigger(trigger, observed, Date.now())) {
  await dispatchWorkflow({
    /* ...with resume_context = thread context... */
  });
}
```

`evaluateTrigger` is pure: it takes a trigger, an observation, and a clock
reading, and returns `true` when the observation satisfies the trigger. The
host calls it whenever a candidate event arrives — never from inside libbridge.

## Verify

You have reached the outcome of this guide when:

- You can stand up a Hono server with health, webhook, and callback routes via
  `createBridgeServer`, with the host's channel-specific SDK glue only in the
  webhook route.
- You can persist per-thread state through `DiscussionContextStore` backed by
  an injected `libstorage` instance.
- You can issue, dispatch, and one-shot redeem callback tokens through
  `CallbackRegistry`.
- You can evaluate recess triggers against a caller-supplied clock and route
  the resume back through `dispatchWorkflow`.

## What's next

<div class="grid">

<!-- part:card:../predictable-team -->

</div>
