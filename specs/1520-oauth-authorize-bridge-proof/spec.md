# Spec 1520 — `/authorize` requires bridge-originated proof of intent

## Problem

`services/oauth` `/authorize` accepts `surface`, `surface_user_id`,
`redirect_uri`, and `client_state` from query parameters with no
authentication. Only one of the configured surfaces — `github-discussions` —
gates the resulting binding on a matching authorizer identity. On every other
surface (today `msteams`, every future channel by default), the binding upserts
under the asserted `surface_user_id` regardless of who actually authorized,
because `services/ghuser`'s identity gate fires only when the surface is in
`GITHUB_ID_SURFACES`.

The result is a HIGH-severity structural defect: an unauthenticated actor who
knows a victim's surface identity (low barrier inside a Teams tenant) can plant
a binding `(msteams, <victim>) → attacker GitHub token`, and every subsequent
dispatch the victim drives through `msbridge` runs under the attacker's GitHub
identity. The binding-integrity hardening in specs 1380 and 1400 does not close
this: those specs gate the **bridge consume path** for queued dispatches, not
the **binding upsert** that `/callback` performs before any bridge interaction.
The redirect_uri allowlist that looked like a small mechanical fix does not
close it either — GitHub's upstream redirect always targets
`${linkBaseUrl}/callback`, and the binding upserts before the downstream
redirect resolves.

### Defect — Anyone can plant a binding under a victim's non-`github-discussions` surface identity (security, HIGH)

`/authorize` and `/callback` together accept three pieces of unauthenticated
intent from the caller: which `surface` is being linked, which `surface_user_id`
the binding will be keyed under, and a free-form `client_state` echoed at
callback time. No piece of evidence in this flow connects the asserted identity
back to a bridge that has actually observed a user with that identity on that
surface. On `github-discussions` the GitHub authorizer's own account id has to
equal the asserted `surface_user_id`, so a third party cannot plant a binding
without the victim's GitHub account. On every other surface there is no such
relation, so the upsert succeeds:

| Step | Effect |
|---|---|
| Attacker discovers victim's Teams user id (visible inside the tenant). | Low-barrier reconnaissance; no privilege required. |
| Attacker hits `<link_base_url>/authorize?surface=msteams&surface_user_id=<victim>&client_state=<arbitrary>` and authorizes their own GitHub. | `ghuser.Complete` skips the identity check (`msteams` not in `GITHUB_ID_SURFACES`), trusted-origin check passes (real github.com), and the binding `(msteams, <victim>) → attacker GitHub access_token` is upserted. The `completion_ticket` is minted with attacker-chosen `client_state` and the response redirects to `redirect_uri`. |
| Victim later sends a Teams message. | `msbridge` calls `ghuser.GetToken(msteams, <victim>)`, receives the attacker's token, and dispatches the workflow under the attacker's GitHub identity (or fails 403 if the attacker lacks `actions:write` — persistent DoS until overwrite). |

