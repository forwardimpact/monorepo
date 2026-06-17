# Trust Model — Hosted Kata Agent Team

This document enumerates the six aspects of the operator surface for the
Forward Impact-hosted Kata Agent Team, with a per-aspect hosted-vs-self-hosted
comparison. The **hosted operator** is Forward Impact, running the
control-plane services described in the public-hosting
[spec](specs/1270-kata-bridges-public-hosting/spec.md#5-published-trust-model)
and [design](specs/1270-kata-bridges-public-hosting/design-a.md).
The **self-hosted operator** is a customer organisation running the same
code from `services/` on infrastructure under its own control.

| Mode | Operator | Control plane | Customer Actions runner |
| --- | --- | --- | --- |
| Hosted | Forward Impact | Hosted | Customer-owned |
| Self-hosted | Customer | Customer-owned | Customer-owned |

The customer's `ANTHROPIC_API_KEY`, prompts, and Anthropic responses
never reach the control plane in either mode.

## Secrets the hosted operator holds

| Asset | Hosted | Self-hosted |
| --- | --- | --- |
| GitHub App private key | Held in the `services/ghserver` process only. Never serialised to disk in any other component, never sent over the wire, never copied into customer repositories. | Held by the customer in `KATA_APP_PRIVATE_KEY` repository or organisation secret. The hosted operator holds nothing. |
| Bot Framework credential | Held in the `services/msbridge` process. Bot Framework's multi-tenant model issues per-tenant JWTs to the bridge; the bridge holds no per-tenant key material. | Held by the customer in their `services/msbridge` configuration. |
| GitHub webhook secret | Held in `services/ghbridge` for inbound webhook signature verification. | Held by the customer in `services/ghbridge`. |
| Customer's `ANTHROPIC_API_KEY` | **Never held.** Read only on the customer's GitHub Actions runner. | Held by the customer; never seen by anyone else. |
| `LINK_COMPLETION_TICKET_SECRET` | Shared HMAC secret across `services/ghuser`, `services/ghbridge`, and `services/msbridge`, declared per service as `SERVICE_GHUSER_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_GHBRIDGE_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET`. All three must hold the same value at any moment. Rotation is **atomic-deploy-all-three**: deploy the new value to all three services in one coordinated release. In-flight completion tickets minted under the old secret will fail verification for the remainder of their TTL (`TICKET_TTL_MS = 5 minutes`). The user-visible failure window is the ticket TTL **plus** the rolling-deploy duration to the last of the three services; operators should plan the rollout to complete within minutes and avoid traffic peaks. Affected users see "Unable to verify completion" and complete the next webhook-initiated flow normally. No data loss; only the auto-resume affordance fails inside the rotation window. Versioned-secret with N+1 verify acceptance was considered and rejected — tracking two live secret versions exceeds the cost of a short failure window during a rare operator action. The secret value must be generated via CSPRNG with ≥32 bytes (256 bits) to match the HMAC-SHA-256 strength — a low-entropy string ("password") gates the entire link-resume affordance on it. **Replay-telemetry note**: any single completion ticket can be re-presented within its 5-minute TTL. After legitimate consumption the pending entry is gone, so subsequent presentations of the same ticket render "Already processed"; after an unattributable refusal the entry stays, but re-presentations of that same ticket cannot drain it (the surface-user-id check fails each time) and the legitimate user can still complete. Repeated "Unable to verify completion" telemetry counted against a single ticket is therefore one attempt being re-presented, not an ongoing attack. | Customer holds and rotates the secret across all three services in the same coordinated way. |
| `BRIDGE_TRUSTED_IDP_ORIGINS` | Comma-separated list of `https://…` origins (`new URL(s).origin` normalised), declared per service as `SERVICE_GHUSER_TRUSTED_IDP_ORIGINS`, `SERVICE_GHBRIDGE_TRUSTED_IDP_ORIGINS`, `SERVICE_MSBRIDGE_TRUSTED_IDP_ORIGINS`. Empty / unset is fatal at startup. Non-`https://` entries are **refused at load** with a logged warning. Malformed entries are skipped with a logged warning. Trailing-dot hosts produce a distinct origin and are **not** matched by the bare host. Example: an authorization URL from `https://github.com.` is rejected when only `https://github.com` is in the set; list both spellings if both are operationally valid (rare). | Customer holds the same per-service config. |

`services/ghserver` is the **single point of GitHub App-key custody**: the key
never leaves the process and all callers — bridges and `services/oidc` alike —
receive only short-lived, repo-scoped installation tokens. See
[design § Workflow identity](specs/1270-kata-bridges-public-hosting/design-a.md#workflow-identity)
and
[spec § Keyless workflow identity](specs/1270-kata-bridges-public-hosting/spec.md#2-keyless-workflow-identity).

## Message content the hosted operator sees

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| GitHub Discussion bodies and replies | Visible to `services/ghbridge` (the bridge that relays the message into the customer's workflow run) and the canonical `services/bridge` store, scoped by `tenant_id`. | Visible only to the customer's own bridge and store. |
| MS Teams activity bodies | Visible to `services/msbridge` and the canonical `services/bridge` store, scoped by `tenant_id`. | Visible only to the customer's own bridge and store. |
| Prompts sent to Anthropic | **Never visible.** Constructed and sent on the customer's runner. | Never visible to anyone outside the customer's runner. |
| Anthropic responses | **Never visible.** Returned to the customer's runner. | Never visible to anyone outside the customer's runner. |
| Workflow callback bodies | Visible to the bridge that relays the reply, scoped by `tenant_id` and authenticated by the inherited single-use callback token bound to `(correlation_id, tenant_id)`. | Visible only to the customer's own bridge. |

Per-tenant isolation lives inside `services/bridge`: every record is
scoped by the resolved `tenant_id` and cross-record lookup RPCs filter
by tenant, so no list or aggregate response crosses tenants. See
[design § Tenancy abstraction](specs/1270-kata-bridges-public-hosting/design-a.md#tenancy-abstraction).

## Workflow runs the hosted operator can observe

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| Workflow dispatch metadata | Visible: `services/ghbridge` issues `workflow_dispatch` under the dispatching user's per-user OAuth token (`services/ghuser`) in both modes, so the target repo and the dispatch inputs are part of the request the bridge constructs. | Visible to the customer; same shape. |
| Workflow run logs | **Not visible.** Logs are written to the customer's GitHub Actions log stream. The hosted operator holds no installation-token scope that grants log read and does not poll the GitHub Actions API for runs. | Visible to the customer. |
| Workflow exit status | Visible only to the extent the workflow callback carries it. The hosted operator does not poll for run completion. | Visible to the customer; same shape. |
| Mid-run mint requests | Visible at `services/oidc` (OIDC claims) and `services/ghserver` (mint requests) for audit — the OIDC `repository` claim and the requesting tenant are observable. The minted token itself is not part of the audit surface the design describes. | The customer's `services/ghserver` deployment carries the same audit surface. |

`services/ghserver` enforces per-tenant rate ceilings and rejects mints
for repositories that do not appear on an `active` tenant row. See
[design § Workflow identity](specs/1270-kata-bridges-public-hosting/design-a.md#workflow-identity)
and
[design § Tenant registry](specs/1270-kata-bridges-public-hosting/design-a.md#tenant-registry).

## The BYOK Anthropic boundary

The customer's `ANTHROPIC_API_KEY`, prompts, and Anthropic responses
never reach the control plane.

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` storage | Customer's GitHub Actions secret. The hosted control plane has no provision to read, proxy, or substitute it. | Customer's GitHub Actions secret; same shape. |
| Prompt construction | On the customer's runner, by the agent process. | On the customer's runner. |
| Anthropic request transit | Customer's runner → Anthropic's API endpoint. Does **not** transit the control plane. | Customer's runner → Anthropic's API endpoint. |
| Anthropic response | Returned to the customer's runner. Does **not** transit the control plane. | Returned to the customer's runner. |
| Agent tool calls and repository writes | Execute on the customer's runner under the in-workflow installation token minted via OIDC. | Execute on the customer's runner under the customer's App key. |

The Anthropic key, the prompt, and the response stay on the customer's
runner in both deployment modes. See
[design § Key decisions — Anthropic key path](specs/1270-kata-bridges-public-hosting/design-a.md#key-decisions)
and
[spec § Anthropic key never leaves the customer](specs/1270-kata-bridges-public-hosting/spec.md#4-anthropic-key-never-leaves-the-customer).

## What the hosted workflow-identity capability can mint and on whose behalf

| Property | Hosted | Self-hosted |
| --- | --- | --- |
| Mint mechanism | `services/oidc` validates the workflow's GitHub Actions OIDC token (issuer, audience, JWKS), extracts the `repository` claim, and calls `services/ghserver` over gRPC. `services/oidc` holds **no** key material. | Workflows use `KATA_APP_PRIVATE_KEY` directly; `services/oidc` and `services/ghserver` are not started. |
| Token scope | The **single repository** named in the OIDC claim, and only when that repository appears on an `active` tenant row in `services/tenancy`. | Whatever scope the customer's App key grants — typically the customer's own organisation. |
| Token TTL | GitHub's installation-token maximum (≤1h). Long runs re-mint via the same OIDC step. | Same. |
| Authorised callers | Two: the customer's kata workflows (via OIDC) and the hosted bridges (peer-authenticated inside the control plane). No other process reaches `services/ghserver`. | The customer's own bridges and workflows. |
| Refusal modes | Tenant not `active`; per-tenant rate ceiling exceeded; OIDC claim does not name a tenant-owned repository. | N/A — the customer trusts itself. |

The hosted operator can mint a token that acts on a customer repository
**only** when (a) that repository has an `active` tenant row established
by the customer's GitHub App install or Teams consent, and (b) the
requesting caller either presents a valid OIDC token claiming that
repository or is a peer-authenticated control-plane component. See
[design § Workflow identity](specs/1270-kata-bridges-public-hosting/design-a.md#workflow-identity)
and
[spec § Keyless workflow identity](specs/1270-kata-bridges-public-hosting/spec.md#2-keyless-workflow-identity).

## Surfaces the hosted operator cannot reach

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| Customer's Anthropic key, prompts, responses | Out of reach by construction — see § The BYOK Anthropic boundary. | Out of reach. |
| Customer's GitHub Actions log stream | Out of reach — no installation-token scope grants it and the operator does not poll the GitHub Actions API. | Available to the customer. |
| Customer repositories outside the tenant's `repo` row | Out of reach — `services/ghserver` mints only against the OIDC-asserted `repository`, matched against the `active` tenant row; per-repo scope is enforced at mint time. | Bounded by the customer's own App permissions. |
| `services/bridge` records of other tenants | Out of reach — `tenant_id` scoping is enforced at the store and cross-record RPCs filter by tenant. | N/A — the customer's deployment is single-tenant. |
| Customer secrets other than those the App is granted | Out of reach — the App is a public registration scoped to the customer's selection of repositories. | Bounded by the customer's secret grants. |

The architectural property the spec calls out as disqualifying — placing
the master GitHub App private key in every customer's Actions secrets —
is structurally absent: every workflow-identity request is brokered
through `services/oidc` → `services/ghserver` and produces a short-lived,
repo-scoped token, never the App key. See
[spec § Consequences](specs/1270-kata-bridges-public-hosting/spec.md#consequences)
and
[design § Key decisions](specs/1270-kata-bridges-public-hosting/design-a.md#key-decisions).
