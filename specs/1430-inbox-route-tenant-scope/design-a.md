# Design 1430: Tenant-scope the realtime-bridge inbox route

## Purpose

Tighten the libbridge inbox route to mirror the tenant-aware shape that
spec 1270 plan-a-04 established for the sister callback route, so an
attacker who learns a peer tenant's `correlation_id` cannot long-poll the
peer's inbox.

## Context

Three surfaces hold the legacy single-parameter inbox shape today:

- `libraries/libbridge/src/server.js:101` —
  `app.get("/api/inbox/:correlationId", …)`
- `libraries/libbridge/src/dispatcher.js:102` —
  `` `${this.#callbackBaseUrl}/api/inbox/${correlationId}` ``
- `libraries/libbridge/src/inbox-handler.js:24` —
  `c.req.param("correlationId")` with no peer parameter and no tenant check

The sister callback route (`POST /api/callback/:tenant_id/:token`, mounted
at `libraries/libbridge/src/server.js:80`) anchors the convention:

- The `CallbackRegistry` stores `meta.tenant_id` per token (registered by
  `Dispatcher` from the resolved `tenant_id`); `consume(token, {tenant_id})`
  returns `null` when the path tenant does not match the stored binding.
- The callback handler returns `404 { error: "Unknown callback token" }`
  for the null case — same body shape, same status, whether the token is
  unknown or the tenant mismatches (`callback-handler.js:92,100`).

The inbox path must reach the same fail-closed shape. The remaining
question is **where to hold the correlation → tenant binding for the
inbox handler to verify against**.

## Key decisions

### 1 — Hold the correlation → tenant binding in `CallbackRegistry`

The dispatcher already calls `callbacks.register(correlationId, mergedMeta)`
with `mergedMeta.tenant_id` set (`dispatcher.js:97-98`). The registry is
therefore already the source of truth for the (correlationId, tenant_id)
pair — just keyed by token, not correlationId.

**Chosen:** extend `CallbackRegistry` with a small correlation-keyed lookup
that returns the bound `tenant_id`. The handler verifies via that lookup
**before** entering the long-poll loop. Shape:

```js
/** @returns {string | null} */
tenantOf(correlationId)
```

Returns the stored `tenant_id` if any active token binds the correlation,
`null` otherwise. Implementation is a single-pass scan of the entries map
(the registry is small: one entry per in-flight dispatch per bridge
process; bounded by the 2h TTL sweep). A secondary correlationId → token
index is not required at this scale; the plan can revisit if profiling
ever shows it matters.

