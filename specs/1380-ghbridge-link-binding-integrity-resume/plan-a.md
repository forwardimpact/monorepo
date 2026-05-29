# Plan 1380-a — link binding integrity and auth-completion resume

[Spec](spec.md) · [Design](design-a.md)

## Approach

The implementation sequences changes bottom-up: proto definitions first
(shared schema), then the identity-verification and client-state plumbing
in `ghauth` / `oauth`, the `PendingDispatch` store in `services/bridge`,
the `Dispatcher` clean break in `libbridge`, and finally the `ghbridge`
integration that ties the resume flow together. Each step is independently
testable and the ordering avoids forward references — later steps depend
on earlier ones but never the reverse.

## Step 1 — Proto changes and codegen

Intent: extend the shared schema to carry identity verification outcomes,
client-state passthrough, history authorship, and pending-dispatch records.

| File | Action |
|---|---|
| `services/ghauth/proto/ghauth.proto` | Modified |
| `services/bridge/proto/bridge.proto` | Modified |
| `generated/` | Regenerated |

**ghauth.proto** — add `client_state` to `BeginRequest`, add `outcome` to
`CompleteResponse`:

```protobuf
message BeginRequest {
  string surface = 1;
  string surface_user_id = 2;
  optional string redirect_uri = 3;
  optional string code_challenge = 4;
  repeated string scopes = 5;
  optional string client_state = 6;       // NEW
}

message CompleteResponse {
  optional string downstream_code = 1;
  optional string redirect_uri = 2;
  optional string client_state = 3;
  optional string outcome = 4;            // NEW — "identity_mismatch" or absent
}
```

**bridge.proto** — add `author` to `HistoryEntry`, add `PendingDispatch`
message, two RPCs, and extend `SweepResponse`:

```protobuf
message HistoryEntry {
  string role = 1;
  string text = 2;
  optional string author = 3;             // NEW — surface_user_id of the participant
}

message PendingDispatch {
  string link_token = 1;
  string surface = 2;
  string surface_user_id = 3;
  string discussion_id = 4;
  int64 created_at = 5;
}

message PutPendingDispatchRequest { PendingDispatch pending = 1; }
message ResolvePendingDispatchRequest { string link_token = 1; }

message SweepResponse {
  int32 evicted_discussions = 1;
  int32 evicted_origins = 2;
  int32 evicted_pending = 3;              // NEW
}
```

Add to the `Bridge` service block:

```protobuf
rpc PutPendingDispatch(PutPendingDispatchRequest) returns (common.Empty);
rpc ResolvePendingDispatch(ResolvePendingDispatchRequest) returns (PendingDispatch);
```

Run `just codegen`.

Verify: `bun test services/ghauth/test services/bridge/test` — existing
tests pass with the new optional fields.

## Step 2 — github-oauth.js: add getUser

Intent: resolve the authenticated GitHub account id from a freshly minted
token so `Complete` can verify the authorizer's identity.

| File | Action |
|---|---|
| `services/ghauth/src/github-oauth.js` | Modified |

Add `getUser` to the object returned by `createGithubOAuth`, after `revoke`:

```js
async getUser(accessToken) {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`);
  const body = await res.json();
  return body.id;
},
```

Returns the numeric GitHub user id.

Verify: unit test in `services/ghauth/test/` confirming `getUser` calls the
correct endpoint and returns the id.

## Step 3 — ghauth: identity verification and client_state passthrough

Intent: `Complete` verifies the authorizer matches the intended surface
identity; `Begin` stores the caller's `client_state` instead of `null`.

| File | Action |
|---|---|
| `services/ghauth/index.js` | Modified |

**Begin (line 51)** — replace `client_state: null` with
`client_state: req.client_state ?? null`.

**Complete (lines 68–108)** — after the `exchangeCode` call (line 73),
before the binding upsert. The flow is already consumed (line 69) at this
point, so even on mismatch the flow cannot be replayed — an important
single-use property. On identity mismatch, the early return also skips the
`if (flow.redirect_uri)` branch, so no downstream grant is created and no
redirect occurs; the caller (`oauth /callback`) renders a terminal refusal
page instead:

```js
const GITHUB_ID_SURFACES = new Set(["github-discussions"]);

