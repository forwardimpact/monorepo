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
close it either — GitHub's upstream redirect always targets `${linkBaseUrl}/callback`,
and the binding upserts before the downstream redirect resolves.

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

The vulnerable behaviour is **documented as the design contract**:
`services/ghuser/test/identity-verification.test.js:81-97` (`"non-github-discussions
surface creates binding regardless of id difference"`) asserts that the binding
is created even when the authorizing GitHub account differs from the asserted
`surface_user_id`. The test locks the defect in; closing it requires inverting
that contract.

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
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | A bridge whose binding can be planted by any tenant member realises the job's named anxiety — autonomy amplifying bad patterns faster than humans can intervene — and forecloses every non-`github-discussions` channel as a viable surface until the gap closes. Until the structural fix ships, the interim kill-switch on `/authorize` (see § Scope) blocks new msteams linking entirely; existing bindings keep working, but new onboarding pauses.

## Scope

### In scope

| Component | What changes |
|---|---|
| `/authorize` request integrity | A request to `/authorize` produces a binding only when the request is provably originated by a bridge that has already observed the asserted surface identity on that surface. The acceptable proof of bridge origination is a design-time choice between (a) requiring `client_state` to map to a `PutPendingDispatch` entry in `services/bridge` whose `(surface, surface_user_id)` matches the request, or (b) a per-surface signed identity assertion the bridge issues at link-request time and `/authorize` (or `/callback`) verifies. Both close the unauthenticated injection path; the design phase picks one and justifies the choice. |
| Identity contract uniformity across surfaces | The "is this binding authorised to be written" gate is no longer a per-surface allowlist (`GITHUB_ID_SURFACES`). Every surface declares one identity-proof contract that `/callback` evaluates before upserting. `github-discussions` keeps its existing GitHub-account-equality contract; `msteams` adopts the bridge-originated-proof contract chosen above. Adding a new surface requires declaring its contract — there is no default-permissive path. |
| Test contract inversion | The test that today documents the vulnerable behaviour (`services/ghuser/test/identity-verification.test.js:81-97`) is inverted: a non-`github-discussions` flow that lacks the surface's declared identity-proof returns a no-binding outcome (analogous to today's `identity_mismatch` / `untrusted_origin`), and a flow that carries valid proof binds. The success criteria reference the inverted contract, not the existing one. |
| Existing-binding migration | Existing `msteams` bindings were written under the vulnerable contract and cannot be distinguished from attacker-planted ones. The spec requires the design phase to define a migration that either invalidates all existing `msteams` bindings (forcing re-link with proof) or quarantines them behind a one-time re-verification step. The migration ships in the same release as the structural fix; no `msteams` dispatch may run under a binding written before the fix without re-verification. |
| Interim kill-switch | While the structural fix is in design / plan / implement, `/authorize` returns 503 for any surface not in `GITHUB_ID_SURFACES`. New `msteams` linking pauses; existing bindings continue to dispatch (the kill-switch sits at `/authorize`, not at `GetToken`). The kill-switch is removed in the same release that ships the structural fix and the migration. SE owns landing this in a separate small PR ahead of the spec, so the production attack window closes in hours, not days. |
| Bridge parity | Both `ghbridge` and `msbridge` use the same identity-proof shape on their declared surface — no msteams-only escape hatch. Any future bridge inherits the contract by declaring its surface's identity proof; the bridge's `prepareLinkResume` / `putPendingDispatch` composition extends uniformly. |

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
| A binding written before the structural fix shipped cannot be used for a dispatch without re-verification. | With one `msteams` binding present in storage from the pre-fix contract, drive a Teams message from that surface user; observe the bridge does not dispatch under the pre-fix binding and instead surfaces a re-link prompt (or whatever re-verification outcome the migration declares). |
| The kill-switch and the structural fix do not both ship at once. | Observe `/authorize` returns 503 for non-`github-discussions` surfaces in every release tagged before the structural-fix release, and returns the normal flow in the structural-fix release. |
| Adding a new surface requires declaring its identity-proof contract; no surface defaults to "no proof required". | Construct a configuration that introduces a surface without declaring a contract; observe `services/ghuser` refuses to start (or `/authorize` refuses requests for that surface), rather than upserting a binding under the asserted identity. |
| The contract in `services/ghuser/test/identity-verification.test.js:81-97` is inverted from "creates binding regardless of id difference" to "rejects binding when identity proof is absent". | Read the post-fix test file; observe the named case asserts the no-binding outcome under the no-proof flow, and a sibling case asserts the with-proof flow produces a binding. |

— Product Manager 🌱