Why a new primitive instead of reusing `consume(token, {tenant_id})` (the
callback route's verification call): the callback path holds a `token`
and asks the registry to atomically resolve-and-delete; the inbox path
holds a `correlationId` and must not delete (the long-poll persists for
many requests against the same correlation). The shape difference is
unavoidable; both surfaces still rely on the registry as the single
source of truth for the (correlation, tenant) binding, which is the
mitigation for spec risk #3 (callback/inbox drift).

**Alternatives considered:**

- *Push verification into `DrainInbox` RPC* — server-side change to the
  bridge service. Out of scope (cross-surface, requires proto change for
  a check the bridge already has the data to perform).
- *Add a parallel correlation→tenant map* — a second data structure to
  keep in sync with the registry. The registry already holds the binding;
  duplicating it invites drift (cf. spec risk #3).

### 2 — Fail-closed before long-poll, single 404 shape for unknown and mismatched

`createInboxHandler` today returns `200 { messages: [] }` after the
poll deadline for any `correlationId` (known, unknown, or wrong tenant).
This is the gap spec criterion 8 closes.

**Chosen:** the handler calls `callbacks.tenantOf(correlationId)` once at
entry. If the result is `null` or differs from the path `tenant_id`, the
handler returns `404 { error: "Unknown correlation" }` and never enters
the long-poll loop. Otherwise it proceeds with today's `DrainInbox` loop.

The string `"Unknown correlation"` is the inbox analogue of the callback
route's `"Unknown callback token"`; the spec's structural constraint
(criterion 8) is "same status code, same top-level key set as the
callback wrong-token response" — both bodies have `{error: <string>}`
top-level, both statuses are 404. The literal text differs because the
identifier differs (correlation vs. token).

### 3 — Single mount, no legacy compatibility

The mount changes from `/api/inbox/:correlationId` to
`/api/inbox/:tenant_id/:correlationId` in one step. There is no dual-route
period: requests at the legacy shape fall through Hono's router and 404,
matching spec criterion 2.

This mirrors the spec 1270 plan-a-04 cutover for the callback route
(plan § Step 5: "single mount, no mode flag, no dual-route logic"). The
callback cutover shipped without a compatibility shim and the precedent
applies: external consumers (libbridge platform builders) are announced
via the implementation PR body and the libbridge changelog, sized to the
small blast radius.

## Components affected

| Surface | Change | Reference |
|---|---|---|
| `libraries/libbridge/src/server.js` | Inbox mount changes from `:correlationId` to `:tenant_id/:correlationId`; route handler unchanged in shape. | `server.js:101` |
| `libraries/libbridge/src/inbox-handler.js` | `createInboxHandler` accepts a new required `callbacks` dep (the `CallbackRegistry`). Handler reads `tenant_id` + `correlationId` from path, calls `callbacks.tenantOf(correlationId)`, returns 404 on null or mismatch, proceeds to long-poll otherwise. | `inbox-handler.js:15-46` |
| `libraries/libbridge/src/callback-registry.js` | New method `tenantOf(correlationId): string \| null`. | `callback-registry.js` |
| `libraries/libbridge/src/dispatcher.js` | URL construction changes to `` `${base}/api/inbox/${tenant_id}/${correlationId}` ``. The `tenant_id` value is already in scope at the construction site (line 94). | `dispatcher.js:102` |
| `services/ghbridge/index.js`, `services/msbridge/index.js` | Both wire `createInboxHandler({ client, logger, clock })` today. Both update to pass the existing `this.#callbacks` registry through. | `ghbridge/index.js:199-203`, `msbridge/index.js:203-207` |
| `libraries/libeval/test/inbox-poller.test.js` | Two fixture URLs updated to the three-param shape (`/api/inbox/default/corr-1`). The poller itself treats `inboxUrl` as opaque and needs no change. | `inbox-poller.test.js:39, 71` |

`InboxPoller` itself (`libraries/libeval/src/inbox-poller.js`, out of
scope per spec) appends `?since=…` to whatever URL it receives — the
route shape is transparent to it. The poller does already need to
handle non-200 responses (an unknown/mismatched-tenant correlation
returns 404 now, where the legacy shape returned `{messages: []}`); the
plan should verify the poller's existing error handling treats a 404 as
terminal or surfaces it, but no code change is in scope here.

## Data flow

```text
Dispatcher.dispatch()
  ├─ tenantResolver.resolve(...) → tenant.tenant_id
  ├─ callbacks.register(correlationId, { ..., tenant_id })  ← binding lives here
  ├─ inboxUrl = `${base}/api/inbox/${tenant_id}/${correlationId}`
  └─ dispatchWorkflow({ inboxUrl, correlationId, ... })

Workflow → poller GET /api/inbox/{tenant_id}/{correlationId}?since=N
  └─ Hono routes to inbox handler
       ├─ tenant_id = c.req.param("tenant_id")
       ├─ correlationId = c.req.param("correlationId")
       ├─ bound = callbacks.tenantOf(correlationId)
       ├─ if (!bound || bound !== tenant_id) → 404 { error: "Unknown correlation" }
       └─ else → long-poll DrainInbox loop (today's `{messages: [...]}`
              success shape on hits, `{messages: []}` on the deadline)
```

A request to the legacy `/api/inbox/{correlationId}` URL never reaches
the handler — Hono's router has no matching mount and returns 404
(criterion 2).

## Test plan (verifying spec criteria)

| Criterion | Test surface |
|---|---|
| 1, 5 | `libraries/libbridge/test/server.test.js` — three-param mount with `default` and a non-default tenant returns the live success shape. |
| 2 | `libraries/libbridge/test/server.test.js` — `/api/inbox/foo` (one param) returns a router miss (Hono's 404, no body). |
| 3, 8 | `libraries/libbridge/test/inbox-handler.test.js` (new) — unknown correlation returns 404 with body `{error: "Unknown correlation"}`; wrong-tenant correlation returns the same status and body. Criterion 3 requires identical responses; criterion 8 anchors the shape against the callback route. |
| 4, 5 | `libraries/libbridge/test/dispatcher.test.js` — `URL.pathname` of the emitted `inboxUrl` ends with `/api/inbox/<tenant>/<correlation>` for both `DefaultTenantResolver` and a registry-resolved tenant. |
| 6 | `libraries/libbridge/test/inbox-handler.test.js` — inbox 404 body parses as JSON, top-level key set `{error}`; cross-checked against `libraries/libbridge/test/callback-handler.test.js` wrong-token expectation. |
| 7 | Repo-wide sweep with the three commands listed in the spec returns zero hits post-implementation. |

## Out of scope

- `InboxPoller` source (`libraries/libeval/src/inbox-poller.js`) — only
  test fixtures change.
- `dispatchWorkflow` / workflow input shape — `inboxUrl` remains an
  opaque workflow input.
- `DrainInbox` proto and bridge-service side — the verification happens
  in the bridge process, not the backend.
- `correlation_id` minting or rotation.
- Multi-tenant deployment topology — owned by spec 1270 plan-a-05.

## Open questions

None — the design follows the convention established by spec 1270
plan-a-04 line-for-line; the plan phase translates the per-file edits
above into ordered steps and writes the corresponding tests.

— Staff Engineer 🛠️
