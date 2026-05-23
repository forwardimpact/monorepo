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
| `createBridgeServer` | Hono server wiring a channel webhook route and `/api/callback/:token` together |
| `Acknowledgement` | Reaction-plus-optional-typing-verb lifecycle for "I received your message" feedback |
| `Dispatcher` | Composes callback registration, acknowledgement, workflow dispatch, history append, and rollback-on-failure into one call |
| `createCallbackHandler` | Inbound-callback skeleton with verdict routing (`adjourned` / `failed` / `recessed`) and span instrumentation |
| `ResumeScheduler` | Channel-agnostic suspend/resume lifecycle for `recessed` verdicts; wraps `ElapsedScheduler` |
| `CallbackRegistry` | In-memory `correlation_id → token` registry with TTL and atomic consume |
| `DiscussionContextStore` | Durable per-thread state in `libindex` JSONL, keyed by `(channel, discussion_id)` |
| `RateLimiter` | Sliding-window per-thread rate limit so a noisy channel cannot DoS the workflow |
| `ProgressTicker` | Tick-and-stop timer so the host can show progress while the workflow runs |
| `appendHistory` | Bounded message history (default cap: 10 entries; oldest dropped on overflow) |
| `buildPrompt` | Prompt builder that prepends recent history bounded by exchange count and char cap |
| `dispatchWorkflow` | GitHub Actions `workflow_dispatch` POST with the agreed input shape |
| `evaluateTrigger` | Caller-clock resume-trigger evaluation (kinds: `responses`, `elapsed`, `either`) |
| `parseIsoDuration` | ISO-8601 duration parser (`P1D`, `PT12H`, `P1DT6H`) used by `evaluateTrigger` |

The top four — `Acknowledgement`, `Dispatcher`, `createCallbackHandler`, and
`ResumeScheduler` — are the composition layer. A real bridge wires the channel
SDK into these constructors and lets each one own its slice of the dance; the
primitives below them are still available when you need to step outside the
shared composition.

Two injection rules keep the surface testable from any host. Storage is
**caller-injected**: the `DiscussionContextStore` constructor takes a
`StorageInterface` from `@forwardimpact/libstorage` as its first positional
argument, and the library never constructs storage on its own. The trigger
evaluator is **clock-injected**: `evaluateTrigger(trigger, observed, now)`
takes `now` as a parameter, never calling `Date.now()` inside the library.

## Compose a bridge server

The minimum shape a channel adapter needs is a Hono server with a
channel-shaped webhook route and a workflow callback route. `createBridgeServer`
mounts both routes on a Hono app and returns lifecycle handles. Both routes
hand the raw Hono `Context` to host-supplied callbacks — the host owns
signature verification, token redemption, and channel-shaped responses:

```js
import {
  createBridgeServer,
  CallbackRegistry,
  DiscussionContextStore,
} from "@forwardimpact/libbridge";
import { createStorage } from "@forwardimpact/libstorage";

const storage = createStorage("bridges/example");
const store = new DiscussionContextStore(storage);
const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000 });

const bridge = createBridgeServer({
  config: { host: "0.0.0.0", port: 8080 },
  logger,
  webhookPath: "/api/messages",
  onWebhook: async (c) => {
    const event = await verifyChannelSignature(c);
    await handleChannelEvent({ event, store, registry });
    return c.body(null, 200);
  },
  onCallback: async (c) => {
    const meta = registry.consume(c.req.param("token"));
    if (!meta) return c.json({ error: "Unknown token" }, 404);
    const payload = await c.req.json();
    if (payload.correlation_id !== meta.correlationId) {
      return c.json({ error: "Correlation ID mismatch" }, 400);
    }
    const ctx = await store.loadByChannel("example", meta.meta.discussionId);
    if (payload.verdict === "adjourned") {
      for (const reply of payload.replies) {
        await postChannelMessage(ctx.discussion_id, reply.body);
      }
    } else if (payload.verdict === "failed") {
      await postChannelMessage(ctx.discussion_id, `Failed: ${payload.summary}`);
    }
    return c.json({ ok: true }, 200);
  },
});

await bridge.start();
```

`createBridgeServer` mounts `POST <webhookPath>` and
`POST /api/callback/:token` on a Hono app, captures the raw POST body on
`c.get("rawBody")` for signature verification, and returns
`{ start, stop, app, address }`. The host owns lifecycle, the channel SDK,
and the verdict-to-channel translation (a GraphQL `addDiscussionComment` for
GitHub, a `botbuilder` activity for Teams, etc.).

## Persist per-thread context

Each thread (a Discussion, a Teams conversation) carries its own context
record, keyed by `(channel, discussion_id)`:

```text
{
  id: "<channel>:<discussion_id>",
  channel: "github-discussions" | "msteams",
  discussion_id: string,
  history: Array<{role: "user"|"assistant", text: string}>,
  participants: Array<{name, kind: "agent"|"human", external_id?, metadata?}>,
  open_rfcs: Record<correlationId, {trigger, opened_at, history_index_at_open}>,
  lead: string,
  pending_callbacks: Record<token, correlationId>,
  last_active_at: number,
}
```

`DiscussionContextStore` extends `BufferedIndex` from `@forwardimpact/libindex`,
so the host appends records with `add()` and persists them with `flush()`:

