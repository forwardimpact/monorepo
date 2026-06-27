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

- Node.js 22+
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
| `createBridgeServer` | Hono server wiring a channel webhook route and `/api/callback/:tenant_id/:token` together |
| `Acknowledgement` | Reaction-plus-optional-typing-verb lifecycle for "I received your message" feedback |
| `Dispatcher` | Composes callback registration, acknowledgement, workflow dispatch, history append, and rollback-on-failure into one call |
| `createCallbackHandler` | Inbound-callback skeleton with verdict routing (`adjourned` / `failed` / `recessed`) and span instrumentation |
| `ResumeScheduler` | Channel-agnostic suspend/resume lifecycle for `recessed` verdicts; wraps `ElapsedScheduler` |
| `CallbackRegistry` | In-memory token registry with tenant-bound entries, TTL enforced at lookup, periodic sweep, and atomic consume |
| `DiscussionAdapter` *(typedef)* | The persistence contract every bridge implements: `loadByChannel`, `loadByCorrelation`, `listOpenRecesses`, `add`, `flush`, `shutdown` (plus optional `putPendingDispatch` / `resolvePendingDispatch`) |
| `newDiscussionContext` | Channel-agnostic factory for a fresh per-thread record, keyed by `(channel, discussion_id)` |
| `RateLimiter` | Sliding-window per-thread rate limit so a noisy channel cannot DoS the workflow |
| `ProgressTicker` | Tick-and-stop timer so the host can show progress while the workflow runs |
| `appendHistory` | Bounded message history (default cap: 10 entries; oldest dropped on overflow) |
| `buildPrompt` | Prompt builder that prepends recent history bounded by exchange count and char cap |
| `dispatchWorkflow` | GitHub Actions `workflow_dispatch` POST with the agreed input shape |
| `evaluateTrigger` | Caller-clock resume-trigger evaluation (kinds: `missing_input`, `elapsed`, `escalation_needed`) |
| `parseIsoDuration` | ISO-8601 duration parser (`P1D`, `PT12H`, `P1DT6H`) used by `evaluateTrigger` |

The top four — `Acknowledgement`, `Dispatcher`, `createCallbackHandler`, and
`ResumeScheduler` — are the composition layer. A real bridge wires the channel
SDK into these constructors and lets each one own its slice of the dance; the
primitives below them are still available when you need to step outside the
shared composition.

Two injection rules keep the surface testable from any host. Persistence is
**contract-injected**: every libbridge primitive that touches per-thread state
(`Dispatcher`, `ResumeScheduler`, `createCallbackHandler`,
`createLinkCompleteHandler`) takes a `store` parameter satisfying the
`DiscussionAdapter` typedef, and the library never
constructs persistence on its own. The trigger evaluator is **clock-injected**:
`evaluateTrigger(trigger, observed, now)` takes `now` as a parameter, never
calling `Date.now()` inside the library.

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
} from "@forwardimpact/libbridge";

const store = createDiscussionAdapter();   // see "Persist per-thread context" below
const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000, clock });
registry.startSweepTimer();                // periodic eviction of expired tokens

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
    const tenantId = c.req.param("tenant_id");
    const entry = registry.consume(c.req.param("token"), { tenant_id: tenantId });
    if (!entry) return c.json({ error: "Unknown token" }, 404);
    const payload = await c.req.json();
    if (payload.correlation_id !== entry.correlationId) {
      return c.json({ error: "Correlation ID mismatch" }, 400);
    }
    const ctx = await store.loadByChannel("example", entry.meta.discussionId);
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
`POST /api/callback/:tenant_id/:token` on a Hono app, captures the raw POST
body on `c.get("rawBody")` for signature verification, and returns
`{ start, stop, app, address }`. The host owns lifecycle, the channel SDK,
and the verdict-to-channel translation (a GraphQL `addDiscussionComment` for
GitHub, a `botbuilder` activity for Teams, etc.).

## Persist per-thread context

Each thread (a Discussion, a Teams conversation) carries its own context
record, keyed by `(channel, discussion_id)`. `newDiscussionContext` builds a
fresh record so every bridge agrees on the shape:

```js
import { newDiscussionContext } from "@forwardimpact/libbridge";

const ctx = newDiscussionContext({
  clock,
  channel: "github-discussions",
  discussionId,
  participant: { name: "octocat", kind: "human", external_id: "1234" },
});
// {
//   id: "github-discussions:<discussion_id>",
//   channel, discussion_id,
//   history: [], participants: [participant],
//   open_rfcs: {}, lead: "release-engineer",
//   pending_callbacks: {}, dispatches: [],
//   active_requester: null, last_posted_seq: -1,
//   last_active_at: <clock.now()>,
// }
```

The host owns persistence by implementing the `DiscussionAdapter` typedef and
passing the instance as `store` to `Dispatcher`, `ResumeScheduler`,
`createCallbackHandler`, and `createLinkCompleteHandler`. The contract:

```js
/**
 * @typedef {object} DiscussionAdapter
 * @property {(channel: string, discussionId: string) => Promise<object|null>} loadByChannel
 * @property {(correlationId: string) => Promise<object|null>} loadByCorrelation
 * @property {() => Promise<Array<{correlationId: string, dueAt: number}>>} listOpenRecesses
 * @property {(ctx: object) => Promise<void>} add
 * @property {() => Promise<void>} flush
 * @property {() => Promise<void>} shutdown
 * @property {(target: object) => Promise<void>} [putPendingDispatch]
 * @property {(linkToken: string, expectedSurfaceUserId?: string) => Promise<object|null>} [resolvePendingDispatch]
 */
```

A minimal in-process adapter — durable JSONL via `@forwardimpact/libindex` and
`@forwardimpact/libstorage`, suitable for single-process bridges:

```js
import { BufferedIndex } from "@forwardimpact/libindex";
import { createStorage } from "@forwardimpact/libstorage";
import { appendHistory } from "@forwardimpact/libbridge";

function createInProcessAdapter({ clock }) {
  const storage = createStorage("bridges/example");
  const index = new BufferedIndex(storage, "discussions.jsonl", {}, { clock });

  return {
    async loadByChannel(channel, id) {
      await index.loadData();
      return index.index.get(`${channel}:${id}`) ?? null;
    },
    async loadByCorrelation(correlationId) {
      await index.loadData();
      for (const rec of index.index.values()) {
        if (Object.values(rec.pending_callbacks ?? {}).includes(correlationId)) {
          return rec;
        }
        if (rec.open_rfcs?.[correlationId]) return rec;
      }
      return null;
    },
    async listOpenRecesses() {
      await index.loadData();
      const refs = [];
      for (const rec of index.index.values()) {
        for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {})) {
          if (typeof rfc.due_at === "number") {
            refs.push({ correlationId: cid, dueAt: rfc.due_at });
          }
        }
      }
      return refs;
    },
    add: (ctx) => index.add(ctx),
    flush: () => index.flush(),
    shutdown: () => index.flush(),
  };
}

const store = createInProcessAdapter({ clock });
const ctx = (await store.loadByChannel("github-discussions", discussionId))
  ?? newDiscussionContext({ clock, channel: "github-discussions", discussionId, participant });
appendHistory(ctx.history, { role: "user", text: "Should we add nested levels?" });
ctx.last_active_at = clock.now();
await store.add(ctx);
await store.flush();
```

For multi-process bridges, point the adapter at a shared backend (Redis,
Postgres, or a dedicated persistence service) so every bridge replica sees
the same `(channel, discussion_id)` records and `pending_callbacks` tokens
survive restarts. The Kata Agent Team's monorepo runs the canonical
implementation — a small gRPC service that owns the JSONL files and the TTL
sweep — and `services/ghbridge` / `services/msbridge` wrap a generated
client in a `DiscussionAdapter` to talk to it. Implementations swap freely;
libbridge only sees the contract.

## Issue and verify callback tokens

A bridge dispatches a workflow run and waits for the workflow to POST back its
verdict. The host registers a `(correlationId, meta)` pair — `meta.tenant_id`
is required — and receives a randomly generated token; the host embeds the
token in the callback URL; the workflow echoes it; the host consumes the token
once and rejects all subsequent attempts. `consume(token, { tenant_id })` is
atomic — it removes the entry and returns it in one call, and returns `null`
when the token is unknown, expired, or bound to a different tenant. The
default TTL is two hours, expired entries are dropped at the lookup that
observes them, and `startSweepTimer()` evicts tokens whose dispatch never
calls back (every 10 minutes by default; `stopSweepTimer()` cancels it). Use
`peek(token, { tenant_id })` to inspect an entry without consuming it.

