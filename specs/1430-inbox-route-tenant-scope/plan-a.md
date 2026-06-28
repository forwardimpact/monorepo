# Plan A: Tenant-scope the realtime-bridge inbox route

References:
[spec.md](./spec.md) ·
[design-a.md](./design-a.md) ·
[Issue #1320](https://github.com/forwardimpact/monorepo/issues/1320)

## Approach

Single-PR clean break, no dual-route period: add `tenantOf(correlationId)`
to `CallbackRegistry`, change the libbridge inbox mount from
`/api/inbox/:correlationId` to `/api/inbox/:tenant_id/:correlationId`,
update `createInboxHandler` to read both path params and verify via the
registry, switch the dispatcher's URL construction from a query-string
tenant carrier to a path-segment carrier, thread the registry through
`ghbridge`/`msbridge` wiring, and update the libeval test fixtures. The
fail-closed 404 with body `{error: "Unknown correlation"}` runs before
the long-poll loop. Sequence preserves test green at every step:
registry primitive lands first (additive), then handler+mount switch
together with their tests, then dispatcher URL flip with its test, then
the per-bridge wiring update, then fixture sweep.

## Steps

### Step 1 — Add `tenantOf(correlationId)` to `CallbackRegistry`

Adds a correlation-keyed lookup the inbox handler uses to verify the path
tenant.

- Modified: `libraries/libbridge/src/callback-registry.js`
- Modified: `libraries/libbridge/test/callback-registry.test.js`

```js
// callback-registry.js — after the peek() method
/**
 * Return the bound tenant_id for any active token whose correlationId
 * matches; null if no active token binds the correlation. Single-pass
 * scan of the entries map.
 * @param {string} correlationId
 * @returns {string | null}
 */
tenantOf(correlationId) {
  if (typeof correlationId !== "string" || !correlationId) return null;
  for (const entry of this.#entries.values()) {
    if (entry.correlationId === correlationId) {
      return entry.meta.tenant_id;
    }
  }
  return null;
}
```

Tests added in `callback-registry.test.js` cover: `tenantOf(known) ===
bound tenant`; `tenantOf("nope") === null`; `tenantOf("")` and
non-string args return `null` (no throw); after `consume(token, …)`,
the same correlation returns `null`; after `sweep()` evicts an entry,
that correlation returns `null`.

Verification: `bun test libraries/libbridge/test/callback-registry.test.js`
green with the five new `tenantOf` cases above appearing in the run.

### Step 2 — Update `createInboxHandler` to accept `callbacks` and read tenant from path

Handler depends on `callbacks` (the `CallbackRegistry`); reads
`tenant_id` from path; calls `callbacks.tenantOf(correlationId)` once at
entry; returns `404 {error: "Unknown correlation"}` on `null` or
mismatch; otherwise proceeds with today's `DrainInbox` loop. Removes
today's query-string `tenant_id` read.

- Modified: `libraries/libbridge/src/inbox-handler.js`
- Added: `libraries/libbridge/test/inbox-handler.test.js`

Shape change (deps + full handler body). The `tenant_id` passed to
`DrainInbox` is now sourced from the path, not the query string —
`services/bridge` still requires `tenant_id` on every `DrainInbox` call
(`services/bridge/index.js`), so the load-bearing detail is that the
field continues to be set on `DrainInboxRequest`, just from a different
source:

```js
export function createInboxHandler({
  client, logger, callbacks,
  pollTimeoutMs = 30_000, pollIntervalMs = 1_000, clock,
}) {
  if (!clock) throw new Error("clock is required");
  if (!callbacks) throw new Error("callbacks is required");
  return async (c) => {
    const tenant_id = c.req.param("tenant_id");
    const correlationId = c.req.param("correlationId");
    const bound = callbacks.tenantOf(correlationId);
    if (!bound || bound !== tenant_id) {
      return c.json({ error: "Unknown correlation" }, 404);
    }
    const sinceSeq = parseInt(c.req.query("since") ?? "0", 10);
    const deadline = clock.now() + pollTimeoutMs;
    while (clock.now() < deadline) {
      try {
        const result = await client.DrainInbox(
          bridge.DrainInboxRequest.fromObject({
            correlation_id: correlationId,
            since_seq: sinceSeq,
            tenant_id, // sourced from c.req.param above, not c.req.query
          }),
        );
        if (result.messages?.length > 0) {
          return c.json({ messages: result.messages });
        }
      } catch (err) {
        logger.error?.("inbox", err);
        return c.json({ error: "Inbox failure" }, 500);
      }
      await clock.sleep(pollIntervalMs);
    }
    return c.json({ messages: [] });
  };
}
```

New test file covers the handler in isolation (mocked client + registry):
known correlation + matching tenant proceeds to `DrainInbox` (assert the
client was called with `tenant_id` set to the path value); unknown
correlation returns 404 `{error: "Unknown correlation"}` without
calling the client; wrong tenant returns the same 404 body and never
calls the client; missing `callbacks` dep throws at factory time.
Criterion-6 cross-check assertion: the unknown-correlation 404 body's
`Object.keys()` array is asserted equal to the literal `["error"]` —
the same key set the callback-handler wrong-token path emits at
`callback-handler.js:92` (`c.json({ error: "Unknown callback token" }, 404)`).
The cross-check is by literal `["error"]` key set, not a shared
constant — the two messages legitimately differ in literal text per
design § 2. The new file follows the `callback-handler.test.js` shape
(one factory, request-flow tests).

Verification: `bun test libraries/libbridge/test/inbox-handler.test.js`
green; the test names exercising the four behaviours above appear in
the run.

### Step 3 — Update the route mount to `:tenant_id/:correlationId`

- Modified: `libraries/libbridge/src/server.js` (one-line change at the
  existing mount)
- Modified: `libraries/libbridge/test/server.test.js`

```js
// server.js — replace line 101
app.get("/api/inbox/:tenant_id/:correlationId", async (c) => { ... });
```

Tests added/updated in `server.test.js`: the new tests wire an inbox
handler against a populated `CallbackRegistry` (one `register` call
binding `correlationId="corr-1"` to `tenant_id="default"` or to a
non-default tenant) and a stub `client` whose `DrainInbox` returns
`{messages: []}` synchronously; the existing `onWebhook`/`onCallback`
stubs stay as-is. With that wiring: three-param mount with `default`
tenant + a non-default tenant returns the inbox handler's live success
shape (criterion 1, 5); `/api/inbox/foo` (one path segment) returns
Hono's own 404 with no inbox handler invocation (criterion 2 — verified
by asserting `DrainInbox` was not called).