// Resolve the authorizing GitHub account
const authorizedGithubId = String(
  await this.#github.getUser(tokens.access_token),
);

// Identity policy: surfaces whose namespace IS GitHub accounts require equality
if (
  GITHUB_ID_SURFACES.has(flow.surface) &&
  authorizedGithubId !== flow.surface_user_id
) {
  return { outcome: "identity_mismatch" };
}
```

Replace the `github_user_id: null` binding (line 81) with
`github_user_id: authorizedGithubId`.

The constant `GITHUB_ID_SURFACES` is module-level, placed below
`EXPIRY_BUFFER_MS`.

Verify: new test `services/ghauth/test/identity-verification.test.js`:
- matching id → binding created with `github_user_id` populated, no
  `outcome` on the response
- mismatching id → no binding created/modified, response has
  `outcome: "identity_mismatch"`
- non-github-discussions surface → binding created regardless of id
  difference, `github_user_id` populated with the verified id
- `client_state` round-trip: `Begin({ ..., client_state: "tok" })` →
  `Complete` response carries `client_state: "tok"`

## Step 4 — oauth: client_state passthrough and identity_mismatch refusal

Intent: the OAuth HTTP surface forwards `client_state` into `Begin` and
renders a refusal page when `Complete` returns an identity mismatch.
Depends on Step 3 (ghauth accepts `client_state` and returns `outcome`).

| File | Action |
|---|---|
| `services/oauth/index.js` | Modified |

**/authorize (lines 41–60)** — extract `client_state` from query alongside
the existing params; pass it to `BeginRequest`:

```js
const {
  surface, surface_user_id, redirect_uri, code_challenge, scope, client_state,
} = c.req.query();
// ...
const result = await providerClient.Begin(
  typed("BeginRequest", {
    surface,
    surface_user_id,
    redirect_uri: redirect_uri || undefined,
    code_challenge: code_challenge || undefined,
    scopes,
    client_state: client_state || undefined,
  }),
);
```

**/callback (lines 62–83)** — before the `result.redirect_uri` check, add
an identity-mismatch guard:

```js
if (result.outcome === "identity_mismatch") {
  return c.html(
    '<!DOCTYPE html><html><body><h1>Account mismatch</h1>' +
      '<p>The GitHub account that authorized does not match the ' +
      'account that requested linking. No binding was created. ' +
      'Please try again from the correct account.</p></body></html>',
  );
}
```

Verify: update `services/oauth/test/authorize.test.js`:
- `/authorize` with `client_state` passes it to `Begin`
- `/callback` receiving `outcome: "identity_mismatch"` renders the refusal
  page (200, HTML contains "mismatch")

## Step 5 — bridge: PendingDispatch store and RPCs

Intent: add a TTL-swept store for pending re-dispatch targets, keyed by
link token, consumed atomically on resolution.

| File | Action |
|---|---|
| `services/bridge/index.js` | Modified |
| `services/bridge/proto/bridge.proto` | (Already modified in Step 1) |

Add a third `BufferedIndex` for `pending_dispatches.jsonl` alongside
discussions and origins. Wire `PutPendingDispatch` and
`ResolvePendingDispatch` RPCs:

```js
constructor(config, { storage, logger, tracer }) {
  // ... existing discussions and origins ...
  this.#pendingDispatches = new BufferedIndex(
    storage, "pending_dispatches.jsonl",
    { flush_interval: config.pending_flush_interval_ms ?? 1_000,
      max_buffer_size: 100 },
  );
  this.#pendingTtlMs = config.pending_ttl_ms ?? 10 * 60 * 1000;
}
```

**PutPendingDispatch** — store with `id: link_token`:

```js
async PutPendingDispatch(req) {
  const p = req.pending;
  await this.#pendingDispatches.add({
    id: p.link_token,
    surface: p.surface,
    surface_user_id: p.surface_user_id,
    discussion_id: p.discussion_id,
    created_at: Number(p.created_at) || Date.now(),
  });
  return {};
}
```

**ResolvePendingDispatch** — consume (return + soft-delete). Follow the
`BindingStore` pattern: `index.delete` removes the record from memory,
then `add({ id, deleted: true })` writes a delete marker to the JSONL.
Filter `deleted` records in `loadData` so they do not reappear after
restart:

```js
async ResolvePendingDispatch(req) {
  await this.#pendingDispatches.loadData();
  for (const [id, rec] of this.#pendingDispatches.index) {
    if (rec.deleted) this.#pendingDispatches.index.delete(id);
  }
  const rec = this.#pendingDispatches.index.get(req.link_token);
  if (!rec)
    throw Object.assign(new Error("not found"), {
      code: grpc.status.NOT_FOUND,
    });
  this.#pendingDispatches.index.delete(req.link_token);
  await this.#pendingDispatches.add({ id: req.link_token, deleted: true });
  return bridge.PendingDispatch.fromObject({
    link_token: rec.id,
    surface: rec.surface,
    surface_user_id: rec.surface_user_id,
    discussion_id: rec.discussion_id,
    created_at: rec.created_at,
  });
}
```

**Sweep** — extend `#sweep` to evict stale pending dispatches using
`this.#pendingTtlMs` (same pattern as discussions/origins). Include the
count in `SweepResponse.evicted_pending`.