```js
import { randomUUID } from "node:crypto";
import {
  CallbackRegistry,
  dispatchWorkflow,
} from "@forwardimpact/libbridge";

const registry = new CallbackRegistry({ ttlMs: 60 * 60 * 1000, clock });
registry.startSweepTimer();

const correlationId = randomUUID();
const token = registry.register(correlationId, { tenant_id: tenantId, discussionId });
await dispatchWorkflow({
  workflowFile: "kata-dispatch.yml",
  ref: "main",
  repo: "owner/repo",
  token: ghInstallationToken,
  prompt,
  callbackUrl: `${publicUrl}/api/callback/${tenantId}/${token}`,
  correlationId,
  discussionId,
});

// In the `onCallback` handler passed to createBridgeServer:
async function onCallback(c) {
  const entry = registry.consume(c.req.param("token"), {
    tenant_id: c.req.param("tenant_id"),
  });
  if (!entry) return c.json({ error: "Unknown token" }, 404);
  const payload = await c.req.json();
  if (payload.correlation_id !== entry.correlationId) {
    return c.json({ error: "Correlation ID mismatch" }, 400);
  }
  // …deliver replies, recess, or fail per payload.verdict…
  return c.json({ ok: true }, 200);
}
```

The registry is in-memory; for multi-process bridges, persist
`pending_callbacks` on each discussion-context record (via the adapter's
`add()` call) so the host can re-register tokens on restart. The `correlation_id` echoes through the
workflow and is checked against the consumed entry's `correlationId` to defend
against token-and-payload mismatches; the tenant binding ensures a token
issued for one tenant cannot redeem a callback addressed to another.

## Evaluate recess triggers

Long-running RFCs use the libharness `Recess` verdict to wait for an external
signal. A trigger is one of three shapes, named for the lead's intent:

- `{ kind: "missing_input", replies: N }` — fire when at least `N` new
  replies have arrived on the dispatching thread since the recess opened.
- `{ kind: "elapsed", elapsed: "P1D" }` — fire after an ISO-8601 duration
  passes. Days, hours, minutes, seconds supported (`P14D`, `PT12H`, `P1DT6H`).
- `{ kind: "escalation_needed", signal: "<name>" }` — reserved for future
  use. The schema accepts this shape, but the scheduler throws until
  signal-based resume support ships.

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
(`{ replies?, opened_at? }`), and a clock reading, and returns whether the
observation satisfies the trigger. The host calls it whenever a candidate
event arrives — for `missing_input`, on every new channel message; for
`elapsed`, on a host-scheduled wake-up at `due_at`; `escalation_needed`
throws today and will integrate with channel signal intake once that
spec lands.

## Verify

You have reached the outcome of this guide when:

- You can stand up a Hono server with channel-webhook and
  `/api/callback/:tenant_id/:token` routes via `createBridgeServer`, with the
  host's channel-specific SDK glue only inside `onWebhook` and `onCallback`.
- You can persist per-thread state by implementing the `DiscussionAdapter`
  contract — `loadByChannel`, `loadByCorrelation`, `listOpenRecesses`, `add`,
  `flush`, `shutdown` — and build fresh records via `newDiscussionContext`
  keyed by `(channel, discussion_id)`.
- You can `register` tenant-bound tokens, dispatch, and one-shot
  `consume(token, { tenant_id })` through `CallbackRegistry`, with
  `correlation_id` echoed end-to-end and expired tokens rejected at lookup.
- You can evaluate `missing_input` and `elapsed` recess triggers
  against a caller-supplied clock and route the resume back through
  `dispatchWorkflow` with a JSON-encoded `resume_context`.
  `escalation_needed` triggers parse but throw at evaluation until
  signal-based resume ships.

## What's next

<div class="grid">

<!-- part:card:../predictable-team -->

</div>
