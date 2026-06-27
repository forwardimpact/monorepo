# Plan 1273 — Unified per-user dispatch identity

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Land the multi-tenant tenant carrier first so the per-user path works in both
modes, then collapse the mode-conditional dispatch resolver and delete the
orphaned App-token path, then update docs. The tenant carrier is one
authoritative value: `Dispatcher.dispatch` already resolves the tenant before
it returns `link_required`/`reauth_required`, so it enriches that return with
`tenant_id`; the bridge threads that one value into both the `/authorize` URL
(carried to `ghuser` `Begin` → `VerifyPendingDispatch`) and the
`PutPendingDispatch` write key. `"default"` flows in single-tenant, the
registry-resolved id in multi-tenant, so write-key and verify-key match by
construction in every mode.

Libraries used: libbridge (Dispatcher, prepareLinkResume, TokenResolver),
libtype (generated ghuser/bridge types).

## Step 1 — Add `tenant_id` to `ghuser` `BeginRequest`

Give the link-time authorize path a field to carry the resolved tenant.

- Modified: `services/ghuser/proto/ghuser.proto`
- Regenerated: `generated/**` (via `just codegen`)

Add to `BeginRequest` (next free field number):

```proto
message BeginRequest {
  string surface = 1;
  string surface_user_id = 2;
  optional string redirect_uri = 3;
  optional string code_challenge = 4;
  repeated string scopes = 5;
  optional string client_state = 6;
  optional string tenant_id = 7;
}
```

Verify: `just codegen` succeeds and
`ghuser.BeginRequest.fromObject({ tenant_id: "t1" })` round-trips the field.

## Step 2 — `ghuser` proof reads the resolved tenant; remove `SINGLE_TENANT_ID`

The pending-dispatch proof keys on the tenant carried in on `Begin`, not a
hard-coded literal.

- Modified: `services/ghuser/src/identity-contracts.js`

In `bridgePendingDispatchProof.evaluate`, replace `tenant_id: SINGLE_TENANT_ID`
with `tenant_id: req.tenant_id` in the `VerifyPendingDispatch` call. Delete the
`SINGLE_TENANT_ID` const (line 30) and its preceding block comment (lines
21–29). `Begin` already passes the whole `req` to `evaluate`
(`services/ghuser/index.js:92`), so no `Begin` change is needed. A request with
an empty/absent `tenant_id` hits `services/bridge` `requireTenant`
(`services/bridge/index.js:323–325`), which throws on an empty string before any
keyspace lookup — collapsing to `proof_missing` through the contract's existing
fail-closed `catch`. No `SINGLE_TENANT_ID` fallback and no new guard (clean
break).

Verify: covered by Step 9's test changes.

## Step 3 — `services/oauth` `/authorize` carries `tenant_id` into `Begin`

The OAuth front forwards the tenant query param onto the `BeginRequest`.

- Modified: `services/oauth/index.js`

In the `/authorize` handler, read `tenant_id` from `c.req.query()` and pass it
on the `typed("BeginRequest", { … })` object as
`tenant_id: tenant_id || undefined`.

Verify: `services/oauth/test/authorize.test.js` gains a case asserting a
`/authorize?…&tenant_id=t1` request reaches `Begin` with
`req.tenant_id === "t1"`.

## Step 4 — `prepareLinkResume` sets `tenant_id` on the authorize URL

The bridge's link-resume helper writes the tenant onto the URL it posts into the
channel.

- Modified: `libraries/libbridge/src/link-resume.js`

Add a `tenantId` keyword arg to `prepareLinkResume`; when present, call
`originUrl.searchParams.set("tenant_id", tenantId)` alongside the existing
`redirect_uri` / `client_state` params. Absent `tenantId` leaves the URL
unchanged (no param). This is the **only** place the tenant enters the authorize
URL — `ghuser` `GetToken` emits the bare
`/authorize?surface=…&surface_user_id=…` with no tenant — so the Step 3
forwarding and the write-key/verify-key match both depend on this augmentation.

Verify: `libraries/libbridge/test/link-resume-prepare.test.js` asserts
`augmentedUrl` carries `tenant_id` when `tenantId` is supplied and omits it when
not.

## Step 5 — `Dispatcher` enriches the declined result with `tenant_id`

The dispatcher hands the resolved tenant back to the bridge on the non-token
paths.

- Modified: `libraries/libbridge/src/dispatcher.js`

The tenant is resolved at `dispatcher.js:94–101` (`tenant_id` at `:101`) before
the credential fetch. Change the `if (auth.kind !== "token") return auth;` line
(`:108`) to `if (auth.kind !== "token") return { ...auth, tenant_id };`. The
`dispatched` path is unchanged. Both `link_required` and `reauth_required` carry
the field for symmetry, though only `link_required` consumes it (reauth posts a
re-link message with no authorize URL and no write — see Steps 7–8).

Verify: `libraries/libbridge/test/dispatcher.test.js` `link_required` and
`reauth_required` cases assert `result.tenant_id` equals the resolved tenant.

## Step 6 — Thread the resolved tenant into the pending-dispatch write

