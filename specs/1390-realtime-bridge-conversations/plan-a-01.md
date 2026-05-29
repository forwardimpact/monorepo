# Plan 1390-a Part 1 — Bridge-side streaming contract

[overview](plan-a.md) · [part 2](plan-a-02.md)

## Step 1: Extend Discussion proto with session fields

Add `active_requester` and `last_posted_seq` to the Discussion message so
the dispatch-vs-inject state machine and seq-based dedupe survive bridge
restarts.

**Modified:** `services/bridge/proto/bridge.proto`

```diff
 message Discussion {
   ...
   map<string, string> pending_callbacks = 10;
+  optional string active_requester = 11;
+  int64 last_posted_seq = 12;  // init to -1 at creation site
 }
```

The `last_posted_seq` proto default is `0`, but `SequenceCounter` also
starts at `0`, so the factory function (`newDiscussionContext` in libbridge)
must initialize `last_posted_seq` to `-1` to avoid deduping the first
event.

**Verify:** `bunx fit-codegen --all` succeeds; existing bridge tests pass.

## Step 2: Add inbox broker to services/bridge

Create a per-`correlation_id` message queue stored alongside discussions and
origins.

**Modified:** `services/bridge/proto/bridge.proto`, `services/bridge/index.js`

Proto additions:

```proto
message InboxMessage {
  string correlation_id = 1;
  int64 seq = 2;
  string text = 3;
  string author = 4;
  int64 enqueued_at = 5;
}

message EnqueueInboxRequest { InboxMessage message = 1; }
message DrainInboxRequest { string correlation_id = 1; int64 since_seq = 2; }
message InboxMessages { repeated InboxMessage messages = 1; }
```

RPCs added to the `Bridge` service:

```proto
rpc EnqueueInbox(EnqueueInboxRequest) returns (common.Empty);
rpc DrainInbox(DrainInboxRequest) returns (InboxMessages);
```

Store implementation: add a third `BufferedIndex` (`inbox.jsonl`) to
`services/bridge/index.js`. `EnqueueInbox` assigns a monotonic `seq` per
`correlation_id` (in-memory counter map, reset on restart — the seq is
meaningful only within one session). `DrainInbox` returns messages with
`seq > since_seq`. `Sweep` evicts inbox entries whose `enqueued_at` exceeds
the discussion TTL.

**Verify:** `bunx fit-codegen --all` succeeds; unit test: enqueue 3
messages, drain since seq 1, get 2 back.

## Step 3: Extend callback payload validation

Add `kind`, `seq`, `body`, and `agent` fields to the lenient callback
payload validator.

**Modified:** `libraries/libbridge/src/callback-payload.js`

```javascript
kind: typeof raw.kind === "string" ? raw.kind : "terminal",
seq: typeof raw.seq === "number" ? raw.seq : -1,
body: typeof raw.body === "string" ? truncate(raw.body) : "",
agent: typeof raw.agent === "string" ? truncate(raw.agent) : "",
```

`kind` defaults to `"terminal"` for backward compatibility with the
existing crash-safety callback step which sends no `kind`. Valid kinds:
`"reply"`, `"ack"`, `"terminal"`.

**Verify:** Existing callback-payload tests pass; new tests: payload with
`kind: "reply"` validates; payload without `kind` defaults to `"terminal"`.

## Step 4: Restructure createCallbackHandler for session semantics

Branch on `kind` to implement peek-vs-consume, ack lifecycle, and seq
dedupe. This is the largest change in the plan.

**Modified:** `libraries/libbridge/src/callback-handler.js`

The current handler calls `resolveContext` (which consumes the token,
finishes ack, parses JSON, and loads context) then `runHandleReply`.
Restructure to:

1. Parse JSON and validate payload up front (before token lookup).
2. Determine `isTerminal` from `payload.kind`.
3. Token lookup: `callbacks.consume(token)` for terminal,
   `callbacks.peek(token)` for reply/ack.
4. Ack: `ack.finish` only on terminal.
5. Seq dedupe: if `!isTerminal && payload.seq <= ctx.last_posted_seq`,
   return `200 {ok: true, dedupe: true}`.
6. Normalize payload for `handleReply`: for reply/ack, set
   `payload.replies = [{body: payload.body, agent: payload.agent}]` and
   `payload.verdict = null`.
7. Call `handleReply(ctx, payload, meta)`.
8. Post-reply state update: terminal clears `pending_callbacks[token]` and
   `active_requester`; reply/ack updates `last_posted_seq`.
9. Save and flush.

