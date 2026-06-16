# Spec 1272 — Hosted control-plane hardening

## Problem

Spec 1270 shipped the hosted, multi-tenant control plane (`services/ghserver`,
`services/oidc`, `services/tenancy`, and multi-tenant modes in
`services/ghbridge`/`services/msbridge`/`services/bridge`). It deliberately
deferred several production-readiness concerns, recorded in
[design 1270 § What this design does not cover](../1270-kata-bridges-public-hosting/design-a.md#what-this-design-does-not-cover)
and in the shipped service READMEs. The single-tenant / self-hosted path is
complete; the **hosted** path carries documented gaps that keep it from being
safely operated in production and block a clean Teams onboarding.

Evidence — each gap is already documented in the codebase:

- `services/ghserver/README.md` § "Credential custody and the deferred
  substrate" — the App private key resolves from a plaintext
  `SERVICE_GHSERVER_PRIVATE_KEY` env var, and the gRPC mint surface is
  unauthenticated at the peer level, relying only on a bind-address guard and
  network isolation.
- `services/msbridge/README.md` — `POST /onboard` is **default-deny** (every
  request returns 401) in production because no caller-identity verifier is
  injected; hosted Teams onboarding cannot complete.
- `services/ghbridge/README.md` § "Deferred: `installation.repositories_removed`
  revoke" — an uninstalling customer's tenant rows stay `active`; there is no
  revoke path.
- `services/ghbridge/README.md` and `services/msbridge/README.md` § "Documented
  limitation: multi-tenant elapsed-recess re-arm on restart" — a hosted bridge
  that restarts while a time-based (`elapsed`-trigger) recess is pending does
  not re-arm it on a timer; it re-arms only lazily on the next inbound activity.
- Part 06 hosted workflow templates pass an `installation-token` input to a
  sibling composite action that the published `forwardimpact/kata-action-agent`
  and `kata-action-eval` actions do not yet accept; the hosted templates cannot
  run end-to-end until the siblings ship that input.

## Persona and job

Primarily serves **Teams Using Agents** —
[run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)
— specifically teams adopting the Forward Impact-hosted control plane. Two of
the gaps are directly adopter-facing: a hosted team cannot complete Teams
onboarding (item 3) and cannot run the hosted workflows end-to-end (item 6).

The remaining gaps (items 1, 2, 4, 5) are **operator-facing hardening** — work
the internal team that runs the hosted plane needs so the offering is
credential-secure and lifecycle-correct. They serve the adopter indirectly: a
hosted team can only trust the offering if the operator can run it safely.
There is no separate JTBD persona for the operator; this is internal-contributor
work in service of the Teams-Using-Agents job.

## Scope

Close the deferred hosted-path gaps. Each item names the affected service and
the behaviour (the WHAT) that is missing today; mechanisms are left to design.

| # | Gap | Service / entity | Missing behaviour | Audience |
|---|---|---|---|---|
| 1 | gRPC peer authentication | `services/ghserver` mint surface; callers `services/oidc`, hosted `ghbridge`/`msbridge` | The mint RPC authenticates its caller as an in-control-plane peer; an unauthenticated process on the same network cannot mint. Replaces today's reliance on the bind guard + network isolation. | operator |
| 2 | Protected App-key custody | `services/ghserver` | The hosted GitHub App private key is not resident in plaintext config or process configuration, and can be rotated without redeploying signing material. | operator |
| 3 | Authenticated Teams onboarding | `services/msbridge` `/onboard` | The endpoint trusts the asserted tenant identity only when the caller cryptographically proves it; an absent or forged assertion is rejected; a proven valid caller is no longer default-denied in production. | adopter |
| 4 | Tenant revoke on uninstall | `services/ghbridge`, `services/tenancy` | `installation.repositories_removed` and full-uninstall events transition the affected tenant rows `active → revoked`, and any pending recess or queued callback for a revoked tenant is cancelled/refused, so an uninstalled customer can no longer mint, dispatch, or resume. | operator |
| 5 | Multi-tenant recess re-arm on restart | `services/ghbridge`, `services/msbridge`, `services/tenancy` | On restart the hosted bridges re-arm pending `elapsed`-trigger recesses across **all** active tenants, not only the default tenant; a restart does not drop a pending timed recess. Requires the registry to expose cross-tenant enumeration. | operator |
| 6 | Hosted templates run end-to-end | `.claude/skills/kata-setup` hosted templates; sibling repos `forwardimpact/kata-action-agent`, `kata-action-eval` | A hosted run completes using the minted installation token: the sibling actions accept the token, and the monorepo templates pin the minimum sibling versions that do. | adopter |

### Why one spec, and sequencing

All six items close design 1270's deferred hosted-path gaps and gate a
production-ready hosted offering, so they are tracked together. They are
**independently shippable** — the design may split them into parts and land
them in any order. In particular, item 6 is a **cross-repo dependency**: its
monorepo-side work is only the version pin, and it does not gate items 1–5.
Items 1 and 2 are the two `services/ghserver` substrate concerns and may share
one design; the cheap behavioural fixes (3, 4, 5) must not be blocked behind
the heavier substrate work (1, 2) or the cross-repo item (6).

### Out of scope

- **Hosted discovery/install artefacts** (marketplace listing, App icon, Teams
  catalog metadata). A technically-functional onboarding does not require them;
  they remain deferred from design 1270 and are not needed for items 3/6 to work.
- Auto-setting the `FIT_OIDC_URL` repository variable at `kata-setup` time — it
  remains a documented operator prerequisite (a setup reminder, not a missing
  capability).
- Replacement of the `libindex` JSONL store with a managed datastore.
- Migration paths between self-hosted and hosted deployments.
- Custody hardening for the Bot Framework credential held in `services/msbridge`
  (it has no cross-workflow fanout, unlike the GitHub App key in item 2; design
  1270 keeps it separate on that basis).
- Rate-limiting / DoS posture beyond the existing per-tenant ceiling.
- Broadening the BYOK boundary scanner to catch computed-key
  `process.env[var]` reads — a noted Low limitation backstopped by the existing
  import/dependency checks.

## Success criteria

Each criterion is one claim plus how it is verified. Self-hosted is the default
deployment and must not regress (criterion 9).

| # | Criterion | Verified by |
|---|---|---|
| 1 | A `MintInstallationToken` call without valid control-plane peer credentials is rejected. | `services/ghserver` peer-auth test (unauthenticated caller refused) |
| 2 | `services/oidc` and the hosted bridges still mint successfully with valid peer credentials. | `services/ghserver` peer-auth test (authenticated peer succeeds) |
| 3 | `services/ghserver` holds no plaintext App private key in its merged config and can sign after a key rotation without a code change. | `services/ghserver` custody test (no plaintext-key path; sign-after-rotate); `scripts/check-byok-boundary.mjs` still green |
| 4 | A `services/ghserver/README.md` operator section documents the rotation procedure. | `services/ghserver/README.md` rotation section present |
| 5 | An `/onboard` request whose tenant identity is cryptographically proven transitions that tenant to `active` and maps its repo; an absent or forged proof returns 401. | `services/msbridge/test` onboard suite (proven happy path → active + repo set; forged/absent proof → 401) |
| 6 | After `installation.repositories_removed` or a full uninstall, the affected tenant rows are `revoked`, and a subsequent mint/dispatch/resume for those repos is refused. | `services/ghbridge/test` revoke suite + `services/tenancy` state-transition assertions |
| 7 | A hosted (multi-tenant) bridge restart re-arms every active tenant's pending `elapsed` recess; none are dropped. | `services/ghbridge`/`services/msbridge` multi-tenant rearm test driving restart across multiple tenants |
| 8 | A hosted workflow run completes using the minted installation token, and the `kata-setup` hosted templates reference the pinned minimum sibling versions. | `.claude/skills/kata-setup` hosted-template version pins; sibling-action acceptance of the token verified in the sibling repos (cross-repo, outside this repo's CI) |
| 9 | The self-hosted / single-tenant path is unchanged by every item above. | full `bun run test` green; existing single-tenant bridge, onboarding, and recess-rearm tests pass unmodified |

## Risks and notes

- **Item 8 is cross-repo and not gated by this repo's CI.** The
  token-acceptance change ships through the siblings' own release procedure; the
  only monorepo-verifiable outcome is the version pin (criterion 8, first
  clause). The hosted templates already emit the `installation-token` input, so
  no template rewrite is required — completion reduces to pinning once the
  siblings ship.
- **Items 1 and 2 are both `services/ghserver` substrate concerns** and may be
  addressed by one design; the spec states them as distinct outcomes (criteria
  1–4) so each is independently verifiable, and they must not block the cheaper
  behavioural fixes (criteria 5–7).
- **Item 5 implies a new registry read path.** Cross-tenant recess re-arm needs
  `services/tenancy` to enumerate active tenants (or the bridges to enumerate
  open recesses across tenants); the registry exposes no such query today.
- **Revoke and resume interact (items 4 and 5).** Revoke must also dispose of a
  tenant's in-flight recesses and queued callbacks, not only flip the row state;
  criterion 6 covers the "no longer resume" property explicitly.

## Field findings (post-approval)

- **2026-06-16 — multi-tenant Azure Bot resources are deprecated.** Manual e2e
  testing hit a hard wall: Microsoft no longer permits creating a multi-tenant
  Azure Bot resource, in the portal **or** the CLI
  (`az bot create --app-type MultiTenant` → `InvalidBotCreationData: Multitenant
  bot creation is deprecated. Please use SingleTenant or UserAssignedMSI`).
  Existing multi-tenant bots are grandfathered; multi-tenant Entra **app**
  registrations are still allowed — only the Bot *resource* type is gone. This
  invalidates the spec 1270 operator commitment of "a multi-tenant Azure AD app
  and Bot Framework resource… installable by any consenting Entra tenant"; the
  hosted Teams path as designed cannot be stood up fresh. The supported
  replacement (researched 2026-06-16) is a **single-tenant Azure Bot resource +
  multi-tenant Entra app (`signInAudience = AzureADMultipleOrgs`) + Teams Store /
  AppSource distribution** — one shared app reaches every tenant, not a
  per-customer bot and not Graph change-notifications. Relatedly the **Bot
  Framework SDK is end-of-life** (support ends 2025-12-31); the conversational
  bot evolves into a Teams **custom engine agent** on the **Microsoft 365 Agents
  SDK**. This transport re-architecture is a new spec, not a tweak here. The
  `services/tenancy` mapping and the Move B `/onboard` repo-mapping verifier are
  transport-agnostic and survive.