The write key uses the dispatcher-resolved tenant instead of a bare channel-key
lookup.

- Modified: `services/msbridge/src/discussion-adapter.js`,
  `services/ghbridge/src/discussion-adapter.js`

In `putPendingDispatch(target)`, split the write tenant off the target so it
lands as the sibling `tenant_id` field on `PutPendingDispatchRequest`, never
inside the `pending` sub-object (`PendingDispatch` has no `tenant_id` field):

```js
const { tenant_id: targetTenant, ...pending } = target;
const tenant_id =
  targetTenant ?? (await this.#tenantForChannel(pending.surface ?? CHANNEL));
await this.#client.PutPendingDispatch(
  bridge.PutPendingDispatchRequest.fromObject({ pending, tenant_id }),
);
```

This keeps single-tenant behaviour (`#tenantForChannel` → `"default"`) and lets
multi-tenant callers supply the resolved id. The destructure is required: the
current code spreads the whole `target` into `pending`, so without it a
`target.tenant_id` would be silently dropped as an unknown nested field.

Verify: `services/ghbridge/test/discussion-adapter.test.js` and the multi-tenant
case added to `services/msbridge/test/dispatch-auth.test.js` (Step 11) assert a
supplied `target.tenant_id` becomes the request's sibling `tenant_id`, and that
an absent one still resolves `"default"`.

## Step 7 — `msbridge` link path threads the tenant

The Teams bridge passes the dispatcher's tenant into both the write and the URL.

- Modified: `services/msbridge/index.js` (`#stashAndPostLink`, `:569`)

Depends on Steps 5 and 6 (the enriched `result.tenant_id` and the
tenant-stripping write). `#stashAndPostLink(ctx, result, requester,
conversationType)` already receives the `link_required` `result` and runs only
on `result.kind === "link_required"` (`index.js:432–440`). Pass
`tenantId: result.tenant_id` to `prepareLinkResume` and add
`tenant_id: result.tenant_id` to the `this.#store.putPendingDispatch({ … })`
target (`:591`).

Verify: a multi-tenant `link_required` test posts the link with `tenant_id` on
the URL and writes the pending row under the resolved tenant; single-tenant
behaviour (tenant `"default"`) is unchanged.

## Step 8 — `ghbridge` link path works multi-tenant

Remove the single-tenant-only guard now that the per-user path is the only
dispatch path.

- Modified: `services/ghbridge/src/reply-render.js` (`stashAndPostLink`, `:73`)

Depends on Steps 5 and 6. Delete the `if (multiTenant) { … return; }` guard
(`:79–84`) and its comment. Pass `tenantId: result.tenant_id` to
`prepareLinkResume` and `tenant_id: result.tenant_id` to
`store.putPendingDispatch({ … })` (`:97`). `result` is the `link_required`
outcome from `Dispatcher.dispatch`, now carrying `tenant_id` (Step 5). The
guard's own comment names the hazard this sequencing neutralizes — a
multi-tenant write without a real `tenant_id` resolves the bare channel string
and throws `tenant_unresolved`; threading `result.tenant_id` is what makes the
write land in the correct per-tenant slot.

Verify: a multi-tenant `link_required` test no longer short-circuits, fires no
`workflow_dispatch`, posts the link with `tenant_id`, and writes the pending row
under the resolved tenant.

## Step 9 — `ghuser` identity test: assert the resolved tenant

Prove criterion 3 — the proof is keyed by the resolved tenant, not `"default"`.

- Modified: `services/ghuser/test/identity-verification.test.js`

The existing single-tenant case (`:102`) `Begin`s with no `tenant_id` and pins
`VerifyPendingDispatch` to `tenant_id: "default"` (`:148–153`). After Step 2
that case would send `tenant_id: undefined` and fail the pinned assertion, so it
must now pass `tenant_id: "default"` to `Begin` (still asserting `"default"`
flows through). Add a multi-tenant case: `Begin({ …, tenant_id: "tenant-b" })`
asserts `VerifyPendingDispatch` receives `tenant_id: "tenant-b"`. This is the
`ghuser` identity suite, not the bridge `dispatch-auth` suite criterion 7 scopes
to, so criterion 7 ("existing tests pass unmodified") is unaffected.

Verify: `bun test services/ghuser/test/identity-verification.test.js` passes;
the multi-tenant assertion fails if Step 2 regresses to a literal.

## Step 10 — Collapse the dispatch resolver and delete the App-token path

Make `TokenResolver` the unconditional dispatch credential and remove the
orphaned resolver.

- Deleted: `libraries/libbridge/src/ghserver-token-resolver.js`
- Modified: `libraries/libbridge/src/index.js` (drop the `GhServerTokenResolver`
  export, `:40`)
- Modified: `services/msbridge/index.js`, `services/msbridge/server.js`
- Modified: `services/ghbridge/index.js`

Line numbers are approximate anchors; locate the named symbol and edit it.

