# Plan 1272 Part 03 — Move C: revoke + cross-tenant recess re-arm

Implements design [Move C](design-a.md#revoke-c) (criteria 6–7): webhook-driven
tenant revoke that also cancels in-flight resume work, plus cross-tenant
enumeration so a hosted bridge re-arms every active tenant's pending `elapsed`
recess on restart. Read [spec § criteria 6–7](spec.md) and design Key Decisions
4–6 + § State invariants before executing. All new behaviour is `multi`-mode
only; single-tenant `ListOpenRecesses(tenant_id)` and `rearm()` are untouched.

Libraries used: librpc (clients), libtype (new proto messages), libbridge
(`ResumeScheduler`, store adapter typedef at `src/index.js:17`), libstorage
(per-record atomic writes for the revoke sweep).

## Step C1 — Proto: ListAllOpenRecesses + MarkTenantRevoked

One sentence: add the two cross-tenant RPCs to the bridge proto; leave the
per-tenant `ListOpenRecesses` untouched.

- Modified: `services/bridge/proto/bridge.proto`

Concrete change — add to the `Bridge` service:

```proto
rpc ListAllOpenRecesses(ListAllOpenRecessesRequest) returns (OpenRecessList);
rpc MarkTenantRevoked(MarkTenantRevokedRequest) returns (MarkTenantRevokedResponse);
```

plus messages: `ListAllOpenRecessesRequest {}` (no `tenant_id` — design Key
Decision 5 rejects overloading `ListOpenRecesses` with an empty id);
`MarkTenantRevokedRequest { string tenant_id = 1; }`;
`MarkTenantRevokedResponse { int32 recesses_cancelled = 1; int32 callbacks_refused = 2; }`.
`OpenRecessList`/`OpenRecessRef` already carry `tenant_id` (proto:66–67).

Verification: `just codegen` regenerates libtype bindings; `bun test` in
`services/bridge` still compiles the service.

## Step C2 — Bridge server: ListAllOpenRecesses (active-tenant filter)

One sentence: implement `ListAllOpenRecesses` to enumerate open recesses across
all tenants, server-side filtered to tenants whose tenancy state is `active`.

- Modified: `services/bridge/index.js`

Concrete change: new handler walks every recess record in the store (the same
records `ListOpenRecesses` reads per-tenant) and, for each distinct `tenant_id`,
joins against `tenancy.ResolveByTenantId`; drop refs whose tenant is not
`active` (so a revoked tenant's recess can never be re-armed even if revoke
raced a restart — design § State invariants). Inject the tenancy client the same
way the existing handlers receive their collaborators.

Verification: `bun test test/*.test.js` in `services/bridge`
(`ListAllOpenRecesses` returns refs for active tenants across multiple tenants;
excludes a `revoked` tenant's refs).

## Step C3 — Bridge server: MarkTenantRevoked sweep

One sentence: walk the tenant's recess + callback records under the existing
libindex writer-lock, drop pending recesses, mark queued callbacks refused, and
return the counts.

- Modified: `services/bridge/index.js`

Concrete change: new handler acquires the libindex writer-lock, enumerates the
tenant's recess records and queued callbacks, applies a per-record atomic
libstorage write (rename primitive) to remove each recess and mark each callback
refused, and returns `{ recesses_cancelled, callbacks_refused }`. Cross-record
atomicity is **not** required — a callback that arrives after the sweep is
refused by the callback handler's existing `ResolveByTenantId` state check
(design Key Decision 6, § State invariants).

Verification: `bun test test/*.test.js` in `services/bridge`
(`MarkTenantRevoked` removes the tenant's open recesses, marks its callbacks
refused, returns matching counts, leaves other tenants' records intact).

## Step C4 — ghbridge uninstall→revoke handler

One sentence: dispatch the uninstall-class webhooks to
`tenancy.SetState (active→revoked)` then `bridge.MarkTenantRevoked`, mirroring
`install-handler.js`.

- Created: `services/ghbridge/src/uninstall-handler.js`
- Modified: `services/ghbridge/index.js` (route uninstall-class events in
  `#handleWebhook`, near install dispatch at index.js:311)

Concrete change —
`handleUninstall(body, { tenancyClient, discussionClient, logger })` fires on
`installation.deleted`, `installation.suspend`, and
`installation.repositories_removed` (an `isUninstallEvent(event, body)` guard
mirroring `isInstallEvent`). It resolves each affected installation/repo to its
`tenant_id`, calls `tenancyClient.SetState({ tenant_id, state: "revoked" })`,
then `discussionClient.MarkTenantRevoked({ tenant_id })`. Guarded by
`this.#multiTenant` exactly like the install path. Update `install-handler.js`'s
"The uninstall / `repositories_removed` revoke path is not handled here" note to
point at the new handler.

Verification: `bun test test/*.test.js` in `services/ghbridge` (uninstall event
→ `SetState(revoked)` + `MarkTenantRevoked`; subsequent `ResolveByRepo` for the
revoked repo returns nothing).

## Step C5 — Multi-tenant store adapter binds ListAllOpenRecesses

One sentence: in `multi` mode the bridge process's store adapter implements the
no-arg `Store.listOpenRecesses()` by calling `ListAllOpenRecesses`;
single-tenant keeps calling `ListOpenRecesses(tenant_id)`.

- Modified: `services/ghbridge/src/discussion-adapter.js` and
  `services/msbridge/src/discussion-adapter.js` (whichever owns
  `listOpenRecesses` — the adapter constructed at boot)

Concrete change: the adapter's `listOpenRecesses()` branches on the deployment
mode chosen in `server.js`: `multi` → `client.ListAllOpenRecesses({})`; `single`
→ `client.ListOpenRecesses({ tenant_id })` as today. The libbridge typedef
(`src/index.js:17`) does not widen and `ResumeScheduler` stays mode-agnostic —
it calls `store.listOpenRecesses()` (resume-scheduler.js:146) regardless.

Verification: `bun test test/resume.test.js` in both bridges
(`rearm()` in multi mode schedules recesses across multiple active tenants; none
dropped; single-tenant `rearm` unchanged).

## Step C6 — Docs: drop the deferred revoke + rearm limitations

One sentence: remove the "Deferred: revoke" and "multi-tenant elapsed-recess
re-arm on restart" limitation language now that both ship.

- Modified: `services/ghbridge/README.md`, `services/msbridge/README.md`

Concrete change: replace the ghbridge "Deferred:
`installation.repositories_removed` revoke" section with a statement that
uninstall-class webhooks transition the tenant `active→revoked` and cancel
in-flight recesses/callbacks. Replace the "Documented limitation: multi-tenant
elapsed-recess re-arm on restart" sections in both READMEs with a statement that
a hosted restart re-arms every active tenant's pending `elapsed` recess via
`ListAllOpenRecesses`.

Verification: `rg -n "Deferred: .*revoke|elapsed-recess re-arm on restart"
services/ghbridge services/msbridge` returns nothing.

## Risks

- The revoke sweep and a concurrent restart can race; correctness depends on
  `ListAllOpenRecesses`'s active-tenant filter (Step C2) and the callback
  handler's `ResolveByTenantId` check refusing post-sweep callbacks — neither is
  visible from the sweep code alone (design § State invariants).
- `installation.suspend` is treated as a revoke; confirm against the install
  handler's event set that suspend/unsuspend symmetry is acceptable for this
  scope (spec criterion 6 names uninstall + `repositories_removed`; suspend is
  the conservative superset).

— Staff Engineer 🛠️