**shutdown** — flush pending dispatches alongside discussions and origins.

Verify: add tests to `services/bridge/test/bridge.test.js`:
- put → resolve returns the record and consumes it (second resolve →
  NOT_FOUND)
- sweep evicts records older than TTL
- resolve after restart still sees NOT_FOUND (delete marker survives)

## Step 6 — libbridge: remove historyText from Dispatcher, add author to appendHistory

Intent: the dispatch primitive no longer mutates history (clean break);
author attribution added to history entries.

| File | Action |
|---|---|
| `libraries/libbridge/src/dispatcher.js` | Modified |
| `libraries/libbridge/src/history.js` | Modified |
| `libraries/libbridge/test/dispatcher.test.js` | Modified |
| `libraries/libbridge/CLAUDE.md` | Modified (remove stale `historyText` from dispatch example) |

**dispatcher.js** — remove `historyText` from the `dispatch()` parameter
list, the JSDoc, and the conditional `appendHistory` call (lines 97–99).
Remove the `appendHistory` import.

**history.js** — accept optional `author` on entries:

```js
export function appendHistory(history, entry, { maxEntries = 10 } = {}) {
  const record = { role: entry.role, text: entry.text };
  if (entry.author !== undefined) record.author = entry.author;
  history.push(record);
  while (history.length > maxEntries) history.shift();
}
```

