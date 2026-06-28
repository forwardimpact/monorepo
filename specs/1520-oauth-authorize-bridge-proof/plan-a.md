# Plan 1520-a — `/authorize` requires bridge-originated proof of intent

See [spec.md](spec.md) and [design-a.md](design-a.md).

## Approach

The structural fix replaces `services/ghuser`'s `BEGIN_ALLOWED_SURFACES` /
`DISPATCH_ALLOWED_SURFACES` / `GITHUB_ID_SURFACES` triad with a per-surface
identity-proof registry that evaluates one contract per surface. The
`bridge_pending_dispatch_proof` contract cross-validates `(surface,
surface_user_id, link_token)` against a new `services/bridge` RPC
(`VerifyPendingDispatch`) backed by a single-use `claimed_dispatches.jsonl`
ledger. The `github_account_equality` contract retains today's account-id
check for `github-discussions`. `services/msbridge`'s `#stashAndPostLink`
gains a fail-closed personal-conversation gate so the bridge-proof
contract's link-token-confidentiality requirement is enforced at the only
place that posts the URL. A pre-fix binding migration drops every binding
whose surface is not `github-discussions` on first boot, recorded in a
separate `migrations.jsonl` index. The kill-switch (#1399) and the
`GetToken` quarantine are removed in the same release tag as the registry
and the migration land — no intermediate `main` state where a surface
allowlist and a registry coexist.

## Parts

| Part | Scope | Independence | Sequencing |
|---|---|---|---|
| [01](plan-a-01.md) | `services/bridge` `VerifyPendingDispatch` RPC + `claimed_dispatches.jsonl` single-use ledger + tests | No consumer yet; bridge gains a new RPC method no one calls. | Lands first; pure addition. |
| [02](plan-a-02.md) | `services/msbridge` personal-conversation gate in `#stashAndPostLink` + dispatch-auth test fixture update + new gate test | Tightens behaviour: group chats stop seeing link URLs. Kill-switch still gates `/authorize`, so security delta is zero on its own. | Lands second; safe under the kill-switch. |
| [03](plan-a-03.md) | `services/ghuser` identity-proof registry + contracts + `BridgeClient` wiring + pre-fix binding migration + atomic three-removal + test rewrites | Lifts the kill-switch and the quarantine. Bridge-proof contract closes the personal flow; Part 02 closes the multi-party flow. | Lands last; release tag cut immediately after merge. |

## Atomic release coupling

Spec § Success Criteria pins **one release tag** for "structural fix +
kill-switch removal + `GetToken` quarantine removal". Parts 01 and 02 are
safe in any release; Part 03 is what arms the new behaviour. Cut the
release the same day Part 03 merges; do not cut a release that contains
Part 03 without also containing 01 and 02 (they will be on `main` by
definition because of the sequencing above).

Between Part 03 merge and release-cut, **production still runs the
pre-release tag — the kill-switch is in effect**, but any CI lane, demo
environment, or dev sandbox that pulls `main` between merge and tag
runs the structural-fix code under the post-fix invariants. The
window's divergence vector is the implementer's responsibility to
keep narrow: cut the release tag the same day Part 03 merges.

Once the release ships:

- `BEGIN_ALLOWED_SURFACES` + `surface_not_supported` outcome → gone.
- `DISPATCH_ALLOWED_SURFACES` + `GetToken` quarantine → gone.
- `GITHUB_ID_SURFACES` + hardcoded `identity_mismatch` at `Complete` →
  folded into `github_account_equality` contract.
- Pre-fix `msteams` bindings → dropped at boot of the new release.
- `services/oauth` has two distinct outcome-to-HTTP mappings:
  `/authorize` returns JSON 503 for any outcome
  (`services/oauth/index.js:89-91`); `/callback` looks up
  `OUTCOME_PAGES` for HTML pages
  (`services/oauth/index.js:105-106`, `identity_mismatch` and
  `untrusted_origin` only). `proof_missing` flows through the
  `/authorize` JSON-503 path — catch-all already covers it. Existing
  `surface_not_supported` test in `services/oauth/test/authorize.test.js`
  becomes `proof_missing` (test rewrite tracked in Part 03).

## Tests changed across parts

| Test file | Part | Change |
|---|---|---|
| `services/bridge/test/verify-pending.test.js` | 01 | **NEW** — `VerifyPendingDispatch` happy path, NOT_FOUND, FAILED_PRECONDITION on mismatch and double-claim, concurrency claim race. |
| `services/msbridge/test/personal-conversation-gate.test.js` | 02 | **NEW** — `personal` posts link + writes pending; `groupChat`, `channel`, `undefined`, unknown post static DM-redirect, no pending. |
| `services/msbridge/test/dispatch-auth.test.js` | 02 | **TOUCH** — `makeActivity` helper adds `conversationType: "personal"` so existing tests keep using the personal-conversation path. |
| `services/ghuser/test/identity-verification.test.js` | 03 | **REWRITE** — drops the `surface_not_supported` kill-switch case; asserts `proof_missing` for missing/mismatched bridge proof; asserts bind on valid proof; keeps `identity_mismatch` for `github-discussions`. |
| `services/ghuser/test/query-quarantine.test.js` | 03 | **DELETE** — `DISPATCH_ALLOWED_SURFACES` and the quarantine gate gone. |
| `services/ghuser/test/registry.test.js` | 03 | **NEW** — lookup miss returns `proof_missing`; second registry entry (e.g. `slack`) needs declaration to bind. |
| `services/ghuser/test/migration.test.js` | 03 | **NEW** — first boot drops every non-`github-discussions` binding; `migrations.jsonl` records the run; second boot skips on marker; mid-migration throw aborts boot. |
| `services/ghuser/test/{smoke,completion-ticket,query-contract,query-linked,query-reauth,query-unlinked}.test.js` | 03 | **TOUCH** — inject a no-op `bridgeClient` stub into the `GhuserService` constructor (new hard dep from Step 03.2). |
| `services/oauth/test/authorize.test.js` | 03 | **TOUCH** — replace `surface_not_supported` mock with `proof_missing` (kill-switch outcome retired in Step 03.4). |

The `Test contract` invariants in
[design-a.md § Test contract](design-a.md#test-contract) map 1:1 to the rows
above.

## Cross-cutting risks

- **Pre-release deploy of Part 03 alone.** The release tag must include
  Parts 01 + 02 + 03 together (per § Atomic release coupling). Parts 01 +
  02 release earlier as harmless additions; cutting Part 03 in isolation
  is the failure mode to guard against — `kata-release-cut` reads `main`
  state, so as long as 01 and 02 have already merged, this is structural,
  not procedural.
- **`bridgeClient` failure path during `Begin`.** Bridge unavailability
  returns `proof_missing` indistinguishably from "no pending entry"
  (design key decision § Bridge availability failure mode). Legitimate
  users see `proof_missing` during a bridge outage; msbridge mints a
  fresh `link_token` per inbound message, so a transient outage clears
  on the next user attempt. Implementer should not catch bridge errors
  and re-raise as 5xx — the design's fail-closed semantics route them
  through `proof_missing` instead.
- **Migration write order.** The migration must finish (in-memory deletes
  - `bindings.flush()` + `migrations.add()` + `migrations.flush()`)
  *before* `server.start()` returns. A partial-migration crash with the
  marker not yet written re-runs the migration on next boot — safe,
  because re-running over an already-cleared `msteams` keyspace is a
  no-op. A partial-migration crash with the marker already written would
  leak surviving non-`github-discussions` bindings, so the marker write
  is the **last** step.
- **`activity.conversation.conversationType` fidelity.** The
  personal-conversation gate trusts what the Bot Framework signature
  has verified at msbridge ingress. Weakening that ingress posture in a
  future refactor unravels the proof model (called out in
  [design-a.md § Trust model](design-a.md#trust-model)).
- **Existing `dispatch-auth.test.js` fixtures.** Without the helper
  update in Part 02, every existing test that exercises `link_required`
  would start failing once the gate lands, because the default
  `makeActivity` helper omits `conversationType`. Plan call-out, not a
  surprise.

## Libraries used

Libraries used: librpc (bridge client + `clients.BridgeClient`),
libindex (BufferedIndex for `claimed_dispatches.jsonl` and
`migrations.jsonl`), libstorage (storage backend), libtype (proto
messages), libconfig (`createServiceConfig("bridge")` to discover the
bridge collaborator), libtelemetry (logger/tracer), libbridge (no
changes — `prepareLinkResume` and `createLinkCompleteHandler`
unchanged), libmock (test stubs for `bridgeClient`).

## Execution

| Part | Routing | Parallelism |
|---|---|---|
| 01 | `staff-engineer` (gRPC + storage primitives) | Sequential — must merge before 03. |
| 02 | `staff-engineer` (bridge surface + Bot Framework activity inspection) | Sequential — must merge before 03. |
| 03 | `staff-engineer` (registry + migration + atomic removal coordinated with `kata-release-cut`) | Sequential — last. |

Parts 01 and 02 are independent of each other and may be authored in
parallel by separate sessions if convenient, but neither blocks on the
other. Part 03 imports from 01's RPC and depends on 02's gate being on
`main` for the security claim, so Part 03 is strictly last.

— Staff Engineer 🛠️