Verification: `bun test libraries/libbridge/test/server.test.js` green;
the three new test names (`default tenant`, non-default tenant,
legacy-shape miss) appear in the run.

### Step 4 — Update `Dispatcher` URL construction

Switches `inboxUrl` from
`${base}/api/inbox/${correlationId}?tenant_id=${enc(t)}` to
`${base}/api/inbox/${tenant_id}/${correlationId}`. `tenant_id` is already in
scope at the construction site (`dispatcher.js:101`).

- Modified: `libraries/libbridge/src/dispatcher.js`
- Modified: `libraries/libbridge/test/dispatcher.test.js`

```js
// dispatcher.js — replace line 116
const inboxUrl = `${this.#callbackBaseUrl}/api/inbox/${tenant_id}/${correlationId}`;
```

Tests added/updated: read the dispatched `inputs.inbox_url` field from
the stub fetch's recorded `workflow_dispatch` POST body — the
workflow-input field is emitted in snake_case
(`libraries/libbridge/src/dispatch.js:45` writes
`inputs.inbox_url = inboxUrl`); `dispatcher.test.js` already records
dispatch calls via the `stubFetch` collector and asserts other
`body.inputs.<snake>` fields. Parse the URL with `new URL(...)` and
assert `url.pathname.endsWith("/api/inbox/<tenant>/<correlation>")`
for both `DefaultTenantResolver` (yielding `default` literal in the
tenant slot) and a registry-resolved non-default tenant (criteria 4,
5). The emitted URL no longer carries a `?tenant_id=…` query
component; assert `url.search === ""`.

Verification: `bun test libraries/libbridge/test/dispatcher.test.js` green;
two new test names (default-tenant pathname, non-default-tenant
pathname) appear in the run.

### Step 5 — Pass `callbacks` through the per-bridge wiring

Both `ghbridge` and `msbridge` already hold `this.#callbacks`; pass it
into `createInboxHandler({...})` alongside the existing deps.

- Modified: `services/ghbridge/index.js` (one-line addition inside the
  `onInbox: createInboxHandler({...})` block at lines 239–243)
- Modified: `services/msbridge/index.js` (one-line addition inside the
  `onInbox: createInboxHandler({...})` block at lines 240–244)

```js
onInbox: createInboxHandler({
  client: discussionClient,
  logger,
  clock: this.#clock,
  callbacks: this.#callbacks,  // added
}),
```

Verification:
`bun test services/ghbridge/test/*.test.js services/msbridge/test/*.test.js`
green.

### Step 6 — Update libeval test fixtures

Two fixture URLs in the poller test are hard-coded to the legacy shape.
Update both to the three-param shape with the literal `default` tenant
(matching single-tenant deployments).

- Modified: `libraries/libeval/test/inbox-poller.test.js`

```diff
- inboxUrl: "https://bridge.test/api/inbox/corr-1",
+ inboxUrl: "https://bridge.test/api/inbox/default/corr-1",
```

Apply at both occurrences (lines 39, 71 today). The poller itself treats
`inboxUrl` as opaque (`inbox-poller.js:39`) and needs no source change.

Verification: `bun test libraries/libeval/test/inbox-poller.test.js` green.

### Step 7 — Repo-wide sweep for the legacy shapes

Runs the three commands from spec criterion 7 against the post-change
working tree. Every command must return zero hits before the PR opens.

```sh
rg -nF '"/api/inbox/:correlationId"' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/
rg -nF '/api/inbox/${correlationId}' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/
rg -n '"https?://[^"]+/api/inbox/[^/"]+"' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/
```

If any command returns hits, fix the source and re-run before merge.

Verification: zero hits from each of the three sweeps.

### Step 8 — PR description carries the breaking-change announcement

- No file change.
- The PR description includes a "Breaking change" section with the
  migration recipe: libbridge consumers update inbox URLs from
  `/api/inbox/{correlationId}` to `/api/inbox/{tenant_id}/{correlationId}`,
  where the single-tenant default is the literal `default`.

Verification: PR description carries the section before review begins.

## Libraries used

Libraries used: libbridge (`CallbackRegistry`, `createInboxHandler`,
`Dispatcher`, `createBridgeServer`).

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | `InboxPoller` receives non-200 responses with a 5-second backoff (`inbox-poller.js:43`). After the change, a wrong-tenant or unknown correlation returns 404 in a loop until the poller's signal aborts — same blast as today's transient failure. Spec marks this out of scope; the plan flags it for the implementer. | No code change in scope. Implementer verifies the existing behaviour is acceptable for the security-error case (404 indistinguishable from a bridge restart at the poller level); spec criterion 7 only sweeps URL shapes. |
| 2 | The query-string `tenant_id` read in today's handler (`inbox-handler.js:30`) is removed. The dispatcher's URL construction (`dispatcher.js:116`) is the only in-tree producer that emitted `?tenant_id=…` and Step 4 replaces it; the Step 7 sweep commands target quoted literals and the legacy mount string, not template literals, so they catch the *consumer* side (route declaration and quoted URLs in fixtures) but cannot detect a residual template-literal producer. Step 4's new dispatcher test (asserting `url.search === ""`) is the catcher for the dispatcher; the implementer is responsible for confirming no third producer exists by grepping `?tenant_id=` in the working tree. | Step 4 dispatcher test asserts the empty query string; implementer runs `rg -n '/api/inbox/[^"]*\?tenant_id' libraries/ services/ products/ tests/` once before opening the PR. |
| 3 | The new handler reads `tenant_id` from the path; the same field is then passed to `DrainInbox`. If an implementer following Step 2 deletes the `tenant_id` field from the `DrainInboxRequest.fromObject({...})` call alongside removing the query-string read, every authorized poll hits `services/bridge`'s `tenant_id is required` check and returns 500. | Step 2's full handler body is shown verbatim with the `tenant_id` field present in `DrainInboxRequest`; Step 5's wiring tests in ghbridge/msbridge exercise the full path-and-call flow. |

## Execution

Single PR, single engineering-agent run; steps 1–7 run sequentially in
the order above (each step's tests must pass before the next). Step 8 is
a PR-description edit applied at PR-open time. No parallelism; no docs
agent involvement (no public-facing documentation surface in scope).

— Staff Engineer 🛠️
