# Spec 1270 — Public hosting for the Kata Agent Team

## Persona and job

Hired by the **Teams Using Agents** user group named in
[CLAUDE.md § Primary Products](../../CLAUDE.md#primary-products), serving
the **Little Hire** of their *Run a Continuously Improving Agent Team*
job in [JTBD.md](../../JTBD.md): _"Help me onboard a Kata installation
that runs the Plan-Do-Study-Act loop without per-team prompt
engineering."_ This spec attacks the setup floor that today gates that
onboarding — without removing the self-hosted path for teams that need
the strongest privacy posture.

## Problem

Every team that adopts the Kata Agent Team today must operate four
infrastructure components and replicate one master credential across
every consuming repository before the first agent reply lands.

### Infrastructure the adopter runs

| Component | What the adopter must do today |
|---|---|
| Kata Agent Team GitHub App | Register their own App in GitHub, generate and rotate a private key, set the webhook URL to point at their tunnel. |
| `services/ghbridge` | Run the bridge process locally, expose it over a public tunnel whose hostname is reassigned on every tunnel restart, configure `SERVICE_GHBRIDGE_APP_PRIVATE_KEY` and `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET`. |
| Kata Agent Team Teams bot | Register a single-tenant Azure AD app and a Bot Framework resource in Azure, package and sideload a manifest pointing at their tunnel. |
| `services/msbridge` | Run the bridge, expose it over a tunnel, hold `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` / `MICROSOFT_APP_TENANT_ID`. |

### The master credential the adopter holds in every repository

Every kata workflow that authenticates as the GitHub App today reads
`KATA_APP_PRIVATE_KEY` from the consuming repository's Actions secrets.
The set covers `kata-shift.yml`, `kata-storyboard.yml`,
`kata-dispatch.yml`, `kata-coaching.yml`, and `kata-interview.yml`. The
webhook bridges themselves never see this secret; it lives in the
customer's CI environment.

### Consequences

1. **The setup floor blocks evaluation.** A team that wants to try Kata
   must complete two cloud-platform registrations, two public-tunnel
   deployments, multiple long-lived credentials (see § Infrastructure
   the adopter runs above), and two running services before the first
   message. Teams without infrastructure experience cannot evaluate.

2. **Every adopter holds the same shape of secret.** GitHub App private
   keys, Azure AD client secrets, and webhook secrets are replicated
   across every installation with no organizational benefit — every
   adopter carries the custody burden alone.

3. **There is no hosted offering to compare against.** The open-source
   distribution today means "self-host or do not use it." Adopters
   cannot choose convenience over custody, and Forward Impact cannot
   demonstrate the system on its own infrastructure to prospective
   users.

4. **The customer-secret App-identity model is incompatible with a
   public App.** A public, multi-installation App's private key is the
   master credential for every installation. The current model
   replicates that credential into every customer repository's Actions
   secrets, where every kata workflow reads it on every run. No
   custody arrangement at the operator layer can resolve this — a
   hosted offering needs an identity model in which the App private
   key never lives in any customer repository.

The Teams bot is single-tenant by construction today: the running
`services/msbridge` is configured with a single `MICROSOFT_APP_TENANT_ID`
and rejects inbound Bot Framework activities that do not originate from
that one tenant id. This constraint shipped with
[spec 1200](../1200-teams-agent-bridge/spec.md) and has not been
revisited since.

Two scope boundaries that this Problem section deliberately does not
attack are listed in § Excluded.

## Proposal

Offer two deployment paths in parallel — a Forward Impact-operated
hosted control plane plus a hosted workflow-identity capability, and
the existing self-hosted code path.

### 1. Hosted control plane

Forward Impact operates a single hosted control plane comprising the
bridges and their supporting registry:

- One Kata Agent Team GitHub App registration, public on GitHub,
  installable to any organization or repository.
- One multi-tenant Azure AD app and Bot Framework registration,
  addable to any Microsoft Entra tenant from the Teams app catalog.
- Multi-tenant variants of `services/ghbridge` and `services/msbridge`
  that route between incoming channel events and each tenant's GitHub
  repository.
- A tenant registry mapping each channel's tenant key to the customer's
  configured target repository.
- Per-tenant isolation in storage, signature verification, and outbound
  workflow dispatch.

### 2. Keyless workflow identity

The hosted offering replaces the customer-secret App-identity model
with a property: the App private key never leaves Forward Impact's
control plane, and every kata workflow running on the hosted path
obtains short-lived, **repo-scoped GitHub App credentials** at run
time (distinct from the per-invocation callback token model
inherited from spec 1230, which is a separate primitive flowing in
the opposite direction). The hosted path never requires any
long-lived credential on the customer side.

- Covers `kata-shift.yml`, `kata-storyboard.yml`, `kata-dispatch.yml`,
  `kata-coaching.yml`, and `kata-interview.yml` — the kata workflows
  that authenticate as the hosted App today. Future kata workflows that
  need this identity opt in via this same path through future specs.
- Token lifetime does not bound run lifetime: a multi-hour agent run
  succeeds end-to-end on the hosted path without operator intervention.

The mechanism, transport, packaging, and authentication shape used to
deliver this property are design concerns.

### 3. Self-hosted path (preserved)

A team that needs the strongest privacy posture continues to register
their own GitHub App, their own Azure AD app, and runs
`services/ghbridge` and `services/msbridge` as they do today, with
`KATA_APP_PRIVATE_KEY` in their own Actions secrets. The `kata-setup`
skill produces a self-hosted deployment when the operator does not
opt into the hosted path.

### 4. Anthropic key never leaves the customer

Every kata workflow continues to run in the customer's GitHub Actions
runner against the customer's `ANTHROPIC_API_KEY` repository secret.
The control plane has no Anthropic SDK dependency, no Anthropic
environment variables, and no code path that handles an Anthropic
credential.

### 5. Published trust model

A `TRUST.md` document at the repository root enumerates six aspects of
the hosted operator surface, with a per-aspect hosted-vs-self-hosted
comparison column for each:

1. Secrets the hosted operator holds.
2. Message content the hosted operator sees.
3. Workflow runs the hosted operator can observe.
4. The BYOK Anthropic boundary (the customer's `ANTHROPIC_API_KEY`,
   prompts, and Anthropic responses never reach the control plane).
5. What the hosted workflow-identity capability can mint and on whose
   behalf.
6. Surfaces the hosted operator cannot reach.

`TRUST.md` is linked from `.claude/skills/kata-setup/SKILL.md`, the
ghbridge README, and the msbridge README.

## Scope

### In scope

Build deliverables — engineering work that produces code or docs in
this repository:

- Multi-tenancy in the shared bridge primitives currently in
  `libraries/libbridge` (whether the multi-tenancy code lives in
  libbridge or in a new library is a design concern).
- Multi-tenant capability in `services/ghbridge` and `services/msbridge`.
  Single-tenant operation remains the default for self-hosted
  operators; the shape of the toggle (build flag, mode flag, separate
  binary, separate deployment) is a design concern.
- A tenant registry that owns the mapping from each channel's tenant
  key to the customer's GitHub repository, plus whatever per-tenant
  state the bridges need to reject callbacks addressed to the wrong
  tenant. Whether the registry is packaged as a service, a library,
  or a table inside another service, and the form of the per-tenant
  state that backs cross-tenant rejection, are design concerns.
- A workflow-identity capability that issues short-lived, repo-scoped
  credentials to (a) every kata workflow named in § Proposal 2 and
  (b) the hosted bridges, without any customer-side long-lived
  credential. The capability is the single logical custody point for
  the hosted App's signing material — even when realized as a custody
  backend sitting behind a separate stateless protocol front; the
  substrate that physically stores that material (filesystem, KMS, HSM)
  is deferred — see § Deferred. Mechanism, transport, packaging, and
  authentication shape are design concerns.
- Updated workflow templates emitted by `kata-setup` for the hosted
  path, covering every kata workflow named in § Proposal 2, with no
  `KATA_APP_PRIVATE_KEY` secret reference in any kata workflow file
  and no input on any action the workflow calls that carries
  App-private-key material.
- Automated tenant onboarding: each channel platform's installation /
  consent signal reaches the registry without operator intervention.
  Specific channel events consumed and the hosted App's webhook
  subscription set are design concerns.
- A `TRUST.md` document at the repository root.

### Excluded

Permanent non-goals — architectural constraints, not deferred work:

- Hosting any kata workflow itself. Execution of every kata workflow
  named in § Proposal 2 (and any future kata workflow) stays on the
  customer's GitHub Actions runner.
- Proxying or holding the customer's Anthropic API key. BYOK is a
  constraint.
- New channel bridges. The two existing bridge services
  (`services/ghbridge`, `services/msbridge`) are the full set; this
  spec does not introduce a third channel. Multi-tenancy work on the
  two existing bridges is in scope, see § In scope.
- Federated or community-operated control planes. The hosted control
  plane is operated by Forward Impact only; self-hosted users do not
  run it.
- The Forward Impact monorepo's own use of `KATA_APP_PRIVATE_KEY` in
  its CI for release, publishing, and website workflows. That is
  Forward Impact's own master credential for its own publishing
  pipeline, not a secret an adopter ever holds. The hosted-path
  identity model in this spec applies to kata workflows running in
  **a consuming repository**.
- The bridge-side dispatch identity provided by `services/ghauth`
  (per-user GitHub OAuth tokens used to fire `workflow_dispatch`,
  distinct from the App installation token used for replies and
  reactions). `services/ghauth`'s domain is unaffected by this spec,
  which addresses only the **customer-repository** side of the App
  identity surface.

### Deferred

Out of scope here but tractable as follow-on work:

- Confidential computing, hardware enclaves, customer-managed
  encryption keys for at-rest storage, or attestation.
- Substrate hardening for custody of the hosted App's signing
  material (KMS, HSM, secret-manager integration) and the rotation
  procedure. The initial delivery establishes the workflow-identity
  capability as the single logical custody point; the substrate that
  physically backs that custody point is a design concern, and
  production hardening of that substrate is a follow-on.
- Migration tooling between self-hosted and hosted deployments. A team
  selects one path at setup time; switching later is a future concern.
- Billing, quota, account management, or any commercial layer over
  the hosted control plane.

### Inherited from prior specs

**Contracts reused unchanged.**

- The `workflow_dispatch` input shape for `kata-dispatch.yml`:
  `prompt`, `callback_url`, and `correlation_id` (established by
  [spec 1200](../1200-teams-agent-bridge/spec.md)), plus
  `discussion_id` and `resume_context` (layered on by
  [spec 1230](../1230-threaded-discussion-bridges/spec.md)).
- The bridge-bound callback **payload schema** (the
  `correlation_id` / `verdict` / `summary` / `run_url` base from
  [spec 1200](../1200-teams-agent-bridge/spec.md) plus the `replies[]`
  array layered on by
  [spec 1230](../1230-threaded-discussion-bridges/spec.md)).
- The **per-invocation callback-token-in-URL primitive** introduced by
  [spec 1200](../1200-teams-agent-bridge/spec.md) (the dispatch
  inserts a per-call token into `callback_url`) together with the
  **single-use register/consume token registry** that
  [spec 1230](../1230-threaded-discussion-bridges/spec.md)'s
  implementation formalised (the bridge registers the token before
  dispatch and consumes it on the inbound callback). This spec
  extends that combined model with per-tenant scoping — it does not
  replace either piece.

**Exclusions explicitly lifted.**

- [Spec 1200](../1200-teams-agent-bridge/spec.md) listed both
  *multi-tenant Teams support* and *organizational bot publishing*
  as Excluded. The running `services/msbridge` is wired single-tenant
  under those exclusions. This spec lifts both — see § Operator
  commitments (a multi-tenant Azure AD app and a Bot Framework
  resource published to the Teams app catalog so any consenting Entra
  tenant can install it).

**What this spec adds on top of the inherited contracts (called out so
the inheritance above is not misread as covering everything).**

- **Per-tenant scoping of callback verification.** The 1230 model
  already authenticates callbacks via the single-use token in the
  URL. This spec adds tenant-scoping on top so that a token-bearing
  callback addressed to tenant B cannot mutate state, post replies,
  or otherwise act on tenant A's resources — even before the token
  itself is evaluated. The token model is reused; the new property is
  cross-tenant rejection.
- **A new customer-side step that obtains GitHub App credentials at
  run time without a long-lived secret.** Today's kata workflows
  derive an installation token from `KATA_APP_PRIVATE_KEY` in repo
  secrets — directly via `actions/create-github-app-token`
  (kata-dispatch.yml, kata-interview.yml) or indirectly by passing
  `app-private-key` to `forwardimpact/kata-agent@v1` (kata-shift.yml,
  kata-storyboard.yml, kata-coaching.yml). The hosted path replaces
  that step with a call into the workflow-identity capability;
  mechanism is a design concern. This is internal to the customer's
  workflow file and does not alter either of the two inherited
  contracts at the top of this section.

## Operator commitments (out of repo)

Registrations and infrastructure Forward Impact owns outside this
repository — captured here so reviewers know which deliverables produce
no PR:

- A single hosted Kata GitHub App registration, public on GitHub, with
  the same permissions as the self-hosted App.
- A multi-tenant Azure AD app registration and Bot Framework resource,
  published to the Microsoft Teams app catalog so any consenting
  Microsoft Entra tenant can install it without a per-customer Azure
  AD app registration. Tenants are isolated from each other.
- A custody arrangement for the hosted App's private key that keeps it
  inside the control plane and accessible only to the workflow-identity
  capability. The specific custody substrate (filesystem, KMS, HSM) is
  deferred — see § Deferred.

## Success criteria

| Claim | Verifies via |
|---|---|
| A team can install the hosted Kata GitHub App on a repository without registering their own GitHub App. | The Forward Impact-owned Kata Agent Team App is publicly installable on GitHub; a hosted-path adopter completes onboarding without creating any GitHub App registration in their own organization or user account. |
| A team can add the hosted Teams bot to a Microsoft tenant without registering their own Azure AD app. | The Teams app catalog entry for the hosted bot resolves to the Forward Impact-owned Azure AD app id; a hosted-path adopter completes Teams onboarding without creating any Azure AD app registration in their own Entra tenant. |
| No GitHub App private key is required in a hosted-path consuming repository. | The hosted-path setup flow does not ask the adopter to set `KATA_APP_PRIVATE_KEY` or any equivalent renaming; a hosted-path consuming repository's Actions-secrets listing contains no `KATA_APP_PRIVATE_KEY` entry. (Public identifiers like the App id are not credentials and are not constrained by this criterion. Microsoft App credentials are scoped to the hosted Teams operator, never to a consuming repository — see the hosted Teams onboarding criterion below.) |
| The hosted App's signing material does not appear, by reference or by value, in customer workflow files or templates. | No hosted-path workflow template emitted by `kata-setup` carries the hosted App's private key by any path: no template references the secret by any name, and no template passes a private-key-bearing input (under any input name) to any action it invokes. The criterion holds against any renaming of the secret. |
| Long-running kata workflows are not bounded by a single credential lifetime. | A `kata-dispatch.yml` run on the hosted path lasting at least 90 minutes — exceeding the 60-minute GitHub App installation-token cap, so the run necessarily crosses at least one credential boundary — completes end-to-end without operator intervention. |
| The hosted control plane does not read the customer's Anthropic API key. | For every directory listed in § In scope as part of the hosted control plane (the bridges, the tenant registry, the workflow-identity capability — both its credential-custody backend and any stateless protocol front it sits behind — and the multi-tenancy code in `libraries/libbridge`), plus any sibling control-plane directory the design names: no `package.json` declares any `@anthropic-ai/*` package as a runtime dependency; no source file imports a module under `@anthropic-ai/*`; no source file reads an environment variable whose name matches `ANTHROPIC_*`. The same patterns pass against the hosted-path workflow templates emitted by `kata-setup` so the BYOK boundary is end-to-end. |
| Per-tenant state isolation across the hosted control plane. | On any control-plane surface that returns persisted state to a caller authenticated as tenant A — for both per-id reads and any aggregate/list endpoints — the response (HTTP status code plus body) carries no field, count, or other content derived from a record persisted on behalf of tenant B. The criterion is bounded to the wire-visible response (status + body); timing-side-channel indistinguishability is not in scope here. |
| Per-tenant verification of callbacks from workflow runs. | A callback from a workflow run authenticated with material bound to tenant A but addressed to tenant B's resource is rejected: no reply is posted to any tenant B channel, and no state attributed to a tenant B thread changes as a result of the callback. |
| Workflow-identity is scoped to the requesting repository. | An attempt by a customer workflow run on repository X to obtain credentials usable against repository Y is rejected by the workflow-identity capability and no credential for Y is produced. |
| Self-hosted setup still works. | Following the [`kata-setup`](../../.claude/skills/kata-setup/SKILL.md) skill end-to-end against a fresh repository in self-hosted mode produces a deployment that successfully delivers an agent-authored reply to a Discussion thread on the operator's own repository; no step in the skill assumes the hosted control plane. |
| `TRUST.md` is discoverable from operator-facing documentation. | `TRUST.md` exists at the repository root and is linked from `.claude/skills/kata-setup/SKILL.md`, `services/ghbridge/README.md`, and `services/msbridge/README.md`. |
| `TRUST.md` enumerates the trust model for both deployment paths. | `TRUST.md` contains one top-level heading for each of the six aspects listed in § Proposal 5, and each section includes a per-aspect comparison between hosted and self-hosted access. |
| GitHub-side onboarding requires no operator intervention. | A test install of the hosted GitHub App on a fresh repository, followed by a user-authored event of a kind the bridge already supports today on that repository, results in a successful `workflow_dispatch` of `kata-dispatch.yml` on the configured customer repository — with no action taken by the hosted operator between the install and the dispatch. |
| Teams-side onboarding requires no operator intervention. | A test consent of the hosted Teams app in a fresh Microsoft tenant, followed by a user-authored event of a kind the bridge already supports today in that tenant, results in a successful `workflow_dispatch` of `kata-dispatch.yml` on the configured customer repository — with no action taken by the hosted operator between the consent and the dispatch. |