```javascript
return async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const payload = validateCallbackPayload(body);
  if (!payload) return c.json({ error: "Invalid payload" }, 400);

  const token = c.req.param("token");
  const isTerminal = payload.kind === "terminal";
  const meta = isTerminal ? callbacks.consume(token) : callbacks.peek(token);
  if (!meta) return c.json({ error: "Unknown callback token" }, 404);

  if (isTerminal) {
    await ack.finish(token, ackFinishTarget?.(meta));
  }
  if (payload.correlation_id !== meta.correlationId) {
    return c.json({ error: "Correlation ID mismatch" }, 400);
  }

  const discussionId = loadDiscussionId(meta);
  const ctx = await store.loadByChannel(channel, discussionId);
  if (!ctx) return c.json({ error: "Discussion context missing" }, 410);

  if (!isTerminal && payload.seq >= 0 && payload.seq <= ctx.last_posted_seq) {
    return c.json({ ok: true, dedupe: true }, 200);
  }

  if (!isTerminal) {
    payload.replies = payload.body ? [{ body: payload.body, agent: payload.agent }] : [];
    payload.verdict = null;
  }

  return runHandleReply(c, {
    ctx, meta, payload, handleReply, store, logger, tracer, spanName,
    postReply() {
      if (isTerminal) {
        delete ctx.pending_callbacks[token];
        ctx.active_requester = null;
      } else {
        ctx.last_posted_seq = payload.seq;
      }
    },
  });
};
```

`runHandleReply` is retained unchanged — it owns span lifecycle, error
handling, `ctx.last_active_at`, store save/flush, and the
`CallbackHandlerError` catch. Its only addition is calling the `postReply`
hook (when provided) after `handleReply` succeeds but before the store
flush, so session state updates are atomic with the reply delivery.

The `handleReply` callbacks in ghbridge and msbridge post replies and
append history *before* the verdict switch. A `null` verdict (streaming
events) must skip only the verdict routing, not the reply posting. Place
the guard **inside** the `switch` block as a `default` early return, not
before `postDiscussionReplies`:

**Modified:** `services/ghbridge/index.js` `#handleReply`,
`services/msbridge/index.js` `#handleReply`

```javascript
// After postDiscussionReplies + appendHistory (unchanged)...
switch (payload.verdict) {
  case "recessed": /* ... existing ... */ break;
  case "adjourned": /* ... existing ... */ break;
  case "failed": /* ... existing ... */ break;
  default:
    if (!payload.verdict) return; // streaming event — replies already posted
    /* ... existing default (posts summary if no replies) ... */
}
```

**Verify:** (1) `kind=reply` uses peek, does not consume token, posts one
reply, appends history, updates `last_posted_seq`. (2) `kind=terminal`
consumes token, finishes ack, clears `pending_callbacks` and
`active_requester`, routes verdict. (3) Duplicate seq returns dedupe
response. (4) Legacy payload (no kind) treated as terminal.

## Step 5: Extend Dispatcher — set active_requester, pass inbox_url

Set `active_requester` on the discussion context and construct an inbox URL
alongside the callback URL.

**Modified:** `libraries/libbridge/src/dispatcher.js`,
`libraries/libbridge/src/dispatch.js`

In `Dispatcher.dispatch()`, after
`ctx.pending_callbacks[token] = correlationId`:

