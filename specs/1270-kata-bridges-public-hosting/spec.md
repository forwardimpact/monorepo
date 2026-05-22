# Spec 1270 — Public hosting for Kata bridges

## Persona and job

Hired by **Teams Using Agents** to lower the setup floor below "register your
own GitHub App, register your own Azure AD app, expose two public tunnels, and
run two services" — without removing the self-hosted path for teams that need
the strongest privacy posture.

Related JTBD: *Run an autonomous, continuously improving development team that
plans, ships, studies its own traces, and acts on findings.*

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

The Teams bot is explicitly described in [spec 1200](../1200-teams-agent-bridge/spec.md)
as single-tenant ("prototype uses a single-tenant dev registration") — multi-
tenant support is excluded there and unresolved since.

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

- A multi-tenancy capability in `libraries/libbridge` covering tenant
  resolution from incoming events, per-tenant signing keys, and per-tenant
  storage namespacing.
- Multi-tenant modes for `services/ghbridge` and `services/msbridge`.
  Single-tenant remains the default for self-hosted operators.
- A `services/tenancy` service that holds the tenant registry: GitHub
  installation id → customer repository, Microsoft tenant id → customer
  repository, per-tenant signing material.
- Onboarding endpoints — handlers for the GitHub App `installation` event and
  the Bot Framework consent activity — that populate the tenant registry
  without operator intervention.
- A multi-tenant Azure AD app registration and Bot Framework resource owned
  by Forward Impact, configured so consenting tenants do not see each other.
- The hosted Kata GitHub App registration, owned by Forward Impact, with the
  same permissions as the self-hosted App.
- A `TRUST.md` document at the repository root.

### Excluded

- Hosting the kata-dispatch workflow itself. Execution stays on the
  customer's GitHub Actions runner; the control plane never executes the
  agent.
- Proxying or holding the customer's Anthropic API key. BYOK is a hard
  constraint, not a configuration option.
- Confidential computing, hardware enclaves, customer-managed encryption
  keys for at-rest storage, or attestation. These are explicit non-goals
  for the minimum viable shape.
- Migration tooling between self-hosted and hosted deployments. A team
  selects one path at setup time.
- Any billing, quota, rate-limiting beyond abuse prevention, account
  management, or commercial layer.
- New channel bridges beyond GitHub Discussions and Microsoft Teams.
- Federated or community-operated control planes. The hosted control plane
  is operated by Forward Impact only; self-hosted users do not run it.
- Changes to the kata-dispatch workflow contract (inputs, outputs, callback
  payload). The existing contract from [spec 1230](../1230-threaded-discussion-bridges/spec.md)
  is reused unchanged.

## Success criteria

| Claim | Verifies via |
|---|---|
| A team can install the hosted Kata GitHub App on a repository without registering their own GitHub App. | The hosted App's install URL resolves; first `kata-dispatch.yml` run on a freshly onboarded repository succeeds with no `KATA_APP_*` secret present in the customer repository. |
| A team can add the hosted Teams bot to a Microsoft tenant without registering their own Azure AD app. | The Teams app catalog entry installs into a target tenant; first activity from that tenant routes to the customer's configured repository. |
| The hosted control plane never sees the customer's Anthropic API key. | `grep -r 'ANTHROPIC' services/ghbridge services/msbridge services/tenancy libraries/libbridge` returns no credential reads, no SDK imports, and no config schema entries. |
| Per-tenant state isolation in storage. | An automated test that issues a read for tenant B's `DiscussionContext` keys while authenticated as tenant A receives a not-found response and produces no log entry containing tenant B's data. |
| Per-tenant signature verification end-to-end. | An automated test that submits an event signed by tenant A's key but addressed to tenant B's resource is rejected by the bridge with no side effect. |
| Self-hosted setup still works. | `kata-setup` against a fresh repository produces a functional self-hosted deployment via the documented procedure; no skill step requires the hosted control plane. |
| Trust model is published and discoverable. | `TRUST.md` exists at the repository root; `kata-setup/SKILL.md`, `services/ghbridge/README.md`, and `services/msbridge/README.md` link to it. The document enumerates: secrets the hosted operator holds, message content the hosted operator sees, the BYOK Anthropic boundary, and the differences between hosted and self-hosted access. |
| Onboarding completes without operator intervention. | A new GitHub App install and a new Teams tenant consent each populate the tenant registry via the App `installation` event handler and the Bot Framework consent activity handler — no manual record creation. |
