# Plan 1520-a Part 02 — msbridge personal-conversation gate

See [plan-a.md](plan-a.md) for overview. This part adds the
fail-closed personal-conversation gate at msbridge's
`#stashAndPostLink` ingress so the `bridge_pending_dispatch_proof`
contract's link-token-confidentiality requirement (Part 03) is
enforced at the only place that posts the URL. Safe to merge under the
kill-switch — security delta zero on its own, defense-in-depth.

## Step 02.1 — Plumb `conversationType` to `#stashAndPostLink`

`#stashAndPostLink(ctx, result, requester)` is invoked from
`#handleNewMessage` at `services/msbridge/index.js:318` where the
inbound `activity` is still in scope. Read
`activity.conversation?.conversationType` and pass it explicitly so
the gate does not reach back into `ctx.participants[0].metadata.conversation`
for trust-critical data (the metadata-from-ctx path goes through a
JSON round-trip in `DiscussionAdapter.deflateMetadata` /
`inflateMetadata` and is appropriate for non-trust-critical use).

**Modified:** `services/msbridge/index.js`

In `#handleNewMessage`, change the invocation site:

```js
// before, services/msbridge/index.js:317-319
} else if (result.kind === "link_required") {
  await this.#stashAndPostLink(ctx, result, requester);
  span.addEvent("dispatch_declined", { kind: result.kind });
```

```js
// after
} else if (result.kind === "link_required") {
  await this.#stashAndPostLink(
    ctx,
    result,
    requester,
    activity.conversation?.conversationType,
  );
  span.addEvent("dispatch_declined", { kind: result.kind });
```

Update the method signature at `services/msbridge/index.js:446`:

```js
async #stashAndPostLink(ctx, result, requester, conversationType) {
```

**Verify:** `bun test services/msbridge/test/` — existing tests still
pass (`conversationType` is `undefined` from current fixtures, which
the gate handles in Step 02.2).

## Step 02.2 — Add the fail-closed gate at the top of `#stashAndPostLink`

The gate fires **before** `prepareLinkResume` and `putPendingDispatch`
are reached. Fail-closed: any value other than `"personal"` (including
`undefined`, `null`, `"groupChat"`, `"channel"`, and any future Bot
Framework conversation type) short-circuits to a static DM-redirect
message and returns without writing a pending entry.

**Modified:** `services/msbridge/index.js`

Add at the top of `#stashAndPostLink` (after the renamed signature
from Step 02.1):

```js
async #stashAndPostLink(ctx, result, requester, conversationType) {
  if (conversationType !== "personal") {
    const ref = ctx.participants?.[0]?.metadata;
    if (ref) {
      await sendReply(
        this.#adapter,
        this.#msAppId,
        ref,
        "To link your GitHub account, please DM this bot directly.",
      );
    }
    this.#logger.info("link-resume", "non-personal conversation gate", {
      conversation_type: conversationType ?? null,
      discussion_id: ctx.discussion_id,
    });
    return;
  }
  // existing body unchanged: prepareLinkResume → putPendingDispatch → sendReply
```

**Logger redaction:** the log line names `conversation_type` as a
string and `discussion_id` (already logged elsewhere); no PII added.
`conversation_type` is one of `"personal" | "groupChat" | "channel" |
null | <future bot-framework string>` — a small, non-sensitive
vocabulary. The `null` case is the fail-closed proof, useful for
observability.

**Verify:** `bun test services/msbridge/test/personal-conversation-gate.test.js`
passes (Step 02.4); existing `msbridge` tests pass after Step 02.3.

## Step 02.3 — Update `dispatch-auth.test.js` fixture

Add `conversationType: "personal"` to the default `makeActivity`
helper so existing tests continue to exercise the personal-conversation
path. Without this, every existing `link_required` assertion in
`services/msbridge/test/dispatch-auth.test.js` would start failing
once the gate lands.

**Modified:** `services/msbridge/test/dispatch-auth.test.js`

At `services/msbridge/test/dispatch-auth.test.js:65-76`, modify
`makeActivity`:

```js
function makeActivity(threadId, fromId, text) {
  return {
    type: "message",
    id: "a-1",
    text,
    conversation: { id: threadId, conversationType: "personal" },
    channelId: "msteams",
    serviceUrl: "https://example",
    from: { id: fromId },
    recipient: { id: "b" },
  };
}
```

**Verify:** `bun test services/msbridge/test/dispatch-auth.test.js`
passes unchanged in behavioural assertions.

## Step 02.4 — Add `services/msbridge/test/personal-conversation-gate.test.js`

**Created:** `services/msbridge/test/personal-conversation-gate.test.js`

Cover the gate matrix:

| `conversationType` | Expected behaviour |
|---|---|
| `"personal"` | `prepareLinkResume` + `putPendingDispatch` called once; augmented link URL posted; no DM-redirect message |
| `"groupChat"` | No `putPendingDispatch` call; DM-redirect message posted |
| `"channel"` | No `putPendingDispatch` call; DM-redirect message posted |
| `undefined` (omitted) | No `putPendingDispatch` call; DM-redirect message posted |
| `"futureUnknownType"` | No `putPendingDispatch` call; DM-redirect message posted (forward-compat fail-closed) |

The `if (ref)` guard at Step 02.2 is defense-in-depth: not testable
end-to-end via the full `#handleNewMessage` ingress because
`services/msbridge/index.js:269` unconditionally assigns
`ctx.participants[0].metadata = ref` before `#stashAndPostLink` is
invoked. The guard exists only to keep `sendReply` defensible if a
future caller reaches `#stashAndPostLink` outside the ingress path
(matches Risk row 1 in this part).

Drive each case through `MsBridgeService.#handleNewMessage` indirectly
by invoking the mounted Bot Framework adapter with a constructed
activity. Pattern (lifted from
`services/msbridge/test/dispatch-auth.test.js:65-76` `makeActivity` +
`adapter.process(...)`):

```js
function makeActivity(threadId, fromId, text, conversationType) {
  const conversation = { id: threadId };
  if (conversationType !== undefined) {
    conversation.conversationType = conversationType;
  }
  return {
    type: "message",
    id: "a-1",
    text,
    conversation,
    channelId: "msteams",
    serviceUrl: "https://example",
    from: { id: fromId },
    recipient: { id: "b" },
  };
}
```

Use a `makeGhuserClient` stub that returns `link_required` from
`GetToken` to force the `link_required` branch. Spy on the bridge
client's `PutPendingDispatch` (constructor arg `discussionClient`) to
assert call count. Spy on the adapter `sendActivity` to assert the
message content (`includes("DM this bot")` on the fail-closed path;
`includes("authorize")` on the personal path).

**Verify:** `bun test services/msbridge/test/personal-conversation-gate.test.js`
passes. File ≤300 LOC; no allow-list entry needed.

## Risks specific to Part 02

- **`ctx.participants[0].metadata` absent.** The post-DM-redirect
  branch checks `if (ref)` before sending. If absent (rare —
  conversation reference missing from context), the gate still returns
  without writing pending state; the user sees nothing in the channel
  but the security property holds (no pending entry, no link URL).
  Acceptable degradation.
- **Static message wording.** "To link your GitHub account, please DM
  this bot directly." is user-facing copy. If the wording needs
  product review, it lives in `services/msbridge/index.js` as a
  string literal — no copy registry today. Future i18n is out of
  scope for this spec.
- **Bot Framework `conversationType` fidelity.** Cited in
  [plan-a.md cross-cutting risks](plan-a.md#cross-cutting-risks);
  trust depends on the signature-verified ingress at msbridge.

— Staff Engineer 🛠️
