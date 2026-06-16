# Spec 1273 — Unified per-user dispatch identity

## Persona and job

Serves **Teams Using Agents** —
[run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
A team chats with the Kata Team "as themselves"; the runs and commits the team
triggers should be attributed to the human who asked, in every deployment mode.

This spec sits in tension with that job's **Little Hire** — "onboard a Kata
installation that runs the Plan-Do-Study-Act loop without per-team prompt
engineering." Unifying dispatch identity raises the hosted onboarding floor:
every hosted dispatcher must now link a GitHub account before they can trigger a
run. The WHY below weighs that cost against the attribution and audit gain.

## Problem

[Spec 1270](../1270-kata-bridges-public-hosting/spec.md) split the
`workflow_dispatch` credential by deployment mode. Self-hosted (single-tenant)
fires `workflow_dispatch` under a **per-user OAuth token** resolved through
`services/ghuser`. Hosted (multi-tenant) fires it under a **repo-scoped App
installation token** minted by `services/ghserver`. The two GitHub apps and the
per-mode split are documented in
[`services/ghuser/github-app.md`](../../services/ghuser/github-app.md) and
[`services/ghserver/github-app.md`](../../services/ghserver/github-app.md).

> Note: 1270 § Excluded names the per-user OAuth service `services/ghauth`; it
> was renamed to `services/ghuser` in
> [spec 1271](../1271-rename-ghauth-to-ghuser/spec.md). A reader
> cross-referencing 1270 should treat `services/ghauth` and `services/ghuser` as
> the same surface.

This split has two consequences:

1. **Dispatch identity diverges by deployment mode.** The bridges select the
   dispatch credential on `tenancy_mode` — a mode-specific branch that is a
   recurring source of gotchas and asymmetric behaviour between the two paths.
2. **Hosted runs and commits are attributed to a bot, not the human.** On the
   hosted path the run executes under the server App installation token, so
   GitHub records the App as the actor. Field-observed 2026-06-16: a
   multi-tenant Teams dispatch ran as "kata-agent-team [Bot]" rather than the
   dispatching user. This loses attribution and audit fidelity and contradicts
   the product intent of chatting with the Kata Team "as yourself."

### Why this reverses a 1270 decision

1270 did not "accept lower attribution fidelity" as a goal. It **chose** the
repo-scoped App installation token for hosted dispatch and left per-user
dispatch identity out of scope and unchanged on the hosted path (1270 §
Excluded). That choice served 1270's own Little Hire: a hosted adopter could
onboard and dispatch with **no per-user link** and no operator intervention
(1270's onboarding success criteria). Lowering the hosted onboarding floor was
the point.

This spec makes the opposite trade. It accepts a higher onboarding floor — every
hosted dispatcher must link a GitHub account — in exchange for two gains:
uniform dispatch behaviour across modes (one credential path, no `tenancy_mode`
fork on identity) and real per-user attribution and audit fidelity on the hosted
path. The cost lands on the Teams-Using-Agents Little Hire above; the gain lands
on the Big Hire's promise of chatting with the team "as yourself." The
reintroduced onboarding cost is a one-time per-user link — each hosted
dispatcher links once, then dispatches without further intervention.

## Proposal

Unify dispatch identity across both deployment modes. The bridges always resolve
the `workflow_dispatch` credential through `services/ghuser` (per-user OAuth),
in single-tenant and multi-tenant deployments alike. There is one
dispatch-credential path; the `tenancy_mode` branch that selects the dispatch
credential is removed.

For multi-tenant deployments, the per-user dispatch identity must be scoped to
the resolved tenant. `services/ghuser` is currently hard-wired to a single
`"default"` tenant (the `SINGLE_TENANT_ID` behaviour in its identity contracts),
and explicitly defers the multi-tenant case to "a future multi-tenant spec."
This spec is that spec, naming the full threading path by behaviour:

1. The bridge writes the pending-dispatch proof keyed by the resolved tenant —
   `PutPendingDispatch` via `services/bridge`, which already keys its keyspace
   by the resolved tenant id.
2. The resolved tenant id is carried through `services/oauth`'s `/authorize`
   request into `ghuser`'s `Begin`.
3. `ghuser`'s `bridgePendingDispatchProof` reads that resolved tenant when it
   calls `VerifyPendingDispatch`, instead of the hard-coded single tenant.

The outcome (contract level): per-user dispatch is correctly tenant-scoped in
multi-tenant mode, replacing the single hard-coded tenant. Without this, the
unification cannot actually work multi-tenant.

GitHub repository access becomes the authorization model for dispatch:
authorization is delegated to GitHub, with no bridge-side access check. There
are two distinct cases. An **unlinked or expired-link** user produces no token,
so the bridge fires no dispatch and emits the existing link/reauth prompt — this
is unchanged bridge behaviour. A **linked-but-unauthorized-on-repo** user does
have a token, so a dispatch is attempted; GitHub then refuses the
`workflow_dispatch` (403) at dispatch time. `services/ghuser` runs in every
deployment.

This reverses two spec 1270 decisions:

- Hosted `workflow_dispatch` uses the server App installation token.
- The hosted path requires no per-user link (the deliberate onboarding-floor
  reduction).

## Scope

### In scope

- Remove the deployment-mode-conditional selection of the **dispatch
  credential** in `services/msbridge` and `services/ghbridge`, so the per-user
  token resolved through `services/ghuser` is the single source of the
  `workflow_dispatch` identity in both modes.
- Thread the resolved tenant id along the linking path: the bridge writes the
  proof via `services/bridge` `PutPendingDispatch` (keyed by the resolved
  tenant); the tenant is carried through `services/oauth`'s `/authorize` into
  `ghuser`'s `Begin`; and `ghuser`'s `VerifyPendingDispatch` call reads the
  resolved tenant instead of the hard-coded single tenant (`SINGLE_TENANT_ID`),
  so per-user dispatch is correctly tenant-scoped in multi-tenant mode.
- Remove the now-orphaned dispatch-only credential path as a clean break: the
  App-token dispatch resolver and its dispatch-only `ghserverClient` wiring in
  `services/msbridge` and `services/ghbridge`, whose only consumers are the
  deleted dispatch branches. `services/ghbridge` **retains** its
  `ghserverClient` for the out-of-scope reply/reaction path (per-tenant GraphQL
  installation tokens), which is unchanged.
- `services/ghuser` is a required service in both the self-hosted and hosted
  deployment models.
- Update the GitHub-app guides and any deployment documentation that describe
  the per-mode dispatch-credential split, **including `TRUST.md`** (its
  "Workflow runs the hosted operator can observe" section asserts hosted
  `workflow_dispatch` uses the `services/ghserver` installation token — this
  spec reverses that), to reflect the unified model.

### Excluded

- **Tenant → repository resolution is unchanged.** Multi-tenant resolves the
  target repository by registry lookup; single-tenant uses static configuration.
  That resolution _is_ the definition of the tenancy modes; only the dispatch
  **identity** is unified, not the repository resolution. The `tenancy_mode`
  branch legitimately remains for tenant → repo resolution and for the
  reply-token path.
- **Keyless workflow identity** (`services/ghserver`, fronted by
  `services/oidc`) — the credential a kata workflow uses for its **own** GitHub
  operations once it is running. `services/oidc` is the public front for
  `services/ghserver`'s keyless workflow-identity exchange (GitHub Actions
  OIDC), not for per-user linking. That concerns what a workflow does after it
  starts, not who triggers it, and is a separate future decision. This spec
  removes `services/ghserver` from the **dispatch** path but does not decide
  `services/ghserver`'s fate, and does not touch `services/oidc`. The per-user
  linking front in scope here is `services/oauth` (see Proposal), not
  `services/oidc`.
- **The discussion-reply and reaction credentials** (the App installation token
  used for replies, minted via `services/ghserver`), which are outside the
  dispatch path. `services/ghserver` therefore stays a **required** service for
  this reply/reaction path — it is not deprecated wholesale by this spec.
- Self-hosted dispatch behaviour, which already uses the per-user token and is
  not changed.

## Success criteria

| #   | Claim                                                                                                                    | Verified by                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A `workflow_dispatch` runs under the dispatching user's GitHub identity in both single-tenant and multi-tenant modes.    | Integration / manual check (no in-repo unit hook): a dispatch in each mode produces a workflow run whose actor is the linked dispatching user, not the server App. The observed run actor (the linked user login) is recorded on the implementing PR for each mode. |
| 2   | The bridges contain no `tenancy_mode` branch that selects the **dispatch credential**.                                   | Inspection of `services/msbridge` and `services/ghbridge` shows a single dispatch-credential path with no mode-conditional credential selection (the `tenancy_mode` branch may still appear for tenant → repo resolution and the reply-token path).                 |
| 3   | The multi-tenant pending-dispatch proof is keyed by the resolved tenant id, not the hard-coded single tenant.            | `services/ghuser` tests (`identity-verification.test.js`) show `PutPendingDispatch` / `VerifyPendingDispatch` proof scoped to the resolved tenant id, replacing `SINGLE_TENANT_ID`.                                                                                 |
| 4   | A dispatch by an unlinked or expired-link user fires no `workflow_dispatch` and returns the existing link/reauth prompt. | The bridge `dispatch-auth` tests (`services/ghbridge/test/dispatch-auth.test.js`) show the `link_required` / `reauth_required` path fires no `workflow_dispatch` and returns the existing link prompt to the user.                                                  |
| 5   | A linked-but-unauthorized-on-repo user has the `workflow_dispatch` refused by GitHub.                                    | Integration / manual check: a dispatch by a linked user lacking access to the resolved repo is rejected by GitHub (403) at dispatch time; there is no bridge-side access check.                                                                                     |
| 6   | `services/ghuser` is required in both deployment models.                                                                 | The self-hosted and hosted deployment documentation and configuration both list `services/ghuser` as a required service.                                                                                                                                            |
| 7   | Self-hosted dispatch behaviour is unchanged.                                                                             | The existing bridge `dispatch-auth` tests (single-tenant dispatch + link-prompt behaviour) pass unmodified.                                                                                                                                                         |
| 8   | Multi-tenant tenant → repository resolution is unchanged.                                                                | The existing `resolveByRepo` resolution tests (libbridge/tenancy resolver tests, e.g. `tenant-resolver.test.js`) pass unmodified.                                                                                                                                   |
