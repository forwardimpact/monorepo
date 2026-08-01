# Trust Model — Hosted Kata Agent Team

This document lists the six aspects of the operator surface for the
Forward Impact-hosted Kata Agent Team. It compares the hosted mode and the
self-hosted mode for each aspect. The **hosted operator** is Forward Impact.
Forward Impact runs the control-plane services described in the
public-hosting
[spec](specs/1270-kata-bridges-public-hosting/spec.md#5-published-trust-model)
and [design](specs/1270-kata-bridges-public-hosting/design-a.md).
The **self-hosted operator** is a customer organisation. That organisation
runs the same code from `services/` on infrastructure under its own control.

| Mode | Operator | Control plane | Customer Actions runner |
| --- | --- | --- | --- |
| Hosted | Forward Impact | Hosted | Customer-owned |
| Self-hosted | Customer | Customer-owned | Customer-owned |

The customer's `ANTHROPIC_API_KEY`, prompts, and Anthropic responses
never reach the control plane in either mode.

## Secrets the hosted operator holds

| Asset | Hosted | Self-hosted |
| --- | --- | --- |
| GitHub App private key | Only the `services/ghserver` process holds the key. No other component serialises the key to disk. No component sends it over the wire. No component copies it into customer repositories. | The customer holds the key in a `KATA_APP_PRIVATE_KEY` repository secret or organisation secret. The hosted operator holds nothing. |
| Bot Framework credential | The `services/msbridge` process holds the credential. Bot Framework's multi-tenant model issues per-tenant JWTs to the bridge. The bridge holds no per-tenant key material. | The customer holds it in their `services/msbridge` configuration. |
| GitHub webhook secret | `services/ghbridge` holds the secret. It uses the secret to verify the signature of an inbound webhook. | The customer holds it in `services/ghbridge`. |
| Customer's `ANTHROPIC_API_KEY` | **Never held.** Only the customer's GitHub Actions runner reads it. | The customer holds it. Nobody else sees it. |
| `LINK_COMPLETION_TICKET_SECRET` | `services/ghuser`, `services/ghbridge`, and `services/msbridge` share this HMAC secret. Each service declares it under its own name: `SERVICE_GHUSER_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_GHBRIDGE_LINK_COMPLETION_TICKET_SECRET`, `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET`. All three must hold the same value at any moment. Rotation is **atomic-deploy-all-three**. Deploy the new value to all three services in one coordinated release. An in-flight completion ticket minted under the old secret fails verification for the rest of its TTL (`TICKET_TTL_MS = 5 minutes`). The user-visible failure window is the ticket TTL **plus** the rolling-deploy duration to the last of the three services. Operators should plan the rollout to finish within minutes. They should also avoid traffic peaks. Affected users see "Unable to verify completion". They complete the next webhook-initiated flow normally. The rotation loses no data. Only the auto-resume affordance fails inside the rotation window. The design considered a versioned secret with N+1 verify acceptance and rejected it. The cost to track two live secret versions is higher than the cost of a short failure window during a rare operator action. Generate the secret value with a CSPRNG and at least 32 bytes (256 bits) to match the HMAC-SHA-256 strength. A low-entropy string ("password") gates the entire link-resume affordance on that weak value. **Replay-telemetry note**: anyone can present a single completion ticket again within its 5-minute TTL. After the system consumes a ticket legitimately, the pending entry is gone. Anyone who presents the same ticket again then sees "Already processed". After an unattributable refusal the entry stays. Anyone who presents that same ticket again cannot drain the entry, because the surface-user-id check fails each time. The legitimate user can still complete. Repeated "Unable to verify completion" telemetry counted against a single ticket therefore shows one attempt presented again. It does not show an attack in progress. | The customer holds and rotates the secret across all three services in the same coordinated way. |
| `BRIDGE_TRUSTED_IDP_ORIGINS` | This value is a comma-separated list of `https://…` origins, normalised with `new URL(s).origin`. Each service declares it under its own name: `SERVICE_GHUSER_TRUSTED_IDP_ORIGINS`, `SERVICE_GHBRIDGE_TRUSTED_IDP_ORIGINS`, `SERVICE_MSBRIDGE_TRUSTED_IDP_ORIGINS`. An empty or unset value is fatal at startup. At load, the service **refuses** non-`https://` entries and logs a warning. The service skips malformed entries and logs a warning. A trailing-dot host produces a distinct origin. The bare host does **not** match it. Example: the service rejects an authorization URL from `https://github.com.` when the set holds only `https://github.com`. List both spellings if both are operationally valid (rare). | The customer holds the same per-service config. |

`services/ghserver` is the **single point of GitHub App-key custody**. The
key never leaves the process. All callers, including the bridges and
`services/oidc`, receive only short-lived, repo-scoped installation tokens.
See
[design § Workflow identity](specs/1270-kata-bridges-public-hosting/design-a.md#workflow-identity)
and
[spec § Keyless workflow identity](specs/1270-kata-bridges-public-hosting/spec.md#2-keyless-workflow-identity).

## Message content the hosted operator sees

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| GitHub Discussion bodies and replies | Visible to `services/ghbridge` (the bridge that relays the message into the customer's workflow run) and the canonical `services/bridge` store, scoped by `tenant_id`. | Visible only to the customer's own bridge and store. |
| MS Teams activity bodies | Visible to `services/msbridge` and the canonical `services/bridge` store, scoped by `tenant_id`. | Visible only to the customer's own bridge and store. |
| Prompts sent to Anthropic | **Never visible.** The customer's runner constructs them and sends them. | Never visible to anyone outside the customer's runner. |
| Anthropic responses | **Never visible.** Anthropic returns them to the customer's runner. | Never visible to anyone outside the customer's runner. |
| Workflow callback bodies | Visible to the bridge that relays the reply, scoped by `tenant_id` and authenticated by the inherited single-use callback token bound to `(correlation_id, tenant_id)`. | Visible only to the customer's own bridge. |

Per-tenant isolation lives inside `services/bridge`. The resolved
`tenant_id` scopes every record. Cross-record lookup RPCs filter by tenant.
No list or aggregate response crosses tenants. See
[design § Tenancy abstraction](specs/1270-kata-bridges-public-hosting/design-a.md#tenancy-abstraction).

## Workflow runs the hosted operator can observe

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| Workflow dispatch metadata | Visible. `services/ghbridge` issues `workflow_dispatch` under the per-user OAuth token of the user who dispatches it (`services/ghuser`). This is true in both modes. The target repo and the dispatch inputs are therefore part of the request the bridge constructs. | Visible to the customer. The shape is the same. |
| Workflow run logs | **Not visible.** The logs go to the customer's GitHub Actions log stream. The hosted operator holds no installation-token scope that grants log read. The hosted operator does not poll the GitHub Actions API for runs. | Visible to the customer. |
| Workflow exit status | Visible only to the extent the workflow callback carries it. The hosted operator does not poll for run completion. | Visible to the customer. The shape is the same. |
| Mid-run mint requests | Visible at `services/oidc` (OIDC claims) and `services/ghserver` (mint requests) for audit. The OIDC `repository` claim and the tenant that requests the mint are observable. The minted token itself is not part of the audit surface the design describes. | The customer's `services/ghserver` deployment carries the same audit surface. |

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
| `ANTHROPIC_API_KEY` storage | Customer's GitHub Actions secret. The hosted control plane has no provision to read, proxy, or substitute it. | Customer's GitHub Actions secret. The shape is the same. |
| Prompt construction | The agent process builds the prompt on the customer's runner. | On the customer's runner. |
| Anthropic request transit | Customer's runner → Anthropic's API endpoint. The request does **not** transit the control plane. | Customer's runner → Anthropic's API endpoint. |
| Anthropic response | Anthropic returns it to the customer's runner. The response does **not** transit the control plane. | Anthropic returns it to the customer's runner. |
| Agent tool calls and repository writes | They execute on the customer's runner under the in-workflow installation token minted through OIDC. | They execute on the customer's runner under the customer's App key. |

The Anthropic key, the prompt, and the response stay on the customer's
runner in both deployment modes. See
[design § Key decisions — Anthropic key path](specs/1270-kata-bridges-public-hosting/design-a.md#key-decisions)
and
[spec § Anthropic key never leaves the customer](specs/1270-kata-bridges-public-hosting/spec.md#4-anthropic-key-never-leaves-the-customer).

## What the hosted workflow-identity capability can mint and on whose behalf

| Property | Hosted | Self-hosted |
| --- | --- | --- |
| Mint mechanism | `services/oidc` validates the workflow's GitHub Actions OIDC token (issuer, audience, JWKS), extracts the `repository` claim, and calls `services/ghserver` over gRPC. `services/oidc` holds **no** key material. | Workflows use `KATA_APP_PRIVATE_KEY` directly. The customer does not start `services/oidc` or `services/ghserver`. |
| Token scope | The **single repository** named in the OIDC claim, and only when that repository appears on an `active` tenant row in `services/tenancy`. | Whatever scope the customer's App key grants. This is typically the customer's own organisation. |
| Token TTL | GitHub's installation-token maximum (≤1h). Long runs re-mint through the same OIDC step. | Same. |
| Authorised callers | Two: the customer's kata workflows (through OIDC) and the hosted bridges (peer-authenticated inside the control plane). No other process reaches `services/ghserver`. | The customer's own bridges and workflows. |
| Refusal modes | Tenant not `active`. Per-tenant rate ceiling exceeded. OIDC claim does not name a tenant-owned repository. | N/A. The customer trusts itself. |

The hosted operator can mint a token that acts on a customer repository
**only** when two conditions hold. (a) That repository has an `active`
tenant row. The customer's GitHub App install or Teams consent establishes
that row. (b) The caller presents a valid OIDC token that claims that
repository, or the caller is a peer-authenticated control-plane component.
See
[design § Workflow identity](specs/1270-kata-bridges-public-hosting/design-a.md#workflow-identity)
and
[spec § Keyless workflow identity](specs/1270-kata-bridges-public-hosting/spec.md#2-keyless-workflow-identity).

## Surfaces the hosted operator cannot reach

| Surface | Hosted | Self-hosted |
| --- | --- | --- |
| Customer's Anthropic key, prompts, responses | Out of reach by construction. See § The BYOK Anthropic boundary. | Out of reach. |
| Customer's GitHub Actions log stream | Out of reach. No installation-token scope grants it. The operator does not poll the GitHub Actions API. | Available to the customer. |
| Customer repositories outside the tenant's `repo` row | Out of reach. `services/ghserver` mints only against the OIDC-asserted `repository`, matched against the `active` tenant row. `services/ghserver` enforces per-repo scope at mint time. | Bounded by the customer's own App permissions. |
| `services/bridge` records of other tenants | Out of reach. The store enforces `tenant_id` scoping. Cross-record RPCs filter by tenant. | N/A. The customer's deployment is single-tenant. |
| Customer secrets other than those the App is granted | Out of reach. The App is a public registration, scoped to the repositories the customer selects. | Bounded by the customer's secret grants. |

The spec calls out one architectural property as disqualifying. That
property places the master GitHub App private key in every customer's
Actions secrets. The architecture of this system excludes that property.
`services/oidc` → `services/ghserver` brokers every workflow-identity
request. Each request produces a short-lived, repo-scoped token. No request
produces the App key. See
[spec § Consequences](specs/1270-kata-bridges-public-hosting/spec.md#consequences)
and
[design § Key decisions](specs/1270-kata-bridges-public-hosting/design-a.md#key-decisions).