| File | Change |
| --- | --- |
| `msbridge/index.js` | Replace the `dispatchTokenResolver` branch (~`:181–184`) with `const dispatchTokenResolver = new TokenResolver(ghuserClient);`. Drop the `GhServerTokenResolver` import (~`:8`) and remove every `ghserverClient` reference: the constructor-deps destructure (~`:113`) and the deleted branch's use. Update the hosted-dispatch comment (~`:176–180`). |
| `msbridge/server.js` | Stop constructing and injecting `ghserverClient`: drop it from the `clients` destructure, the `let`/construct block, the service-instance arg, and the now-stale ghserver comments. `ghserverClient` has no other use in msbridge (dispatch-only), so all references go. |
| `ghbridge/index.js` | Replace the `dispatchTokenResolver` branch (~`:178–183`) with `const dispatchTokenResolver = new TokenResolver(deps.ghuserClient);`. Drop the `GhServerTokenResolver` import (~`:6`). Update the comment (~`:170–177`). **Keep** `#ghserverClient` and its wiring — the reply/reaction path (`makeGraphqlClient` / install-token mint) still uses it. |

`ghbridge/server.js` keeps its `ghserverClient` construction and the
`MintInstallationToken` reply-path use untouched.

No existing test constructs `GhServerTokenResolver` (confirmed by `rg`), so the
deletion needs no test edits beyond Step 11's additions.

Verify: `rg GhServerTokenResolver` returns no hits outside this spec dir; `bun
test` under both bridges and libbridge passes; `ghbridge/server.js` still wires
`ghserverClient` for replies.

## Step 11 — Bridge dispatch-auth tests cover the unified path

Prove criteria 2, 4, and 7 at the bridge boundary.

- Modified: `services/ghbridge/test/dispatch-auth.test.js`,
  `services/msbridge/test/dispatch-auth.test.js`

Add a multi-tenant case to each: an unlinked dispatcher resolves through
`TokenResolver` → `link_required`, fires no `workflow_dispatch`, and posts the
existing link prompt (criterion 4 in multi-tenant). The existing single-tenant
cases stay unmodified (criterion 7). No test may construct
`GhServerTokenResolver`.

Verify:
`bun test services/ghbridge/test/dispatch-auth.test.js services/msbridge/test/dispatch-auth.test.js`
passes.

## Step 12 — Documentation: unified dispatch identity

Reflect the reversal of the 1270 per-mode split and that `ghuser` is required in
both models.

- Modified: `TRUST.md`, `services/msbridge/azure-app.md`,
  `services/ghserver/github-app.md`, `services/ghuser/github-app.md`,
  `services/ghbridge/README.md`, `services/msbridge/README.md`

| File | Change |
| --- | --- |
| `TRUST.md` | § "Workflow runs the hosted operator can observe" (`:53–57`): hosted `workflow_dispatch` now runs under the dispatching user's per-user token via `services/ghuser`, not the `services/ghserver` installation token. The App-key-custody framing (`:31–33`) stays — it still covers the reply/reaction path. |
| `services/msbridge/azure-app.md` | "Workflow credential" table row: per-user OAuth in **both** modes; drop the multi-tenant App-installation-token clause. |
| `services/ghserver/github-app.md` | Remove `ghserver` from the dispatch-credential description; it stays for reply/reaction install tokens. |
| `services/ghuser/github-app.md` | State `services/ghuser` is required in both self-hosted and hosted models. |
| `ghbridge/README.md`, `msbridge/README.md` | Update the per-mode dispatch-credential lines to the single per-user path. |

`services/ghuser` is already a hard constructor dependency of both bridges in
both modes (`msbridge/index.js:120`, `ghbridge/index.js:101`) and is listed in
the service-supervision template (`config/CLAUDE.md`; the live `config.json` is
gitignored), so criterion 6's code-and-configuration legs are already met; this
step aligns the deployment docs that still describe the per-mode split.

Verify: `rg "installation token" TRUST.md` no longer attributes **dispatch** to
`ghserver`; the reply-path custody language remains.

## Risks

- **Write/verify key drift.** If a bridge call site forgets to thread
  `result.tenant_id`, the multi-tenant write lands under one tenant while the
  verify probes another, and every multi-tenant link silently fails closed.
  Steps 7 and 8 both thread the same dispatcher-supplied value; the Step 9 and
  11 multi-tenant tests are the regression fence.
- **`just codegen` drift.** The generated `BeginRequest` must be committed from
  the Step 1 regen; a stale `generated/**` leaves `oauth` unable to set
  `tenant_id`. Run `just codegen` before wiring Steps 2–3.
- **`ghbridge` reply path coupling.** `ghserverClient` is shared by the deleted
  dispatch path and the retained reply path. Remove it only from the dispatch
  wiring (Step 10), not from `ghbridge/server.js` or `reply-render.js`.

## Execution

Sequential within two groups, docs in parallel:

1. **Engineering agent** — Steps 1→2→3 (codegen-gated), then 4→5 (libbridge),
   then 6→7→8 (bridge threading), then 9→11 (tests), then 10 (collapse/delete).
   Step 10 lands after the tenant carrier so the multi-tenant path is never
   broken mid-sequence.
2. **`technical-writer`** — Step 12, runnable in parallel once Step 10's shape
   is fixed.
