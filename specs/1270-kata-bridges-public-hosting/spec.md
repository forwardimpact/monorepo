# Spec 1270 — Public hosting for Kata bridges

## Persona and job

Hired by the **Teams Using Agents** user group named in
[CLAUDE.md § Primary Products](../../CLAUDE.md#primary-products) to lower the
setup floor below "register your own GitHub App, register your own Azure AD
app, expose two public tunnels, and run two services" — without removing the
self-hosted path for teams that need the strongest privacy posture.

This persona has no `<job>` entry in [JTBD.md](../../JTBD.md) today; the user
group exists in CLAUDE.md as one of the three primary product audiences but
its jobs have not yet been captured in the JTBD authoritative list.

## Problem

Every team that adopts the Kata Agent Team today must operate four
infrastructure components themselves before the first agent reply lands.

| Component | What the adopter must do today |
|---|---|
| Kata Agent Team GitHub App | Register their own App in GitHub, generate and rotate a private key, set the webhook URL to point at their tunnel, hold `KATA_APP_ID` / `KATA_APP_PRIVATE_KEY` as repository secrets. |
| `services/ghbridge` | Run the bridge process locally, expose it over a public tunnel that re-issues a hostname on every restart, configure `SERVICE_GHBRIDGE_APP_PRIVATE_KEY` and `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET`. |
| Kata Agent Team Teams bot | Register a single-tenant Azure AD app and a Bot Framework resource in Azure, package and sideload a manifest pointing at their tunnel. |
| `services/msbridge` | Run the bridge, expose it over a tunnel, hold `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` / `MICROSOFT_APP_TENANT_ID`. |

This produces three consequences:

1. **The setup floor blocks evaluation.** A team that wants to try Kata must
   complete two cloud-platform registrations, two public-tunnel deployments,
   four long-lived credentials, and two running services before the first
   message. Teams without infrastructure experience cannot evaluate.

2. **Every adopter holds the same shape of secret.** GitHub App private keys,
   Azure AD client secrets, and webhook secrets are replicated across every
   installation with no organizational benefit — every adopter carries the
   custody burden alone.

3. **There is no hosted offering to compare against.** The open-source
   distribution today means "self-host or do not use it." Adopters cannot
   choose convenience over custody, and Forward Impact cannot demonstrate
   the system on its own infrastructure to prospective users.

The Teams bot is single-tenant by construction today — the running
`services/msbridge` requires `MICROSOFT_APP_TENANT_ID` and validates inbound
Bot Framework JWTs against that single value. Spec 1200 introduced this with
"Multi-tenant support or organizational bot publishing" explicitly excluded,
and design 1200-a recorded the choice as "prototype uses a single-tenant dev
registration." Both have shipped and the constraint is unresolved since.

## Proposal

Offer two deployment paths in parallel — a Forward Impact-operated hosted
control plane, and the existing self-hosted code path.

### 1. Hosted control plane

Forward Impact operates a single multi-tenant deployment of the bridges:

- One Kata Agent Team GitHub App registration, public on GitHub, installable
  to any organization or repository.
- One multi-tenant Azure AD app and Bot Framework registration, addable to
  any Microsoft Entra tenant from the Teams app catalog.
- Multi-tenant variants of `services/ghbridge` and `services/msbridge` that
  route between incoming channel events and each tenant's GitHub repository.
- A tenant registry mapping GitHub installation ids and Microsoft tenant ids
  to the customer's configured target repository.
- Per-tenant isolation in storage, signature verification, and outbound
  workflow dispatch.

### 2. Self-hosted path (preserved)

A team that needs the strongest privacy posture continues to register their
own GitHub App, their own Azure AD app, and runs `services/ghbridge` and
`services/msbridge` as they do today. The `kata-setup` skill produces a
self-hosted deployment by default; the hosted path is opt-in.

### 3. Anthropic key never leaves the customer

The kata-dispatch workflow continues to run in the customer's GitHub Actions
runner against the customer's `ANTHROPIC_API_KEY` repository secret. The
control plane process has no Anthropic SDK dependency, no Anthropic
environment variables, and no code path that handles an Anthropic credential.

### 4. Published trust model

A `TRUST.md` document at the repository root enumerates — for both hosted
and self-hosted paths — which secrets the operator holds, which message
content the operator sees, and which surfaces the operator cannot reach.
Linked from `kata-setup`, the ghbridge README, and the msbridge README.

## Scope

### In scope

Build deliverables — engineering work that produces code or docs in this
repository:

- Multi-tenancy capability in `libraries/libbridge` — tenant resolution from
  incoming events, per-tenant credential isolation, and per-tenant storage
  isolation. Names of the libbridge exports that gain tenant-awareness are a
  design concern.
- Multi-tenant modes for `services/ghbridge` and `services/msbridge`. Single-
  tenant remains the default for self-hosted operators.
- A tenant registry that owns the mapping from `(channel, channel tenant
  key)` to the customer's GitHub repository and from each tenant to its
  isolated credential material. Whether the registry is packaged as a
  service, a library, or a table inside another service is a design concern.
- Onboarding handlers that populate the registry without operator
  intervention. The triggers are the GitHub App `installation` event and the
  Bot Framework `installationUpdate` activity.
- Extension of the hosted Kata GitHub App's webhook subscription set to
  include `installation` (today's subscriptions are `discussion` and
  `discussion_comment`, per `services/ghbridge/README.md`).
- A `TRUST.md` document at the repository root.

Operator commitments — registrations and infrastructure Forward Impact owns
outside the repository:

- A single hosted Kata GitHub App registration, public on GitHub, with the
  same permissions as the self-hosted App plus the `installation` event
  subscription above.
- A multi-tenant Azure AD app registration and Bot Framework resource,
  configured so consenting tenants are isolated from each other.

### Excluded

Permanent non-goals — architectural constraints, not deferred work:

- Hosting the kata-dispatch workflow itself. Execution stays on the
  customer's GitHub Actions runner.
- Proxying or holding the customer's Anthropic API key. BYOK is a constraint.
- New channel bridges. The two existing channels in spec 1230
  (`services/ghbridge`, `services/msbridge`) are the full set; this spec
  does not introduce a third.
- Federated or community-operated control planes. The hosted control plane
  is operated by Forward Impact only; self-hosted users do not run it.

Deferred — out of scope here but tractable for follow-on work:

- Confidential computing, hardware enclaves, customer-managed encryption
  keys for at-rest storage, or attestation.
- Migration tooling between self-hosted and hosted deployments. A team
  selects one path at setup time; switching later is a future concern.
- Billing, quota, account management, or any commercial layer over the
  hosted control plane. Coarse-grained per-tenant rate limits for abuse
  prevention are in scope only insofar as they protect availability.

Out of scope by inheritance from prior specs:

- Changes to the kata-dispatch workflow contract (inputs, outputs, callback
  payload). The existing contract from [spec 1230](../1230-threaded-discussion-bridges/spec.md)
  is reused unchanged.

## Success criteria

| Claim | Verifies via |
|---|---|
| A team can install the hosted Kata GitHub App on a repository without registering their own GitHub App. | The customer's GitHub App settings list the Forward Impact-owned App by slug (no per-customer App registration); a first `kata-dispatch.yml` run on the customer's repository completes green with no `KATA_APP_*` secret present in the repository's Actions secrets. |
| A team can add the hosted Teams bot to a Microsoft tenant without registering their own Azure AD app. | The Teams app catalog entry resolves to the Forward Impact-owned Azure AD app id; a first activity from a newly consented tenant dispatches `kata-dispatch.yml` in the configured customer repository. |
| The hosted control plane does not read the customer's Anthropic API key. | `grep -rE 'ANTHROPIC_API_KEY' services/ghbridge services/msbridge libraries/libbridge` and any tenant-registry implementation returns no matches; `grep -rE '@anthropic-ai/sdk\|require.*anthropic' services/ghbridge services/msbridge libraries/libbridge` returns no matches; the `package.json` `dependencies` of `services/ghbridge` and `services/msbridge` contain no `anthropic` entries. |
| Per-tenant state isolation in storage. | A bridge request authenticated for tenant A that targets a storage key belonging to tenant B returns the same response shape as if the key did not exist, with no field in the response containing tenant B's record content. |
| Per-tenant signature verification end-to-end. | A bridge request signed with tenant A's key but addressed (via routing path or payload tenant id) to tenant B's resource returns HTTP 401/403 and does not dispatch a workflow. |
| Self-hosted setup still works. | Following the [`kata-setup`](../../.claude/skills/kata-setup/SKILL.md) skill end-to-end against a fresh repository produces a functional self-hosted deployment; no step in that skill assumes the hosted control plane. |
| `TRUST.md` is discoverable from operator-facing documentation. | `TRUST.md` exists at the repository root and is linked from `.claude/skills/kata-setup/SKILL.md`, `services/ghbridge/README.md`, and `services/msbridge/README.md`. |
| `TRUST.md` enumerates the trust model for both deployment paths. | `TRUST.md` contains a top-level heading for each of: secrets the hosted operator holds; message content the hosted operator sees; the BYOK Anthropic boundary; the differences between hosted and self-hosted access. |
| Onboarding writes a tenant-registry record without operator intervention. | A test install of the hosted GitHub App on a fresh repository, and a test consent of the hosted Teams app in a fresh Microsoft tenant, each produce one new tenant-registry record observable via the registry's read API within 60 seconds — without any operator-side console action or API call. |