```javascript
ctx.active_requester = requester;
const inboxUrl = `${this.#callbackBaseUrl}/api/inbox/${correlationId}`;
```

Pass `inboxUrl` to `dispatchWorkflow()`.

In `dispatchWorkflow()` (`dispatch.js`), add `inboxUrl` parameter and
include in workflow inputs:

```diff
 inputs: {
   prompt,
   callback_url: callbackUrl,
   correlation_id: correlationId,
+  inbox_url: inboxUrl,
   ...(discussionId && { discussion_id: discussionId }),
   ...(resumeContext && { resume_context: resumeContext }),
 }
```

In the dispatch failure catch block (which already deletes
`ctx.pending_callbacks[token]`), also clear:

```javascript
ctx.active_requester = null;
```

**Verify:** After dispatch, `ctx.active_requester` equals `requester`;
workflow inputs include `inbox_url`; on failure rollback,
`active_requester` is null.

## Step 6: Add inbox long-poll route to createBridgeServer

Mount `GET /api/inbox/:correlationId` as a long-poll endpoint.

**Modified:** `libraries/libbridge/src/server.js`,
`libraries/libbridge/src/index.js`

Add optional `onInbox` handler parameter to `createBridgeServer`:

```javascript
if (onInbox) {
  app.get("/api/inbox/:correlationId", async (c) => {
    try { return await onInbox(c); }
    catch (err) { logger.error("bridge.inbox", err); return c.json({ error: "Inbox failure" }, 500); }
  });
}
```

**Created:** `libraries/libbridge/src/inbox-handler.js`

```javascript
export function createInboxHandler({ client, logger, pollTimeoutMs = 30_000, pollIntervalMs = 1_000 }) {
  return async (c) => {
    const correlationId = c.req.param("correlationId");
    const sinceSeq = parseInt(c.req.query("since") ?? "0", 10);
    const deadline = Date.now() + pollTimeoutMs;

    while (Date.now() < deadline) {
      const result = await client.DrainInbox({ correlation_id: correlationId, since_seq: sinceSeq });
      if (result.messages?.length > 0) return c.json({ messages: result.messages });
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return c.json({ messages: [] });
  };
}
```

Export from `libraries/libbridge/src/index.js`.

**Verify:** Enqueue a message, long-poll returns it within 2s; long-poll
with no messages returns empty after timeout.

## Step 7: Add dispatch-vs-inject logic to ghbridge and msbridge intake

When a message arrives on a discussion with an active run, inject into the
inbox or post a static notice instead of dispatching.

**Modified:** `services/ghbridge/index.js`, `services/msbridge/index.js`

In `#handleDiscussionComment` (ghbridge) / `#handleNewMessage` (msbridge),
the existing flow is: load context → append history → `processInbound(ctx)`
→ check `freshDispatchAllowed` → dispatch. The inject guard goes **after**
`processInbound` returns `{ freshDispatchAllowed: true }` (so recess
accounting is honoured) and **before** `dispatcher.dispatch()`. History is
already appended by the existing intake code above the guard, so the inject
path must not append it again:

```javascript
// After processInbound + freshDispatchAllowed check, before dispatch:
if (Object.keys(ctx.pending_callbacks).length > 0 && ctx.active_requester) {
  if (String(requester) === String(ctx.active_requester)) {
    const correlationId = Object.values(ctx.pending_callbacks)[0];
    await this.#client.EnqueueInbox(bridge.EnqueueInboxRequest.fromObject({
      message: { correlation_id: correlationId, text, author: String(requester), enqueued_at: Date.now() },
    }));
    // History already appended by intake above — do not duplicate
    ctx.last_active_at = Date.now();
    await this.#store.add(ctx);
    await this.#store.flush();
    return c.json({ ok: true, injected: true });
  }
  await postStaticNotice(ctx, /* channel-specific posting */);
  return c.json({ ok: true, noticed: true });
}
```

For `#handleDiscussionCreated` (new discussion, first message), the inject
guard is unreachable — `pending_callbacks` is empty on a fresh context.

Add a `postStaticNotice` helper to each bridge that posts a brief comment:
"A session is in progress on this thread. Your message was not forwarded to
the active run."

Wire `createInboxHandler` in both bridges' `createBridgeServer` call:

```javascript
this.#bridge = createBridgeServer({
  ...existing,
  onInbox: createInboxHandler({ client: this.#client, logger }),
});
```

**Verify:** Two messages to the same discussion — first dispatches, second
(while run is active, from same requester) returns `injected: true` and
enqueues. Non-requester message returns `noticed: true` and posts the static
notice.

## Step 8: Handle terminal reconciliation

When a terminal event arrives, check for unconsumed inbox messages past the
run's high-water mark and re-dispatch if any remain.

**Modified:** `libraries/libbridge/src/callback-payload.js`,
`services/ghbridge/index.js` `#handleReply`,
`services/msbridge/index.js` `#handleReply`

Add `last_acted_seq` to the callback payload validator (same lenient
pattern as `seq`):

```javascript
last_acted_seq: typeof raw.last_acted_seq === "number" ? raw.last_acted_seq : -1,
```

The run's `InboxPoller` tracks which messages the lead acted on (see Part
2, Step 5) and reports `last_acted_seq` in the terminal payload. The bridge
drains only messages past that mark — messages the run already processed
are not re-dispatched:

```javascript
// In handleReply, after verdict routing completes on the terminal branch:
const lastActed = payload.last_acted_seq ?? -1;
const remaining = await this.#client.DrainInbox({
  correlation_id: meta.correlationId, since_seq: lastActed,
});
if (remaining.messages?.length > 0) {
  // Coalesce all unconsumed messages into one prompt
  const coalesced = remaining.messages.map((m) => m.text).join("\n\n");
  await this.#dispatcher.dispatch({
    ctx, prompt: buildPrompt(coalesced, ctx.history),
    requester: remaining.messages[0].author, ackTarget, callbackMeta,
  });
}
```

This catches both sub-cases from the design: a message enqueued after the
lead Adjourned (never fetched) and a message fetched but not acted on
before Adjourn. Multiple unconsumed messages are coalesced into a single
re-dispatch prompt.

**Verify:** Inject a message, then send terminal (adjourned) before the run
fetches it; observe re-dispatch fires with the injected message. Inject two
messages, observe both are coalesced in the re-dispatch prompt.
