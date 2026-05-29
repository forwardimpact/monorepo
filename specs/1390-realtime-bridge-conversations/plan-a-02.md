# Plan 1390-a Part 2 — Run-side streaming and injection

[overview](plan-a.md) · [part 1](plan-a-01.md)

## Step 1: Add streaming environment to discuss command

Read `CALLBACK_URL`, `INBOX_URL`, and `CORRELATION_ID` from environment and
thread them to `createDiscusser`.

**Modified:** `libraries/libeval/src/commands/discuss.js`,
`libraries/libeval/src/discusser.js`

In `parseDiscussOptions`, add:

```javascript
callbackUrl: process.env.CALLBACK_URL ?? null,
inboxUrl: process.env.INBOX_URL ?? null,
correlationId: process.env.CORRELATION_ID ?? null,
```

In `runDiscussCommand`, pass them to `createDiscusser`. In
`createDiscusser`, accept `callbackUrl`, `inboxUrl`, `correlationId` and
thread to the `Discusser` constructor and the `OrchestrationLoop`.

**Verify:** Set env vars, call `parseDiscussOptions`; values propagate
through to the Discusser instance.

## Step 2: Add reply emitter

POST `{kind, seq, body, agent, correlation_id}` to the callback URL each
time an answer is routed to the lead.

**Created:** `libraries/libeval/src/reply-emitter.js`

```javascript
export class ReplyEmitter {
  #callbackUrl;
  #correlationId;
  #counter;

  constructor({ callbackUrl, correlationId, counter }) {
    this.#callbackUrl = callbackUrl;
    this.#correlationId = correlationId;
    this.#counter = counter;
  }

  emit({ kind, body, agent }) {
    const seq = this.#counter.next();
    if (this.#callbackUrl) {
      // Fire-and-forget — do not block the message bus
      fetch(this.#callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: this.#correlationId,
          kind, seq, body, agent,
        }),
      }).catch(() => {});
    }
    return seq;
  }
}
```

`emit` is synchronous — it assigns `seq` from the counter and returns it
immediately. The HTTP POST is fire-and-forget so the message bus is never
blocked on network I/O. Delivery failures are absorbed; the bridge's
seq-based dedupe handles retries at the terminal summary level (the crash
safety callback carries all replies).

**Modified:** `libraries/libeval/src/discusser.js`

In `createDiscusser`, create the emitter and **replace** the existing
answer interception block (the `messageBus.answer` monkey-patch that today
pushes to `ctx.replies`) with a version that also emits:

```javascript
const emitter = new ReplyEmitter({ callbackUrl, correlationId, counter });
ctx.emitter = emitter;

const originalAnswer = messageBus.answer.bind(messageBus);
messageBus.answer = (from, to, text, askId) => {
  if (to === "lead" && from !== "@orchestrator") {
    const seq = emitter.emit({ kind: "reply", body: text, agent: from });
    ctx.replies.push({
      body: text, agent: from, kind: "reply", seq,
      ...(ctx.discussionId && { thread_id: ctx.discussionId }),
    });
  }
  originalAnswer(from, to, text, askId);
};
```

`ctx.emitter` is set so the Acknowledge tool (Step 3) can reach it.

The `ctx.replies` shape is extended from `{body, agent, thread_id?}` to
`{body, agent, kind, seq, thread_id?}`. The terminal summary emission
(`Discusser.#emitDiscussSummary`) already serializes `ctx.replies` into the
trace — the extra fields are additive and pass through harmlessly to the
bridge's `handleReply`, which iterates `replies[].body`.

**Verify:** Create discusser with `callbackUrl`; answer routed to lead →
fetch called with `kind: "reply"`, `seq` is a number. Without
`callbackUrl` → seq returned, no fetch.

## Step 3: Add Acknowledge tool

Add an agent-surface tool that emits an ack event without discharging the
pending Ask.

**Modified:** `libraries/libeval/src/discuss-tools.js`

Add `Acknowledge` to `createDiscussAgentToolServer` (alongside
`RequestForComment`):

```javascript
const AcknowledgeSchema = z.object({
  message: z.string().describe("Brief acknowledgement to post on the thread"),
  askId: z.number().optional().describe("The ask being acknowledged"),
});

server.addTool("Acknowledge", AcknowledgeSchema, async ({ message }) => {
  const seq = ctx.emitter?.emit({ kind: "ack", body: message, agent: from }) ?? -1;
  ctx.replies.push({
    body: message, agent: from, kind: "ack", seq,
    ...(ctx.discussionId && { thread_id: ctx.discussionId }),
  });
  return { success: true };
});
```

The tool pushes to `ctx.replies` (for the terminal trace summary) and emits
via `ReplyEmitter` (for the streaming bridge post), but does **not** call
`messageBus.answer` — the Ask remains pending and the agent still owes an
Answer.

**Verify:** Agent calls Acknowledge → ack emitted, pushed to
`ctx.replies`; the original Ask remains in `ctx.pendingAsks`.

## Step 4: Add inbound poller

A concurrent task that long-polls the inbox URL and lands injected messages
on the lead's bus queue via `messageBus.synthetic`.

**Created:** `libraries/libeval/src/inbox-poller.js`

