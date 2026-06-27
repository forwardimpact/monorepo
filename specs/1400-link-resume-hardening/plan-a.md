# Plan 1400-a — Link-resume auth-completion hardening

[Spec](spec.md) · Design: `design-a.md` (open in design PR
[#1348](https://github.com/forwardimpact/monorepo/pull/1348); not yet on
`origin/main` at plan-PR open time — review against the design PR head).
`kata-release-merge` sequences design before plan; this plan PR's branch
rebases onto main once #1348 merges.

## Approach

Bottom-up: extend `libpreflight` with a startup-fatal non-empty asserter
and `libindex` with a compaction primitive, then introduce the two new
`libutil` modules (ticket + trusted-origin loader), then thread them
through `services/ghuser.Complete`, `services/oauth /callback`, and
`libbridge.{prepareLinkResume, createLinkCompleteHandler}`, then
`ghbridge` and `msbridge` integration, then the `services/bridge`
tombstone removal with compaction, then the structured-log test and
`TRUST.md` notes. Each step is independently verifiable; later steps
depend on earlier ones, never the reverse.

### Documented deviations from `design-a.md`

| Deviation | Rationale |
|---|---|
| `prepareLinkResume` returns `{ skipped: true, reason: "untrusted_origin" } \| { linkToken, augmentedUrl }` and takes a **keyword arg object** rather than throwing `TrustedOriginError` with positional args | Forget-resistance for future xbridge — a missing catch becomes a 5xx oracle; a missing required keyword surfaces at the call site immediately (security review O3) |
| Predicate exported as `isTrusted(origin, set)` (design called it `assertTrusted`) | The function returns a boolean and does not assert; "assert" connotes throw. Rename keeps the API truthful |
| `loadTrustedIdpOrigins` is called from each `server.js` with the literal env (`process.env`), not from the service constructor with a synthesised env object | Honours design's "one env read at boot" intent; avoids the code smell of a service synthesising a fake `env` object to feed a loader (B's M5) |
| Compaction step added to `libindex` and used on consume in `services/bridge` | Closes the append-only deletion gap: libindex is append-only (`base.js:212`, `buffered.js:79`), so deletion-without-tombstone fails on restart. The spec's SC #6 "the link token appears in none of those records" forces a rewrite of the persisted file anyway, since `PutPendingDispatch` already appended a token-bearing line. Compact-on-consume is the minimum-surface fix to deliver an existing spec criterion — no design widening |
| `verifyCompletionTicket({ ticket, expected, trustedOrigins, secret, now })` — adds required `trustedOrigins` arg vs design's `{ ticket, expected, now, secret }` | Verifier needs the trusted set to check `ticket.idpOrigin ∈ trustedOrigins` (design § Identity carrier specifies this check belongs to the verifier). Adding the arg keeps the check inside the verifier rather than re-deriving from the caller |
| `loadTrustedIdpOrigins(raw, { logger })` takes the raw comma string directly vs design's `loadTrustedIdpOrigins(env)` taking an env object | Honours the design's "one env read at boot" intent: `server.js` reads `config.trusted_idp_origins` (which `libconfig` already sourced from the env) and hands the string straight in. Removes the code smell of services synthesising fake `env` objects to feed the loader |
| `verifyCompletionTicket` owns linkToken + signature + exp + origin checks; `surface_user_id` cross-check stays in the handler | The handler is the only site that has both `ticket.surfaceUserId` and the freshly-resolved `pending.surface_user_id`; folding the check into the verifier would force the verifier to take a `pendingStore`, which the design explicitly avoided |

Libraries used: `libutil` (completion-ticket, trusted-origins, runtime
clock), `libpreflight` (assertNonEmpty + node22), `libindex` (compact),
`libconfig` (createServiceConfig), `libstorage` (put — atomic replace),
`libtelemetry`, `librpc`, `libhttp`, `libbridge`. No new third-party deps;
HMAC uses `node:crypto`.

## Open questions resolved

| Q | Resolution |
|---|---|
| HMAC secret env-var name | Per-service config key `link_completion_ticket_secret` (snake_case per `services/CLAUDE.md`); env vars are `SERVICE_GHUSER_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_GHBRIDGE_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET`. **All three must hold the same value** at any moment; rotation policy at `TRUST.md` (Step 11). |
| Ticket lifetime | **5 minutes (300 s)**, pinned as `TICKET_TTL_MS = 5 * 60 * 1000` in `libutil/src/completion-ticket.js`. Covers IdP round-trip + redirect with margin and is well inside browser/proxy URL-lifetime norms. |
| HMAC payload encoding | `payload = base64url(utf8(canonicalJson))` where `canonicalJson = JSON.stringify({ exp, idp_origin, link_token, surface_user_id })` (object keys in alphabetical order). `signature = base64url(hmacSha256(secret, payload))`. Ticket wire form: `${payload}.${signature}`. `exp` is absolute ms since epoch. Verifier compares signatures with `crypto.timingSafeEqual` over equal-length buffers. |
| Config keys per service | `ghuser` declares **three** new keys: `idp_origin` (the ghuser-side IdP host string for the minted ticket; `https://github.com` today), `trusted_idp_origins` (comma list — used by the verifier inside ghuser only if ghuser ever verifies; today it is asserted-non-empty for forward consistency with bridges), `link_completion_ticket_secret`. `ghbridge` and `msbridge` each declare **two**: `trusted_idp_origins` and `link_completion_ticket_secret`. |

