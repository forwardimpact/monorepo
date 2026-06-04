# Azure AD app configuration

How to configure the **Azure AD (Entra) app** — registered as an Azure Bot —
behind `services/msbridge` for each deployment model. This is the Teams
counterpart of
[`services/ghserver` § GitHub server App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md);
the two guides share a structure. See
[TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for the
trust model.

> Teams has **one** app (the Azure Bot). For the GitHub `workflow_dispatch`
> credential it triggers, the self-hosted path reuses the GitHub **user App**
> (`services/ghuser`), exactly as `ghbridge` does — see
> [GitHub user App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md).

## At a glance

| Aspect | Self-hosted (single-tenant) | Hosted (multi-tenant) |
| --- | --- | --- |
| Who registers / owns the app | the adopting team | Forward Impact (one shared app) |
| App scope toggle | "Supported account types" → **Accounts in this organizational directory only**; `MicrosoftAppType` = **SingleTenant** | → **Accounts in any organizational directory**; `MicrosoftAppType` = **MultiTenant** |
| Tenant binding | `MICROSOFT_APP_TENANT_ID` set | `MICROSOFT_APP_TENANT_ID` **omitted**; resolved per activity from `channelData.tenant.id` |
| Auth credential | client secret (`MICROSOFT_APP_PASSWORD`) | client secret (`MICROSOFT_APP_PASSWORD`) |
| Where the credential lives | in the `msbridge` process | in the `msbridge` process — the Bot Framework credential is **not** centralized the way the GitHub App key is (no cross-workflow fanout); custody hardening is deferred (see below) |
| Workflow credential | GitHub `workflow_dispatch` runs under per-user OAuth via the GitHub user App (`services/ghuser`) | GitHub `workflow_dispatch` runs under a repo-scoped GitHub server-App installation token minted by `services/ghserver` (Teams is not a GitHub Actions runner, so there is no `services/oidc` exchange on this path) |
| Chat-reply credential | in-process Bot Framework credential | in-process Bot Framework credential |
| Bridge mode flag | `SERVICE_MSBRIDGE_TENANCY_MODE=single` (default) | `SERVICE_MSBRIDGE_TENANCY_MODE=multi` |
| Onboarding | register the Azure app and sideload the Teams app by hand | install the shared Teams app; `installationUpdate` consent + `POST /onboard` map the repo into `services/tenancy` |
| Services required | `msbridge`, `bridge`, `ghuser` | `msbridge`, `bridge`, `ghserver`, `tenancy` |

## Self-hosted (single-tenant)

You own and run one Azure AD app, bound to your own Entra tenant.

**Register the app** following
[Teams configuration § Azure AD App Registration](https://github.com/forwardimpact/monorepo/blob/main/specs/1200-teams-agent-bridge/config-msteams.md):

- **Supported account types** → **Accounts in this organizational directory
  only** (single tenant).
- Create a **client secret** and copy its value.
- Register an Azure Bot for the app and enable the **Microsoft Teams** channel;
  point the messaging endpoint at your bridge's public URL.

**Configure** `services/msbridge` (`createServiceConfig("msbridge")`):

| Env var | Value |
| --- | --- |
| `SERVICE_MSBRIDGE_TENANCY_MODE` | `single` (default) |
| `MICROSOFT_APP_ID` | the app's Application (client) id |
| `MICROSOFT_APP_PASSWORD` | the client secret value |
| `MICROSOFT_APP_TENANT_ID` | the Directory (tenant) id |

> `MICROSOFT_APP_TENANT_ID` is **required** here:
> `ConfigurationBotFrameworkAuthentication` defaults to multi-tenant
> validation when it is absent, so every inbound activity fails with 401.

The bridge runs the Bot Framework authenticator in `SingleTenant` mode and
threads the literal tenant id `default` through `services/bridge`; per-user
OAuth via the GitHub user App (`services/ghuser`) supplies the
`workflow_dispatch` credential.

**Onboarding** is manual: one Entra tenant, one app, one repo. No tenant
registry is involved.

## Hosted (multi-tenant)

Forward Impact registers and runs one shared Azure AD app plus the hosted
control plane. Adopters install the shared Teams app and never register their
own Azure app.

**App registration (Forward Impact operator):**

- **Supported account types** → **Accounts in any organizational directory**
  (multitenant); the bridge runs with `MicrosoftAppType` = **MultiTenant** and
  `MICROSOFT_APP_TENANT_ID` **omitted**, so the Bot Framework SDK accepts JWTs
  issued by any consenting Entra tenant.

**Configure the hosted services:**

| Service | Key configuration |
| --- | --- |
| `services/msbridge` | `SERVICE_MSBRIDGE_TENANCY_MODE=multi`; `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` set, `MICROSOFT_APP_TENANT_ID` omitted |
| `services/ghserver` | mints the repo-scoped GitHub server-App installation token used for hosted `workflow_dispatch` |
| `services/tenancy` | tenant registry — consent registration, Entra-tid → tenant resolution, repo mapping |

**Onboarding** is self-service:

1. A tenant adds the shared Teams app → Bot Framework fires `installationUpdate`
   (`action = add`) → the tenant is registered `pending_consent` in
   `services/tenancy`, keyed by its Entra tenant id.
2. The customer calls `POST /onboard` with `{ repo: { owner, name } }`; the
   handler verifies the caller's Entra `tid`, transitions that tenant to
   `active`, and binds the repo. Activities from non-active tenants are
   rejected.

> Full Bot Framework JWT signature validation for `/onboard` and custody
> hardening of the Bot Framework credential are deferred; until the verifier
> lands, `/onboard` is **default-deny** in production. Both are tracked in the
> [hosted control-plane hardening spec](https://github.com/forwardimpact/monorepo/blob/main/specs/1272-hosted-control-plane-hardening/spec.md).

## See also

- [GitHub server App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md)
  — the symmetric GitHub guide.
- [GitHub user App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md)
  — the shared per-user dispatch identity for self-hosted.
- [`services/msbridge` README](README.md) § Tenancy mode — runtime
  configuration and multi-tenant onboarding detail.
- [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)
  — trust model for both paths.