```javascript
export class InboxPoller {
  #inboxUrl;
  #messageBus;
  #leadName;
  #signal;
  #lastSeq = 0;
  lastActedSeq = -1;

  constructor({ inboxUrl, messageBus, leadName, signal }) {
    this.#inboxUrl = inboxUrl;
    this.#messageBus = messageBus;
    this.#leadName = leadName;
    this.#signal = signal;
  }

  async run() {
    if (!this.#inboxUrl) return;
    while (!this.#signal.aborted) {
      try {
        const res = await fetch(
          `${this.#inboxUrl}?since=${this.#lastSeq}`,
          { signal: this.#signal },
        );
        if (!res.ok) { await delay(5_000, this.#signal); continue; }
        const { messages } = await res.json();
        for (const msg of messages) {
          this.#messageBus.synthetic(this.#leadName, msg.text);
          this.#lastSeq = Math.max(this.#lastSeq, msg.seq);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        await delay(5_000, this.#signal);
      }
    }
  }
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(id); resolve(); }, { once: true });
  });
}
```

**Modified:** `libraries/libeval/src/orchestration-loop.js`

Accept an optional `inboxPoller` in the constructor. In `run()`, start it
alongside agent loops and shut it down on stop:

```javascript
const pollerPromise = this.inboxPoller?.run().catch(() => {});

// ... existing lead + agent loop code ...

this.#stop();  // AbortController signals the poller
await Promise.allSettled([...agentPromises, pollerPromise].filter(Boolean));
```

The poller receives the `OrchestrationLoop`'s `AbortController.signal`, so
it shuts down when the session concludes. The lead's `#drainOrWait` wakes
naturally on the synthetic message — no change to the drain loop.

The poller exposes `lastActedSeq` (public) — set by the Discusser after
the lead produces output following an injected message. The terminal
summary includes `last_acted_seq` so the bridge's reconciliation (Part 1,
Step 8) drains only unacted-on messages. The Discusser updates
`inboxPoller.lastActedSeq = inboxPoller.#lastSeq` after each lead turn
that follows a synthetic message.

**Modified:** `libraries/libeval/src/discusser.js`

In `createDiscusser`, create the poller and pass it to the
`OrchestrationLoop`:

```javascript
const abortController = new AbortController();
const inboxPoller = inboxUrl
  ? new InboxPoller({ inboxUrl, messageBus, leadName: "lead", signal: abortController.signal })
  : null;

const loop = new OrchestrationLoop({
  ...existing,
  inboxPoller,
  abortController,
});
```

**Verify:** Start poller with mock inbox URL serving one message → message
lands on lead's queue. Abort signal stops poller cleanly.

## Step 5: Raise default conversation budget

Increase `DEFAULT_MAX_LEAD_TURNS` so injected continuations are not cut off.

**Modified:** `libraries/libeval/src/orchestration-loop.js`

```diff
-const DEFAULT_MAX_LEAD_TURNS = 40;
+const DEFAULT_MAX_LEAD_TURNS = 200;
```

The `maxLeadTurns` parameter remains overridable via the constructor. The
kata-dispatch.yml workflow passes `max-turns: "1500"` (per-SDK-call budget),
which is separate from `maxLeadTurns` (session-level lead-resume cap). The
raise applies to sessions where no override is provided.

Also expose `maxLeadTurns` as a CLI option on the discuss command so the
workflow can override it if needed:

**Modified:** `libraries/libeval/src/commands/discuss.js`

```javascript
const maxLeadTurnsRaw = values["max-lead-turns"] ?? "200";
const maxLeadTurns = parseInt(maxLeadTurnsRaw, 10);
```

Thread through `createDiscusser` → `OrchestrationLoop`.

**Verify:** A discuss session with 50+ injected messages does not hit the
turn cap. Existing tests that reference `DEFAULT_MAX_LEAD_TURNS` updated.

## Step 6: Wire streaming inputs through kata-dispatch.yml

Pass streaming URLs as environment variables to the "Assess and Act" step
so the discuss command can read them.

**Modified:** `.github/workflows/kata-dispatch.yml`

Add `inbox_url` workflow_dispatch input:

```yaml
inbox_url:
  description: "Long-poll URL for injecting messages into a live run (optional)"
  required: false
  type: string
```

Add env vars to the "Assess and Act" step (alongside the existing
`ANTHROPIC_API_KEY` and `GH_TOKEN`):

```diff
 - name: Assess and Act
   uses: forwardimpact/fit-eval@v1
   env:
     ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
     GH_TOKEN: ${{ steps.ci-app.outputs.token }}
     CLAUDE_CODE_USE_BEDROCK: "0"
+    CALLBACK_URL: ${{ inputs.callback_url }}
+    CORRELATION_ID: ${{ inputs.correlation_id }}
+    INBOX_URL: ${{ inputs.inbox_url }}
```

The env vars are inherited by the composite action's inner steps. The
`fit-eval discuss` command reads them from `process.env` (Step 1 of this
part).

**Verify:** Workflow syntax validates. Env vars visible to the composite
action's inner shell steps.

## Step 7: Emit `kind: "terminal"` from crash safety callback

Tag the existing callback command's output with `kind: "terminal"` so the
session-aware bridge handler routes it correctly.

**Modified:** `libraries/libeval/src/commands/callback.js`

In the `readTraceSummary` payload construction:

```diff
 const payload = {
   correlation_id: correlationId,
+  kind: "terminal",
   verdict: found.verdict,
   summary: found.summary,
+  last_acted_seq: found.lastActedSeq ?? -1,
   ...
 };
```

The `lastActedSeq` is read from the trace summary event (emitted by the
Discusser from `inboxPoller.lastActedSeq`) so the bridge's terminal
reconciliation (Part 1, Step 8) can drain only unacted-on inbox messages.

**Modified:** `.github/workflows/kata-dispatch.yml`

The curl fallback (no trace file) also needs `kind`:

```diff
-  '{correlation_id: $cid, verdict: "failed", ...'
+  '{correlation_id: $cid, kind: "terminal", verdict: "failed", ...'
```

Backward compatibility: the bridge handler defaults `kind` to `"terminal"`
when absent (Part 1, Step 3), so this change is safe to deploy before or
after the bridge update.

**Verify:** Callback command output includes `kind: "terminal"`. Curl
fallback includes `kind: "terminal"`.