**dispatcher.test.js** — remove `historyText: "hello"` from the happy-path
test; update the assertion that checks `ctx.history` — it should now be
empty after dispatch (history is the intake's responsibility). Remove the
`"historyText omitted: no history is appended"` test (parameter no longer
exists). `msbridge` already appends at intake and never passes
`historyText`, so it is unaffected.

Verify: `bun test libraries/libbridge/test/dispatcher.test.js` — all
remaining tests pass.

## Step 7 — ghbridge: turn persistence, link augmentation, /api/link-complete

Intent: both intake paths persist the user turn (with author) before
dispatch; `link_required` outcomes stash a `PendingDispatch` and augment
the authorize URL; a new endpoint completes the resume. Depends on Step 4
(oauth forwards `client_state` extracted from the augmented authorize URL),
Step 5 (bridge stores pending dispatches), and Step 6 (Dispatcher no
longer accepts `historyText`).

| File | Action |
|---|---|
| `services/ghbridge/index.js` | Modified |
| `services/ghbridge/src/discussion-adapter.js` | Modified |
| `services/ghbridge/test/helpers.js` | Modified (add `PutPendingDispatch`/`ResolvePendingDispatch` stubs to `createStatefulDiscussionClient`) |
| `services/ghbridge/test/dispatch-auth.test.js` | Modified |
| `services/ghbridge/test/link-complete.test.js` | Created |

### 7a — DiscussionAdapter: add pending-dispatch methods

Add `putPendingDispatch(target)` and `resolvePendingDispatch(linkToken)` to
`DiscussionAdapter`, wrapping the new bridge RPCs. Same `isNotFound` pattern
as `loadByChannel`:

```js
async putPendingDispatch(target) {
  await this.#client.PutPendingDispatch(
    bridge.PutPendingDispatchRequest.fromObject({ pending: target }),
  );
}

async resolvePendingDispatch(linkToken) {
  try {
    return await this.#client.ResolvePendingDispatch(
      bridge.ResolvePendingDispatchRequest.fromObject({
        link_token: linkToken,
      }),
    );
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
```

### 7b — Turn persistence with author

**`#handleDiscussionCreated`** — before the rate-limit check, append the
user turn and persist the context. This is a behavioral change: the context
is now persisted on every discussion-created event (including rate-limited
and declined outcomes), which is required for resume — the turn must be in
the canonical store before any pending-dispatch bookkeeping:

```js
appendHistory(ctx.history, { role: "user", text, author: requester });
ctx.last_active_at = Date.now();
await this.#store.add(ctx);
```

Remove `historyText: text` from the `dispatch()` call.

**`#handleDiscussionComment` (line 314)** — add `author: requester` to the
existing `appendHistory` call. Move `await this.#store.add(ctx)` before the
`processInbound` call to ensure the turn reaches the canonical store before
any bookkeeping. Keep the final `store.add(ctx)` at line 344 (captures
dispatch-result state).

### 7c — Link augmentation on link_required

Add a new `#stashAndPostLink` method. Both intake paths call it when
dispatch returns `link_required` (instead of calling `#renderDeclined`).

The `link_required` case stays in `#renderDeclined` — it is still needed by
the `ResumeScheduler.onDeclined` callback (`index.js:127`), which fires
when a resumed dispatch returns `link_required` (e.g., binding revoked
between recess and elapsed-timer fire). That path posts the bare authorize
URL without augmentation, since there is no specific user turn to stash for
a resume-initiated re-dispatch.

```js
async #stashAndPostLink(ctx, result, requester) {
  const linkToken = crypto.randomUUID();

  await this.#store.putPendingDispatch({
    link_token: linkToken,
    surface: CHANNEL,
    surface_user_id: requester,
    discussion_id: ctx.discussion_id,
    created_at: Date.now(),
  });

  const url = new URL(result.authorizeUrl);
  const callbackBase = normalizeBaseUrl(this.#config.callback_base_url);
  url.searchParams.set("redirect_uri", `${callbackBase}/api/link-complete`);
  url.searchParams.set("client_state", linkToken);

  const body = `To dispatch, link your GitHub account: ${url}`;
  const recordOrigin = async (comment) => {
    await this.#client.RecordOrigin(
      bridge.Origin.fromObject({
        id: comment.id,
        discussion_id: ctx.discussion_id,
        posted_at: Date.now(),
      }),
    );
  };
  await postSingleDiscussionReply(
    this.#graphqlClient, ctx, body, recordOrigin,
  );
}
```

Add `import crypto from "node:crypto";` at the top of the file.

The augmented authorize URL includes `redirect_uri` and `client_state` as
query params. When the user completes OAuth, `ghauth.Complete` creates a
downstream grant (because `flow.redirect_uri` is set) whose code is
included in the redirect to `/api/link-complete`. The link-complete handler
does not redeem this code — the `GetToken` gate during re-dispatch is the
proof of completion. The orphaned grant expires via the grants store TTL;
this is acceptable overhead from reusing the existing redirect plumbing.

### 7d — `/api/link-complete` endpoint

Mount a GET route on the bridge app in the constructor, after
`createBridgeServer`:

```js
this.#bridge.app.get("/api/link-complete", (c) =>
  this.#handleLinkComplete(c),
);
```

Handler. No `ackTarget` is passed on re-dispatch — the user is on the
browser confirmation page, not watching the discussion thread for a
reaction:

```js
async #handleLinkComplete(c) {
  const linkToken = c.req.query("state");
  if (!linkToken) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>Error</h1>" +
        "<p>Missing state parameter.</p></body></html>",
      400,
    );
  }

  const target = await this.#store.resolvePendingDispatch(linkToken);
  if (!target) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>Already processed</h1>" +
        "<p>This link has already been used or has expired." +
        "</p></body></html>",
    );
  }

  const ctx = await this.#store.loadByChannel(CHANNEL, target.discussion_id);
  if (!ctx) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>Error</h1>" +
        "<p>Discussion not found.</p></body></html>",
      404,
    );
  }

  const userTurn = [...ctx.history]
    .reverse()
    .find(
      (e) => e.role === "user" && e.author === target.surface_user_id,
    );
  if (!userTurn) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>Error</h1>" +
        "<p>No message found to re-dispatch.</p></body></html>",
      404,
    );
  }

  const result = await this.#dispatcher.dispatch({
    ctx,
    prompt: buildPrompt(userTurn.text, ctx.history),
    requester: target.surface_user_id,
    callbackMeta: { discussionId: target.discussion_id },
    workflowInputs: { discussionId: target.discussion_id },
  });

  if (result.kind === "dispatched") {
    return c.html(
      "<!DOCTYPE html><html><body><h1>Processing</h1>" +
        "<p>Your message is being processed. " +
        "You can close this window.</p></body></html>",
    );
  }

  return c.html(
    "<!DOCTYPE html><html><body><h1>Unable to dispatch</h1>" +
      "<p>Your account could not be verified. Please try " +
      "linking again from the discussion.</p></body></html>",
  );
}
```

### 7e — Tests

**helpers.js** — extend `createStatefulDiscussionClient` with
`PutPendingDispatch` (stores in a local map) and
`ResolvePendingDispatch` (consume-and-return from the map, throw NOT_FOUND
if absent). Both tests (`dispatch-auth.test.js` and `link-complete.test.js`)
share this fixture.

**dispatch-auth.test.js** — update the `link_required` test: the posted
comment now contains augmented URL params (`redirect_uri`, `client_state`),
not the bare authorize URL.

**link-complete.test.js** (new) — exercises the full resume round-trip:

| Case | Spec criterion | Assertion |
|---|---|---|
| Valid link_token, binding exists | SC 5 (completing link causes dispatch) | dispatch fires, renders "Processing" page |
| Valid link_token, no binding | — | dispatch returns link_required, renders "Unable to dispatch" |
| Unknown/consumed link_token | SC 7 (tamper-resistance) | renders "Already processed" |
| Missing `state` param | SC 7 (tamper-resistance) | 400 |
| Multi-party thread: two users posted | SC 8 (correct turn attribution) | re-dispatches the linking user's turn, not the other's |
| Altered `state` param (wrong token) | SC 7 (tamper-resistance) | renders "Already processed" (server-held target wins) |
| Discussion-created then link_required | SC 3 (first-message canonical store) | after link is posted, the user turn is present in the discussion store |
| Comment then link_required | SC 4 (comment-path canonical store) | after link is posted, the user turn is present in the discussion store |
| Inspect PendingDispatch record | SC 6 (no message body) | record contains `link_token`, `surface`, `surface_user_id`, `discussion_id`, `created_at` only — no `text` or `body` field |

Verify: `bun test services/ghbridge/test/` — all tests pass.

## Libraries used

`@forwardimpact/libbridge` (appendHistory, Dispatcher, buildPrompt,
normalizeBaseUrl, createBridgeServer), `@forwardimpact/libtype` (bridge,
ghauth typed message constructors).

## Risks

| Risk | Mitigation |
|---|---|
| `GET /user` rate limit during high-throughput linking | The call happens once per link completion, not per dispatch. GitHub's 5000 req/hr per-token limit is well above the expected linking rate. |
| Pending dispatch sweep races with completion callback | `ResolvePendingDispatch` is a consume (get-and-delete) operation on the bridge service — at most one caller wins; the second sees NOT_FOUND and renders "Already processed". |

## Execution

All steps are sequential (each depends on the prior step's outputs).
Route to `staff-engineer` for implementation. `technical-writer` is not
needed — changes are internal service code with no published documentation
impact.