```js
import { DiscussionContextStore } from "@forwardimpact/libbridge";
import { appendHistory } from "@forwardimpact/libbridge";

const store = new DiscussionContextStore(storage);

const ctx = (await store.loadByChannel("github-discussions", discussionId)) ?? {
  id: DiscussionContextStore.keyOf("github-discussions", discussionId),
  channel: "github-discussions",
  discussion_id: discussionId,
  history: [],
  participants: [],
  open_rfcs: {},
  lead: "release-engineer",
  pending_callbacks: {},
  last_active_at: Date.now(),
};

appendHistory(ctx.history, { role: "user", text: "Should we add nested levels?" });
ctx.last_active_at = Date.now();
await store.add(ctx);
await store.flush();
```

The store reads, appends, and writes through the injected storage — no
filesystem access inside the library. Records older than `conversationTtlMs`
(default 24h) are evicted by a background sweep; hosts running on Lambda or a
managed storage tier swap the storage implementation without touching libbridge.

## Issue and verify callback tokens

A bridge dispatches a workflow run and waits for the workflow to POST back its
verdict. The host registers a `(correlationId, meta)` pair and receives a
randomly generated token; the host embeds the token in the callback URL; the
workflow echoes it; the host consumes the token once and rejects all
subsequent attempts. `consume()` is atomic — it removes the entry and returns
its metadata in one call.

```js
import { randomUUID } from "node:crypto";
import {
  CallbackRegistry,
  dispatchWorkflow,
} from "@forwardimpact/libbridge";

const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000 });

const correlationId = randomUUID();
const token = registry.register(correlationId, { discussionId });
await dispatchWorkflow({
  workflowFile: "kata-dispatch.yml",
  ref: "main",
  repo: "owner/repo",
  token: ghInstallationToken,
  prompt,
  callbackUrl: `${publicUrl}/api/callback/${token}`,
  correlationId,
  discussionId,
});

// In the `onCallback` handler passed to createBridgeServer:
async function onCallback(c) {
  const meta = registry.consume(c.req.param("token"));
  if (!meta) return c.json({ error: "Unknown token" }, 404);
  const payload = await c.req.json();
  if (payload.correlation_id !== meta.correlationId) {
    return c.json({ error: "Correlation ID mismatch" }, 400);
  }
  // …deliver replies, recess, or fail per payload.verdict…
  return c.json({ ok: true }, 200);
}
```

The registry is in-memory; for multi-process bridges, persist
`pending_callbacks` on each `DiscussionContextStore` record so the host can
re-register tokens on restart. The `correlation_id` echoes through the
workflow and is checked against `meta.correlationId` to defend against
token-and-payload mismatches.

## Evaluate recess triggers

Long-running RFCs use the libeval `Recess` verdict to wait for an external
signal. A trigger is one of three shapes:

- `{ kind: "responses", responses: N }` — fire when at least `N` new responses
  arrive since the recess opened.
- `{ kind: "elapsed", elapsed: "P1D" }` — fire after an ISO-8601 duration
  passes. Days, hours, minutes, seconds supported (`P14D`, `PT12H`, `P1DT6H`).
- `{ kind: "either", responses?: N, elapsed?: "P1D" }` — fire on whichever
  arm satisfies first.

`evaluateTrigger(trigger, observed, now)` returns `{ fired: boolean, due_at?: number }`
where `due_at` is the absolute ms-epoch when an elapsed arm will fire (useful
for scheduling a wake-up). The host owns `now` so unit tests stay deterministic:

```js
import { evaluateTrigger } from "@forwardimpact/libbridge";

const trigger = { kind: "elapsed", elapsed: "P1D" };
const observed = { opened_at: Date.now() - 25 * 60 * 60 * 1000 };

const result = evaluateTrigger(trigger, observed, Date.now());
if (result.fired) {
  await dispatchWorkflow({
    workflowFile: "kata-dispatch.yml",
    ref: "main",
    repo: "owner/repo",
    token: ghInstallationToken,
    prompt: "Resume requested.",
    callbackUrl,
    correlationId: newCorrelationId,
    discussionId,
    resumeContext: JSON.stringify({
      correlation_id: priorCorrelationId,
      history_since: historySliceSinceRecess,
    }),
  });
}
```

`evaluateTrigger` is pure: it takes a trigger, an observation
(`{ responses?, opened_at? }`), and a clock reading, and returns whether the
observation satisfies the trigger. The host calls it whenever a candidate
event arrives — for `responses`, on every new channel message; for `elapsed`,
on a host-scheduled wake-up at `due_at`.

## Verify

You have reached the outcome of this guide when:

- You can stand up a Hono server with channel-webhook and
  `/api/callback/:token` routes via `createBridgeServer`, with the host's
  channel-specific SDK glue only inside `onWebhook` and `onCallback`.
- You can persist per-thread state through `DiscussionContextStore` backed by
  an injected `libstorage` instance and keyed by `(channel, discussion_id)`.
- You can `register`, dispatch, and one-shot `consume` callback tokens through
  `CallbackRegistry`, with `correlation_id` echoed end-to-end.
- You can evaluate `responses`, `elapsed`, and `either` recess triggers
  against a caller-supplied clock and route the resume back through
  `dispatchWorkflow` with a JSON-encoded `resume_context`.

## What's next

<div class="grid">

<!-- part:card:../predictable-team -->

</div>