## Step 1 — `libpreflight.assertNonEmpty`

Intent: a single startup-fatal assertion helper that fails the process
before any heavy import resolves if a required config value is empty.

| File | Action |
|---|---|
| `libraries/libpreflight/src/assert-non-empty.js` | Created |
| `libraries/libpreflight/package.json` | Modified (exports map, description, keywords, jobs) |
| `libraries/libpreflight/test/assert-non-empty.test.js` | Created |
| `libraries/libpreflight/README.md` | Modified (one paragraph) |

```js
// assert-non-empty.js
export function assertNonEmpty(value, label, processObj = process) {
  if (typeof value === "string" && value.length > 0) return;
  if (Array.isArray(value) && value.length > 0) return;
  if (value instanceof Set && value.size > 0) return;
  processObj.stderr.write(
    `Error: required configuration "${label}" is empty.\n`,
  );
  processObj.exit(1);
}
```

Add `"./assert-non-empty.js": "./src/assert-non-empty.js"` to the exports
map. Widen `package.json` `description` to "Fail fast at process start
with product-authored errors — runtime-floor checks and required-config
assertions before heavy imports resolve." Add `"config"` to keywords;
extend `jobs` with one new Little Hire ("surface a product-authored
empty-config error before the service constructs partially"). Run
`bun run context:fix` to regenerate the catalog. Verification: `bun test
libraries/libpreflight/test` with a fake `processObj` (`{ stderr: {
write: (m) => captured.push(m) }, exit: (n) => exitCode = n }`) —
assertions check `exitCode === 1` and `captured[0]` carries the label —
not a real `process.exit`. Test cases cover empty/populated string,
empty/populated array, empty/populated Set, undefined, null.

## Step 2 — `libindex.compact`

Intent: atomic on-disk replacement of an index's persisted JSONL by the
current in-memory live set. Closes the append-only-vs-deletion gap.

| File | Action |
|---|---|
| `libraries/libindex/src/base.js` | Modified (add `compact()` method) |
| `libraries/libindex/src/buffered.js` | Modified (override `compact()` to flush first) |
| `libraries/libindex/test/base.test.js` | Modified (compaction round-trip) |
| `libraries/libindex/test/buffered.test.js` | Modified (flush-then-compact) |

```js
// base.js — added method on IndexBase
async compact() {
  if (!this.#loaded) await this.loadData();
  const records = [...this.#index.values()];
  await this.#storage.put(this.#indexKey, records);  // libstorage.put replaces file atomically
}
```

```js
// buffered.js — override on BufferedIndex
async compact() {
  await this.flush();                  // drain buffer to disk
  await super.compact();               // then replace
}
```

Verification: write three records, delete one from the in-memory index,
`compact()`, then re-instantiate the index and `loadData()` — the
re-loaded index contains exactly two records and the third's literal
string body does not appear in the file. Buffered variant: same flow with
two buffered writes pre-compact; the post-compact file contains only the
two live entries.

Race safety rationale: `services/bridge` runs as a single Node process per
tenant (per the design's tenancy abstraction and `services/bridge/CLAUDE.md`),
and gRPC handler invocations serialise on Node's event loop within one
process. `compact()` and any concurrent `PutPendingDispatch.add()` therefore
cannot interleave inside one process. The plan adds a code comment at the
compact call-site naming this invariant (exact wording in § Risks). On the
s3/supabase backends, `put` is a single object-replace op; no new primitive
needed.

## Step 3 — `libutil.trusted-origins`

Intent: sole owner of the trusted-origin set; pure functions; caller
passes raw env values directly.

| File | Action |
|---|---|
| `libraries/libutil/src/trusted-origins.js` | Created |
| `libraries/libutil/package.json` | Modified (add export `./trusted-origins`) |
| `libraries/libutil/test/trusted-origins.test.js` | Created |

```js
// trusted-origins.js
export function loadTrustedIdpOrigins(raw, { logger } = {}) {
  const set = new Set();
  for (const entry of String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    let url;
    try { url = new URL(entry); }
    catch { logger?.warn?.("trusted-origin malformed, skipping", { entry }); continue; }
    if (url.protocol !== "https:") {
      logger?.warn?.("trusted-origin refused (non-TLS), skipping", { entry });
      continue;
    }
    set.add(url.origin);                                // .origin normalises host case + default port
  }
  return set;
}
export function isTrusted(origin, set) {
  try { return set.has(new URL(origin).origin); }
  catch { return false; }
}
```

Callers pass `config.trusted_idp_origins` (the comma string) directly —
no synthesised env object. The function reads no globals.

Test fixtures (each is one `test()` block) (**O6 (a)(b)(c)**):

- `https://github.com:443` and `https://github.com` parse to the same set
  entry.
- `https://github.com.` (trailing-dot host) yields a **distinct** origin
  and does **not** match `https://github.com` — documents the residual and
  proves no implicit normalisation.
- `http://github.com` is refused at load with a warning; not added.
- `not-a-url` is skipped at load with a warning; other valid entries on
  the same comma-list still populate.
- Empty / unset raw yields an empty set; `isTrusted("https://github.com",
  emptySet) === false`.
- `isTrusted("https://github.com/login/oauth/authorize", set)` returns
  `true` when `https://github.com` is in the set.
- `isTrusted("https://github.com.attacker.example/path", set)` returns
  `false`.

## Step 4 — `libutil.completion-ticket`

Intent: canonical HMAC-SHA256 ticket format. Pure; caller-injected
`now`.

| File | Action |
|---|---|
| `libraries/libutil/src/completion-ticket.js` | Created |
| `libraries/libutil/package.json` | Modified (add export `./completion-ticket`) |
| `libraries/libutil/test/completion-ticket.test.js` | Created |

Wire format pinned in `Open questions resolved` above:
`${base64url(canonicalJson)}.${base64url(hmacSha256(secret, payload))}`
with canonical JSON = `JSON.stringify({ exp, idp_origin, link_token,
surface_user_id })`.

```js
// completion-ticket.js (signatures)
export const TICKET_TTL_MS = 5 * 60 * 1000;
export function mintCompletionTicket({
  linkToken, surfaceUserId, idpOrigin, secret, now,
}) { /* returns "<payload>.<signature>" */ }
export function verifyCompletionTicket({
  ticket, expected /* { linkToken } */, trustedOrigins, secret, now,
}) {
  // returns { ok: true, claims: { linkToken, surfaceUserId, idpOrigin, exp } }
  //   on success, or { ok: false, reason } on failure
}
```

`expected` carries only `linkToken`. The verifier asserts:
signature valid, `now < exp`, `claims.linkToken === expected.linkToken`,
`isTrusted(claims.idpOrigin, trustedOrigins)`. Failure reasons (all
caller-rendered as the **same** "Unable to verify completion" page —
indistinguishability is intentional):
`malformed`, `bad_signature`, `expired`, `link_token_mismatch`,
`untrusted_origin`. The `surface_user_id` claim is returned in
`claims.surfaceUserId` for the **handler** to cross-check against the
freshly-resolved `pending.surface_user_id` (see Step 7 step 8).

Tests: mint+verify round-trip; signature tamper → `bad_signature`; `exp`
rejection at `now > exp` → `expired`; `link_token` mismatch (cross-token
replay: mint for token A, verify against expected token B) →
`link_token_mismatch`; `idp_origin` outside `trustedOrigins` →
`untrusted_origin`; canonical-JSON-key-order: minting twice with the same
inputs produces byte-identical payloads regardless of input object
property iteration order; `crypto.timingSafeEqual` over equal-length
buffers (test with one byte differing at a non-leading position).

## Step 5 — `ghuser` proto + codegen

Intent: additive field 5 on `CompleteResponse`.

| File | Action |
|---|---|
| `services/ghuser/proto/ghuser.proto` | Modified |
| `generated/` | Regenerated (`just codegen`) |

```protobuf
message CompleteResponse {
  optional string downstream_code = 1;
  optional string redirect_uri = 2;
  optional string client_state = 3;
  optional string outcome = 4;
  optional string completion_ticket = 5;     // NEW — HMAC ticket for the bridge
}
```

Verification at HEAD of this step: `just codegen` runs clean; `bun run
format:fix` applies cleanly; `git diff generated/` includes the new
`completion_ticket` field on `CompleteResponse` (a stale codegen cache
will show no diff and the field silently drops at runtime — confirm before
proceeding); `bun test services/ghuser/test` passes — no behavioural
change yet (field is additive; the next step is the first to set it).

## Step 6 — `ghuser.Complete` origin check + ticket mint

Intent: insert origin assertion before any `bindings.upsert`; mint ticket
on success; return new `untrusted_origin` outcome on failure.

| File | Action |
|---|---|
| `services/ghuser/index.js` | Modified |
| `services/ghuser/server.js` | Modified (config defaults + asserts) |
| `services/ghuser/test/identity-verification.test.js` | Modified |
| `services/ghuser/test/completion-ticket.test.js` | Created |

**`flow.client_state` is the `linkToken`** — `Begin` (already at
`services/ghuser/index.js:48-69`) stashes the bridge's `client_state` on
the flow; the bridge populated it from `prepareLinkResume`'s `linkToken`.
The Complete path reads it back as the linkToken claim of the ticket.

`server.js` adds three keys to `createServiceConfig("ghuser", {…})`
defaults: `idp_origin: ""`, `trusted_idp_origins: ""`,
`link_completion_ticket_secret: ""`. Immediately after the
`createServiceConfig` call, three `assertNonEmpty` calls on the **raw
config strings** (one per key) — the service refuses to start with any
empty (**O2 (b)**). The trusted-origin set is then built as
`const trustedOrigins = loadTrustedIdpOrigins(config.trusted_idp_origins,
{ logger });` followed by a **second** `assertNonEmpty(trustedOrigins,
"trusted_idp_origins (loaded)");` — this catches the regression where the
raw string is non-empty but every entry is `http://` or malformed, which
the loader would silently drop, yielding an empty Set that defeats
fail-closed. Both asserts together honour the design's "fail closed"
contract end-to-end. The Set, `config.idp_origin`, and
`config.link_completion_ticket_secret` are then passed into the
constructor.

`index.js` `Complete` method reorder (existing block at
`services/ghuser/index.js:75-127`):

```text
1. flow = flows.consume(req.state)                  // existing
2. tokens = github.exchangeCode(...)                // existing
3. authorizedGithubId = github.getUser(...)         // existing
4. identity_mismatch early return                   // existing (lines 86-91)
5. NEW — if !isTrusted(this.#idpOrigin, this.#trustedOrigins)
        return { outcome: "untrusted_origin" }
6. bindings.upsert(...)                             // existing (lines 97-106)
7. if (flow.redirect_uri):
     downstreamCode = randomUUID(); grants.add(...)
     NEW — ticket = mintCompletionTicket({
       linkToken: flow.client_state,                // ← repurposed; see note above
       surfaceUserId: flow.surface_user_id,
       idpOrigin: this.#idpOrigin,
       secret: this.#ticketSecret,
       now: this.#clock.now(),
     })
     return { downstream_code, redirect_uri, client_state, completion_ticket: ticket }
```

`this.#idpOrigin`, `this.#trustedOrigins`, `this.#ticketSecret` are set in
the constructor from the dependency bag the server.js builds.

Tests:

- `untrusted_origin` outcome when `idp_origin` is configured outside
  `trusted_idp_origins`; `bindings.upsert` is **not** called (verify via
  `BindingStore` mock that `upsert` count stays 0).
- Successful completion returns a non-empty `completion_ticket` and
  `verifyCompletionTicket` confirms its `linkToken === flow.client_state`,
  `surfaceUserId === flow.surface_user_id`, `idpOrigin === config.idp_origin`,
  `exp ≈ now + TICKET_TTL_MS`.
- **`idp_origin` invariance** (**O2 (c)**): with `idp_origin` fixed to
  `https://github.com`, run `Complete` against three request-controlled
  inputs — `req.code` set to `https://attacker.example/code`, `req.state`
  forged, a flow-store fixture where `flow.redirect_uri` points to
  `https://attacker.example` — and assert that for every successful path
  the decoded ticket's `idpOrigin === "https://github.com"`. The ticket
  origin never reflects request data.
- HMAC secret rotation: minting with secret A and verifying with secret B
  fails with `bad_signature` — documents the O5 failure window.

## Step 7 — `oauth /callback` ticket forwarding + refusal page

Intent: append `&ticket=…` to the redirect URL when the response carries
one; render a sibling `untrusted_origin` refusal page.

| File | Action |
|---|---|
| `services/oauth/index.js` | Modified |
| `services/oauth/test/oauth.test.js` | Modified |

Insert the `untrusted_origin` branch **between** the existing
`identity_mismatch` branch (lines 77-83) and the `if (result.redirect_uri)`
builder (line 86):

```js
if (result.outcome === "untrusted_origin") {
  return c.html(
    "<!DOCTYPE html><html><body><h1>Account not linked</h1>" +
      "<p>The identity provider that authorized is not in the configured " +
      "trusted set. No binding was created.</p></body></html>",
  );
}
```

Inside the existing `if (result.redirect_uri)` block (lines 86-91), append
one line **after** the `code`/`state` sets and **before** the redirect:

```js
if (result.completion_ticket)
  url.searchParams.set("ticket", result.completion_ticket);
```

The bare-success branch at lines 94-96 ("Linked. You can close this
window.") is **unchanged**: it fires only when there is no
`redirect_uri`, which means no bridge is waiting and no ticket carrier is
needed.

Verification: existing oauth tests + new fixtures — (a) redirect carries
`ticket=…` when `completion_ticket` is present; (b) redirect omits
`ticket` when absent; (c) `untrusted_origin` outcome renders the new HTML
page and does not redirect.

## Step 8 — `libbridge.prepareLinkResume` discriminated return + handler reorder

Intent: change the link-post primitive to a discriminated keyword-arg
return; reorder the complete-handler so ticket verification precedes any
store call.

| File | Action |
|---|---|
| `libraries/libbridge/src/link-resume.js` | Modified |
| `libraries/libbridge/test/link-resume.test.js` | Modified |

`libbridge/src/index.js` is **not** modified — neither
`loadTrustedIdpOrigins` nor `verifyCompletionTicket` is re-exported
through libbridge. Both bridges and ghuser import directly from
`@forwardimpact/libutil/trusted-origins` and
`@forwardimpact/libutil/completion-ticket`, honouring the design's
"no libbridge wrapper" decision.

`prepareLinkResume({ authorizeUrl, callbackBaseUrl, trustedOrigins })`:

```js
export function prepareLinkResume({ authorizeUrl, callbackBaseUrl, trustedOrigins }) {
  if (!(trustedOrigins instanceof Set))
    throw new TypeError("prepareLinkResume: trustedOrigins must be a Set");
  let originUrl;
  try { originUrl = new URL(authorizeUrl); }
  catch { return { skipped: true, reason: "untrusted_origin" }; }
  if (!isTrusted(originUrl.origin, trustedOrigins))
    return { skipped: true, reason: "untrusted_origin" };
  const linkToken = randomUUID();
  originUrl.searchParams.set("redirect_uri",
    `${normalizeBaseUrl(callbackBaseUrl)}/api/link-complete`);
  originUrl.searchParams.set("client_state", linkToken);
  return { linkToken, augmentedUrl: originUrl.toString() };
}
```

The `TypeError` on missing `trustedOrigins` makes "forgot to pass" a
loud, unmissable boot-time error for any future xbridge — protecting
against the same forget-resistance class O3 wanted addressed.

`createLinkCompleteHandler({ channel, store, dispatcher, buildCallbackMeta,
trustedOrigins, ticketSecret, clock })` reorder:

```text
1. linkToken = c.req.query("state")
2. if !linkToken: "Missing state" 400              // existing (lines 33-39)
3. ticket = c.req.query("ticket")
4. verify = verifyCompletionTicket({
     ticket, expected: { linkToken },
     trustedOrigins, secret: ticketSecret, now: clock.now(),
   })
5. if !verify.ok:
     return c.html("<!DOCTYPE html>…<h1>Unable to verify completion</h1>…")
6. target = store.resolvePendingDispatch(linkToken)   // existing
7. if !target: "Already processed"                    // existing
8. if verify.claims.surfaceUserId !== target.surface_user_id:
     return c.html("<!DOCTYPE html>…<h1>Unable to verify completion</h1>…")
9. existing ctx / userTurn / dispatch path unchanged
```

**Timing residual** (**O1**): An attacker without a valid ticket exits at
step 5 before any store touch, so unsigned probes against random `state`
values cannot distinguish liveness. An attacker holding a valid ticket
bound to one `linkToken` can still distinguish present-vs-absent for that
specific entry via the step-5-pass / step-6-decision timing — but a valid
ticket implies the attacker controls the bound `surface_user_id`'s IdP
round-trip, so the binding is already theirs. We **accept** this timing
residual as same-class as the within-window URL-replay residual the
design names. Equal-work or P50-floor padding is rejected: it adds a
moving-target latency dependency for a window the attacker already
controls. A libbridge-wide timing-parity convention (this is the second
consecutive spec to surface the pattern) is filed in § Follow-ups, not
scoped here.

Tests:

- `prepareLinkResume` throws `TypeError` when `trustedOrigins` is
  missing (forget-resistance) and when it is not a `Set`.
- Returns `{ skipped, reason: "untrusted_origin" }` for an out-of-set
  URL **and** for a malformed URL.
- Returns `{ linkToken, augmentedUrl }` for an in-set URL.
- Handler — **separated** test cases (so each pins one ordering claim):
  - No ticket → "Unable to verify"; store's `resolvePendingDispatch` mock
    asserts call-count 0 (no-touch invariant).
  - Bad signature → same; same no-touch assertion.
  - Expired ticket → same; same no-touch assertion.
  - `link_token` mismatch in ticket → same; same no-touch assertion.
  - Untrusted origin in ticket → same; same no-touch assertion.
  - Valid ticket, no pending entry → "Already processed".
  - Valid ticket, pending entry with mismatched `surface_user_id` →
    "Unable to verify"; **store call-count 1** (the cross-check
    necessarily happens after store lookup).
  - Valid ticket, matching pending entry → dispatches exactly once.

## Step 9 — `ghbridge` and `msbridge` integration

Intent: thread `trustedOrigins`, `ticketSecret`, and the new discriminated
return through both bridges.

| File | Action |
|---|---|
| `services/ghbridge/server.js` | Modified |
| `services/ghbridge/index.js` | Modified |
| `services/msbridge/server.js` | Modified |
| `services/msbridge/index.js` | Modified |
| `services/ghbridge/test/ghbridge.test.js` | Modified |
| `services/msbridge/test/msbridge.test.js` | Modified |

Each `server.js` adds to the `createServiceConfig` defaults:
`trusted_idp_origins: ""`, `link_completion_ticket_secret: ""`.
Immediately after `createServiceConfig`, calls `assertNonEmpty` on each
raw string. Then `const trustedOrigins =
loadTrustedIdpOrigins(config.trusted_idp_origins, { logger });` followed
by `assertNonEmpty(trustedOrigins, "trusted_idp_origins (loaded)")` and
`const ticketSecret = config.link_completion_ticket_secret;`. Both
`trustedOrigins` and `ticketSecret` are passed to the service
constructor. Each bridge's `index.js` already constructs the libbridge
handler (`createLinkCompleteHandler(...)` is called in `index.js` before
the `createBridgeServer` call — confirm at `services/ghbridge/index.js:167`
and equivalent in msbridge); the constructor receives `trustedOrigins`,
`ticketSecret`, and `clock` from the dependency bag and threads them into
the `createLinkCompleteHandler` call inside `index.js`. The handler is
then passed to `createBridgeServer` as `onLinkComplete`.

Each bridge's `#stashAndPostLink` (file:line `services/ghbridge/index.js:490`,
`services/msbridge/index.js:436`) changes to:

```js
const r = prepareLinkResume({
  authorizeUrl, callbackBaseUrl: base, trustedOrigins: this.#trustedOrigins,
});
if (r.skipped) {
  this.#logger.info("link-resume skipped", { reason: r.reason });
  // log payload carries r.reason only; never the rejected authorizeUrl
  // or its origin (which would leak the trusted-origin set to log sinks).
  return;                                       // no put, no post
}
await store.putPendingDispatch({ link_token: r.linkToken, … });
await channel.postLink(r.augmentedUrl);
```

Tests (parity — same shape on `ghbridge` and `msbridge`):

- `#stashAndPostLink` does **not** post and does **not** put when
  `authorizeUrl`'s origin is outside the set; logs at info level.
- End-to-end consume succeeds when the ticket validates.

## Step 10 — `services/bridge` tombstone removal + compaction

Intent: delete the row from the in-memory index; compact the persisted
file so neither the original `PutPendingDispatch` line nor any tombstone
carries the link token; remove the now-dead tombstone readers.

| File | Action |
|---|---|
| `services/bridge/index.js` | Modified |
| `services/bridge/test/bridge.test.js` | Modified |

At `ResolvePendingDispatch` (`services/bridge/index.js:213-234`):

- **Remove** the stale-clean loop at lines 215-219 (it scans for
  `rec.deleted`).
- **Remove** the tombstone write at line 226
  (`add({ id, deleted: true })`).
- **Add** `await this.#pendingDispatches.compact();` immediately after
  `this.#pendingDispatches.index.delete(req.link_token);` (existing line
  225). Compact rewrites `pending_dispatches.jsonl` to contain only the
  remaining live entries — the consumed `link_token` is gone from disk.

At `#sweep` (lines 273-277): change the predicate from
`(rec) => rec.deleted || now - (rec.created_at ?? 0) > this.#pendingTtlMs`
to `(rec) => now - (rec.created_at ?? 0) > this.#pendingTtlMs`. **After
the sweep, compact unconditionally if `evicted_pending > 0`** —
mirroring the existing `flush()`-gated-on-count pattern at the sweep
site. Compact is a no-op when nothing was evicted; gating avoids the
file-replace syscall on every sweep tick.

Verification:

- `ResolvePendingDispatch` followed by reading
  `data/bridges/pending_dispatches.jsonl` yields a file containing zero
  substring matches for the consumed `link_token` (and for any tombstone
  marker). Fixture: temp `data/` via libstorage local backend; assert via
  `fs.readFile(path) + .includes(linkToken) === false` and
  `.includes("deleted") === false`.
- Restart durability: with the libstorage local backend pointed at a
  temp directory, write three pending entries, consume one, simulate
  process restart by constructing a new `BridgeService` over the same
  storage path, call `loadData()` — the index contains exactly the two
  remaining entries; the consumed token does not reappear; the on-disk
  jsonl file does not contain the consumed token as a substring either.
- Sweep behaviour unchanged for non-deleted expired entries (one extra
  test pins compaction-after-sweep removes them from disk).

## Step 11 — Structured-log no-token assertion (O4)

Intent: prove the literal `link_token` value does not appear in any
structured log line over a full mint → post → complete → consume flow,
with the loggers that **are wired in production** actually exercised by
the captured run.

| File | Action |
|---|---|
| `libraries/libbridge/test/link-resume-log-redaction.test.js` | Created |

Pattern: `@forwardimpact/libtelemetry` `Logger` writes via `console.error`
(see `libraries/libtelemetry/src/logger.js:94,108,130,159`), **not**
`process.stdout`. Rebind `console.error` for the duration of the test —
the existing pattern at `libraries/libutil/test/logger.test.js:16-22`
(`originalConsoleError = console.error; console.error = (m) =>
consoleOutput.push(m);` with restore in `afterEach`) is the exact shape
to copy.

The captured run must exercise: (a) `prepareLinkResume`-issuing bridge
(`services/ghbridge` constructor wired with a real
`@forwardimpact/libtelemetry` `createLogger("ghbridge", runtime)`); (b)
`ghuser.Complete` with `createLogger("ghuser", runtime)`; (c)
`libbridge.createLinkCompleteHandler` with `createLogger("libbridge",
runtime)`; (d) `services/bridge.PutPendingDispatch` and
`ResolvePendingDispatch` with `createLogger("bridge", runtime)`. All four
`createLogger` calls take the `(name, runtime)` two-arg form because
`Logger` throws "runtime is required" otherwise
(`libraries/libtelemetry/src/logger.js:33`). Drive the full flow against
fake adapters; after completion, assert the captured array contains zero
substring matches for the literal `linkToken` value used in the fixture
(also assert no match for the literal value across the captured stderr
**and** for any payload field carrying the rejected origin from `r.reason`
log lines — bridge log payloads must carry the reason string only,
never the rejected URL or its origin). Document in a comment block which
production logger calls were exercised; future removal of any weakens the
regression catcher and must be flagged in review. (**O4 (a)**)

**O4 (b) deferred** to § Follow-ups: a libbridge-side logger field-name
redactor that strips `link_token` from any structured log entry is a
follow-up that changes the `libtelemetry` logger surface.

## Step 12 — `TRUST.md` operator notes

Intent: publish the HMAC rotation policy and trusted-origin policy.

| File | Action |
|---|---|
| `TRUST.md` | Modified (append a new subsection) |

New subsection under "Secrets the hosted operator holds":

> **`LINK_COMPLETION_TICKET_SECRET`** — Shared HMAC secret across
> `services/ghuser`, `services/ghbridge`, and `services/msbridge`,
> declared per service as `SERVICE_GHUSER_LINK_COMPLETION_TICKET_SECRET`,
> `SERVICE_GHBRIDGE_LINK_COMPLETION_TICKET_SECRET`,
> `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET`. All three must hold
> the same value at any moment. Rotation is **atomic-deploy-all-three**
> (**O5 (a)**): deploy the new value to all three services in one
> coordinated release. In-flight completion tickets minted under the old
> secret will fail verification for the remainder of their TTL
> (`TICKET_TTL_MS = 5 minutes`). The user-visible failure window is the
> ticket TTL **plus** the rolling-deploy duration to the last of the
> three services; operators should plan the rollout to complete within
> minutes and avoid traffic peaks. Affected users see "Unable to verify
> completion" and complete the next webhook-initiated flow normally. No
> data loss; only the auto-resume affordance fails inside the rotation
> window. Versioned-secret with N+1 verify acceptance was considered and
> rejected — tracking two live secret versions exceeds the cost of a
> short failure window during a rare operator action.
>
> **`BRIDGE_TRUSTED_IDP_ORIGINS`** — Comma-separated list of `https://…`
> origins (`new URL(s).origin` normalised), declared per service as
> `SERVICE_GHUSER_TRUSTED_IDP_ORIGINS`,
> `SERVICE_GHBRIDGE_TRUSTED_IDP_ORIGINS`,
> `SERVICE_MSBRIDGE_TRUSTED_IDP_ORIGINS`. Empty / unset is fatal at
> startup. Non-`https://` entries are **refused at load** with a logged
> warning. Malformed entries are skipped with a logged warning.
> Trailing-dot hosts produce a distinct origin and are **not** matched
> by the bare host. Example: an authorization URL from
> `https://github.com.` is rejected when only `https://github.com` is in
> the set; list both spellings if both are operationally valid (rare).

Verification: `bun run wiki` (the canonical wiki audit script in
`package.json`) passes; `bun run format:fix`.

## Risks

| Risk | Why it's a risk | Mitigation |
|---|---|---|
| Generated code drift on `just codegen` | The proto edit to `CompleteResponse` regenerates client bases. If a stale cache lingers, runtime sees a 4-field response shape and the ticket field is silently dropped — the bridge then renders "Unable to verify" on every legitimate complete. | Step 5 verification line pins the `git diff generated/` check before proceeding. |
| `idp_origin` ↔ `trusted_idp_origins` config drift after rotation | If `services/ghuser` ships with `idp_origin` updated but `BRIDGE_TRUSTED_IDP_ORIGINS` on the bridges has not picked up the new value, every complete returns `untrusted_origin` even though IdP authorization succeeded. | Operator runbook in `TRUST.md` (Step 12) names the joint deploy; `assertNonEmpty` catches the un-set case; the ghuser test in Step 6 covers cross-set membership. |
| Atomic rotation failure window (O5) | Five-minute TTL means in-flight tickets fail for the window. The user-visible page is "Unable to verify completion" — looks like a bug to support. | `TRUST.md` (Step 12) documents the symptom and the absence of data loss. |
| Compaction interleaved with concurrent `PutPendingDispatch` | If a new put lands between `compact()` reading the in-memory index and `libstorage.put` completing the file replace, the new put's `add()` will append to the file that gets replaced — the put is lost on disk (the in-memory index still has it, but on restart it is gone). | `services/bridge` is single-instance per the existing design (`services/bridge/CLAUDE.md` § Tenancy and design-a.md § Tenancy abstraction); RPC handlers serialise per-process via Node's event loop, so compact and add cannot interleave inside one process. Plan adds a comment at the compact call-site, exact wording: `// compaction safety: services/bridge runs single-instance per tenant; gRPC handlers serialise on the event loop, so compact() and add() never interleave inside one process. If services/bridge ever becomes multi-instance, replace this with a tmp-file + atomic rename inside libstorage.` |

## Follow-ups (not in scope for spec 1400)

- **libbridge-wide timing-parity convention.** O1 plus a prior spec both
  surfaced the equal-work-on-failure-vs-success oracle at handler entry
  points. A future spec (file post-merge) can propose a
  `withEqualWork(handler)` wrapper that pins a minimum-latency floor on
  any libbridge handler that touches a store after a cheap pre-check.
- **libbridge logger field-name redactor (O4 (b)).** A
  `logger.redact(["link_token"])` API on `libtelemetry` would prevent
  link-token leakage by construction rather than detecting it after the
  fact. Surface change to `libtelemetry` warrants its own spec.
- **libindex compaction surface** — once `compact()` ships for
  `services/bridge`, other index consumers may want it. Promote to a
  shared retention/compaction policy in a follow-up spec rather than
  here.

## Execution

Single-PR plan. One commit per step (commit shape is the implementer's
prerogative for review hygiene). Routing: `staff-engineer` for steps
1-11, `technical-writer` for step 12 (TRUST.md operator copy).

Sequential, on one `feat/1400-link-resume-hardening` branch:

1. Step 1 (libpreflight) → 2 (libindex compact) — independently
   testable foundations.
2. Step 3 (trusted-origins) → 4 (completion-ticket) — libutil primitives.
3. Step 5 (proto + codegen).
4. Step 6 (ghuser Complete + config).
5. Step 7 (oauth /callback).
6. Step 8 (libbridge primitives).
7. Step 9 (both bridges).
8. Step 10 (services/bridge tombstone removal + compaction).
9. Step 11 (log-redaction test).
10. Step 12 (TRUST.md).

## Folded security observations — index

| Obs | Decision | Step |
|---|---|---|
| O1 timing parity | Accepted residual; same-class as within-window URL replay. Follow-up convention filed in § Follow-ups. | Step 8 (handler reorder narrative) |
| O2 (a) config key name | `idp_origin` snake_case (ghuser) | Step 6 |
| O2 (b) assertNonEmpty | Yes — startup-fatal in `ghuser`, `ghbridge`, `msbridge` server.js | Steps 1, 6, 9 |
| O2 (c) idp_origin invariance test | Yes — fixture varying `code`, `state`, `flow.redirect_uri` | Step 6 |
| O3 TrustedOriginError | Replaced with discriminated `{ skipped, reason }` return + required keyword arg from `prepareLinkResume` (deviation from `design-a.md` § Documented deviations) | Steps 8, 9 |
| O4 (a) structured-log test | Yes — exercises all production loggers; pins capture pattern from `libtelemetry/test/logger.test.js` | Step 11 |
| O4 (b) logger field-name redactor | Deferred to § Follow-ups | — |
| O5 HMAC rotation | (a) atomic-deploy-all-three; (b) versioned-secret rejected. Documented in `TRUST.md`. | Step 12 |
| O6 (a) trailing-dot host | Distinct origin; documented; test fixture proves no implicit normalisation | Step 3 |
| O6 (b) `http://` entries | Refused at load with warning | Step 3 |
| O6 (c) malformed URL | Skipped at load with warning | Step 3 |

— Staff Engineer 🛠️