Until PR [#1399](https://github.com/forwardimpact/monorepo/pull/1399) landed the
interim kill-switch, the vulnerable behaviour was **documented as the design
contract** in `services/ghuser/test/identity-verification.test.js` under the
case named `"non-github-discussions surface creates binding regardless of id
difference"`: the test asserted the binding was created even when the
authorizing GitHub account differed from the asserted `surface_user_id`. The
kill-switch inverted that test to a `"rejected at Begin"` assertion. Closing
the **structural** defect requires inverting once more — past the kill-switch's
coarse refusal — to the per-surface identity-proof contract this spec defines.

The Teams-Using-Agents anxiety force this realises is direct: a single,
unauthenticated URL lets one tenant member act under another's GitHub identity
through the bridge — autonomy amplifying bad patterns faster than humans can
intervene, at the very flow where a team first onboards to msteams.

### Why this is structural

There is no compensating control today. The fix has to live where the binding
upsert happens — at `/authorize` and `/callback` — because nothing downstream
(no bridge consume path, no per-message gate) can distinguish a victim-driven
binding from an attacker-driven one once the binding is stored. Whatever
contract closes the gap has to flow across `services/oauth`, `services/ghuser`,
`services/bridge`, and `libraries/libbridge`, and it has to invert the existing
"non-github-discussions surface creates binding regardless of id difference"
contract.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | A bridge whose binding can be planted by any tenant member realises the job's named anxiety — autonomy amplifying bad patterns faster than humans can intervene — and forecloses every non-`github-discussions` channel as a viable surface until the gap closes. Until the structural fix ships, the interim kill-switch on `/authorize` and the paired interim `GetToken` quarantine (see § Scope) take msteams entirely offline: new linking is blocked and dispatch under any pre-fix binding is suspended. msteams returns in the structural-fix release, which ships the kill-switch removal, the `GetToken` quarantine removal, and the binding migration in one tag. |

## Scope

### In scope

| Component | What changes |
|---|---|
| `/authorize` request integrity | A request to `/authorize` produces a binding only when the request is provably originated by a bridge that has already observed the asserted surface identity on that surface. The acceptable proof of bridge origination is a design-time choice between (a) requiring `client_state` to map to a `PutPendingDispatch` entry in `services/bridge` whose `(surface, surface_user_id)` matches the request, or (b) a per-surface signed identity assertion the bridge issues at link-request time and `/authorize` (or `/callback`) verifies. Both close the unauthenticated injection path; the design phase picks one and justifies the choice. |
| Identity contract uniformity across surfaces | The "is this binding authorised to be written" gate is no longer a per-surface allowlist (`GITHUB_ID_SURFACES`). Every surface declares one identity-proof contract that `/callback` evaluates before upserting. `github-discussions` keeps its existing GitHub-account-equality contract; `msteams` adopts the bridge-originated-proof contract chosen above. Adding a new surface requires declaring its contract — there is no default-permissive path. |
| Test contract | The tests that today document either the pre-#1399 vulnerable behaviour or the #1399 kill-switch behaviour in `services/ghuser/test/identity-verification.test.js` are replaced by tests of the post-fix invariants: a non-`github-discussions` flow lacking the surface's declared identity-proof returns a no-binding outcome (analogous to today's `identity_mismatch` / `untrusted_origin`), and a flow carrying valid proof binds. The success criteria are stated as invariants over `services/ghuser/`, not anchored to specific line numbers or to the pre-fix or kill-switch test names — both of those will have drifted by structural-fix time. |
| Existing-binding migration | Existing `msteams` bindings were written under the vulnerable contract and cannot be distinguished from attacker-planted ones. The structural-fix release ships a migration that invalidates all such bindings (drops the storage records); legitimate users re-link through the now-secured flow on their next dispatch. No `msteams` dispatch may run under a binding written before the fix. (Quarantine — the interim choice during the kill-switch window — is a flag-level no-dispatch state on the same records; the structural-fix migration converts every quarantined record into an invalidated one.) |
| Interim kill-switch on `/authorize` | While the structural fix is in design / plan / implement, `/authorize` rejects any surface not in `GITHUB_ID_SURFACES` at `Begin` (returns `outcome: "surface_not_supported"`, mapped to HTTP 503 by `services/oauth`). New `msteams` linking is blocked. **Landed in PR [#1399](https://github.com/forwardimpact/monorepo/pull/1399).** The kill-switch is removed in the same release that ships the structural fix and the migration. |
| Interim `GetToken` quarantine on pre-fix bindings (F1: option c) | The kill-switch closes `/authorize` but does not gate `GetToken`, so any binding already planted before #1399 landed continues to dispatch under whatever GitHub token it carries. To close that residual window: `GetToken(surface, …)` returns the same `link_required` outcome it returns when no binding exists, for any surface not in `GITHUB_ID_SURFACES`, regardless of whether a binding record is present. Storage records are not deleted (the structural-fix migration is the canonical invalidation point); they are inert. Operational effect during the kill-switch window: msteams dispatch is entirely suspended, matching the kill-switch posture on `/authorize`. Implementation point sits in `services/ghuser` `GetToken`; ships either as a follow-up to #1399 or amended into it, before the structural-fix release. SE owns landing it; PM owns this scope decision (chosen option (c) — quarantine — over (a) accepted risk and (b) destructive invalidation; rationale: closes residual exploitation without dropping state, reversible, and aligns with kill-switch posture). The quarantine is removed in the same release that ships the structural fix. |
| Bridge parity | Both `ghbridge` and `msbridge` use the same identity-proof shape on their declared surface — no msteams-only escape hatch. Any future bridge inherits the contract by declaring its surface's identity proof; the bridge's `prepareLinkResume` / `putPendingDispatch` composition extends uniformly. |
| Channel confidentiality for surfaces using bridge-pending-dispatch proof (amendment 2026-06-03) | A surface whose identity-proof contract is "bridge-originated proof of a pending dispatch" is sound only when the bridge can establish that the link it posts is delivered to one — and only one — surface identity. The bridge enforces this by refusing to issue an authorize URL on any conversation type that delivers messages to more than one surface user. On msteams, this means **1:1 personal Bot Framework conversations only** (`conversationType === "personal"`): personal conversations post the augmented authorize URL and store the pending dispatch; group chats, team channels, and any other multi-party conversation type post a static "DM the bot to link your account" message instead and store nothing. Surfaces whose identity-proof contract does not rely on link-token confidentiality (e.g. `github-discussions`'s account-equality contract) are unaffected. **Rationale**: the bridge-originated-proof contract reuses the bridge's authoritative `PutPendingDispatch` state but presupposes the `link_token` reaches only the asserted surface user; in a multi-party conversation any participant who sees the URL can race `/authorize` and bind the asserted identity to their own GitHub account. A per-surface signed-assertion alternative does not escape the same constraint — the assertion would also be channel-delivered. Naming 1:1 conversations as load-bearing makes the trust model explicit in the spec instead of leaving it implicit in the choice of channel, so adding a future surface using the same proof shape has to declare and enforce its own equivalent of the personal-conversation gate. |

### Out of scope

- **Rotating existing `msteams` GitHub OAuth tokens at GitHub.** The migration
  invalidates bindings in `services/ghuser`; revoking tokens at GitHub is
  desirable but not required to close this defect.
- **Auditing of unauthenticated `/authorize` attempts.** Telemetry that
  attributes attempt rate and source is a separate hardening; the bridge-proof
  gate closes the defect whether or not attempts are logged.
- **Rate-limiting `/authorize`.** Once the proof is required, bare rate limiting
  no longer carries the security weight; a separate hardening if needed.
- **Extending the binding model to carry the authorizing GitHub account id on
  every surface for forensic attribution.** Useful, separate.
- **Replacing the `client_state` carrier shape (currently a `linkToken` UUID)
  with a structured token.** A design-phase choice if the chosen proof
  mechanism requires it; not an independent goal of this spec.
- **Removing the `redirect_uri` query parameter.** Allowlisting `redirect_uri`
  does not close the defect (see § Problem); whether to also allowlist it as
  defence-in-depth is a small follow-up, separate.

## Success Criteria

| Claim | Verification |
|---|---|
| An `/authorize` request whose asserted `(surface, surface_user_id)` is not backed by the surface's declared identity proof does not result in a binding upsert, on every configured surface that is not `github-discussions`. | Drive an `/authorize` → `/callback` round-trip for `msteams` with no prior `PutPendingDispatch` entry (or no valid surface assertion, per the design choice); observe no binding is written under `(msteams, <surface_user_id>)`. |
| An `/authorize` request whose asserted `(surface, surface_user_id)` is backed by the surface's declared identity proof results in a binding upsert exactly once, on every configured surface. | Drive a bridge-initiated flow: `bridge.PutPendingDispatch((surface, victim, link_token))` → augmented authorize URL with `client_state=link_token` → user authorizes → `/callback` completes; observe one binding is written under `(surface, victim)` keyed to the authorizing GitHub account. |
| The `github-discussions` identity contract continues to require GitHub-account equality between the authorizer and the asserted `surface_user_id`. | Drive a `github-discussions` flow where authorizing account ≠ asserted `surface_user_id`; observe the `identity_mismatch` outcome and no binding. |
| During the kill-switch window, dispatch under a pre-fix binding is suspended. | With one `msteams` binding present in storage written before PR #1399 landed, call `GetToken("msteams", <surface_user_id>)`; observe it returns `link_required` (the inert outcome), not a token. Drive a Teams message from the same surface user; observe the bridge surfaces a link prompt and does not dispatch under the pre-fix binding. |
| At the structural-fix release, every pre-fix binding is invalidated. | Stand up the structural-fix release against a storage snapshot that carries one or more `msteams` bindings written before PR #1399 landed; observe the migration step drops every such record. After migration, `GetToken("msteams", <surface_user_id>)` returns `link_required` because no binding exists; a fresh bridge-proof flow can then succeed and write a new, post-fix binding. **(Amendment 2026-06-10: the structural-fix release — [PR #1514](https://github.com/forwardimpact/monorepo/pull/1514) `26800e78` merged 2026-06-09 — deliberately omits the migration step per project-owner directive at [PR #1514 issuecomment 2026-06-08T19:50:02Z](https://github.com/forwardimpact/monorepo/pull/1514#issuecomment-4652866490) ("Remove all migration code, backward compatibility, shims or legacy code. These services do not yet run in prod for anyone."). The row is vacuously satisfied while non-deployment holds — the set of pre-fix `(non-github-discussions, …)` bindings is empirically empty across all known operators, so there is nothing for a migration step to drop. The invariant remains in force: if/when `services/ghuser` or `services/oauth` reach production, a pre-deployment binding-hygiene step — clean-slate `data/ghuser/bindings.jsonl` or an ad-hoc one-shot drop of non-`github-discussions` rows — is required before promotion, because `GetToken` does not re-evaluate the identity-contract for stored bindings and any pre-fix record planted during the kill-switch window would otherwise be reachable. Tracked at security-engineer Watchlist via [Issue #1529](https://github.com/forwardimpact/monorepo/issues/1529) reclassification.)** |
| The structural fix and the kill-switch removal (and the `GetToken` quarantine removal) ship in the same release. | Inspect the release that contains the structural fix; observe the same release tag contains the removal of the kill-switch in `services/oauth` / `services/ghuser` `Begin` and the removal of the `GetToken` quarantine. No release tag between PR #1399 and the structural-fix release contains the removal of either; no release tag contains the structural fix without both removals. |
| Adding a new surface requires declaring its identity-proof contract; no surface defaults to "no proof required". | Construct a configuration that introduces a surface without declaring a contract; observe `services/ghuser` refuses to start (or `/authorize` refuses requests for that surface), rather than upserting a binding under the asserted identity. |
| The post-fix invariant is asserted by `services/ghuser/` tests; no test asserts a pre-fix or kill-switch behaviour as a steady state. | Read `services/ghuser/test/`; observe at least one test asserts that a `(non-github-discussions, …)` flow lacking the surface's declared identity-proof returns a no-binding outcome, at least one asserts that a flow carrying valid proof binds, and no test asserts that such a flow either binds without proof (pre-fix) or is rejected at `Begin` with `surface_not_supported` (kill-switch). |
| For surfaces using bridge-pending-dispatch proof, the bridge does not issue an authorize URL on any conversation type that delivers messages to more than one surface user (amendment 2026-06-03). | Drive an msbridge dispatch attempt for a user with no binding, once each in a `personal`, a `groupChat`, and a `channel` Bot Framework conversation; observe `PutPendingDispatch` is called and the augmented authorize URL is posted only in the `personal` case, and observe a static "DM the bot to link your account" message is posted with no pending-dispatch entry written for `groupChat` and `channel`, and observe the gate denies any conversation type other than `personal` (the fail-closed property: an unrecognised or absent `conversationType` is treated as multi-party). |

— Product Manager 🌱
