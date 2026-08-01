# Azure AD app configuration

Configure the **Azure AD (Entra) app** behind `services/msbridge` for each
deployment model. The owner registers the app as an Azure Bot. This is the Teams
counterpart of
[`services/ghserver` § GitHub server App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md).
The two guides share a structure. See
[TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for the
trust model.

> Teams has **one** app (the Azure Bot). For the GitHub `workflow_dispatch`
> credential it triggers, the self-hosted path reuses the GitHub **user App**
> (`services/ghuser`), exactly as `ghbridge` does. See
> [GitHub user App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md).

## At a glance

| Aspect | Self-hosted (single-tenant) | Hosted (multi-tenant) |
| --- | --- | --- |
| Who registers / owns the app | the adopting team | Forward Impact (one shared app) |
| App scope toggle | "Supported account types" → **Accounts in this organizational directory only**. `MicrosoftAppType` = **SingleTenant** | → **Accounts in any organizational directory**. `MicrosoftAppType` = **MultiTenant** |
| Tenant binding | `MICROSOFT_APP_TENANT_ID` set | `MICROSOFT_APP_TENANT_ID` **omitted**. The bridge resolves the tenant per activity from `channelData.tenant.id` |
| Auth credential | client secret (`MICROSOFT_APP_PASSWORD`) | client secret (`MICROSOFT_APP_PASSWORD`) |
| Where the credential lives | in the `msbridge` process | in the `msbridge` process. The Bot Framework credential is **not** centralized the way the GitHub App key is (no cross-workflow fanout). Custody hardening is deferred (see below) |
| Workflow credential | GitHub `workflow_dispatch` runs under per-user OAuth through the GitHub user App (`services/ghuser`) | GitHub `workflow_dispatch` runs under per-user OAuth through the GitHub user App (`services/ghuser`). This is the same per-user path as single-tenant. Teams is not a GitHub Actions runner, so there is no `services/oidc` exchange on this path |
| Chat-reply credential | in-process Bot Framework credential | in-process Bot Framework credential |
| Bridge mode flag | `SERVICE_MSBRIDGE_TENANCY_MODE=single` (default) | `SERVICE_MSBRIDGE_TENANCY_MODE=multi` |
| Onboarding | register the Azure app and sideload the Teams app by hand | install the shared Teams app. `installationUpdate` consent and `POST /onboard` map the repo into `services/tenancy` |
| Services required | `msbridge`, `bridge`, `ghuser` | `msbridge`, `bridge`, `ghuser`, `tenancy` |

## Self-hosted (single-tenant)

You own and run one Azure AD app, bound to your own Entra tenant.

**Register the app** as described in
[Teams configuration § Azure AD App Registration](https://github.com/forwardimpact/monorepo/blob/main/specs/1200-teams-agent-bridge/config-msteams.md):

- **Supported account types** → **Accounts in this organizational directory
  only** (single tenant).
- Create a **client secret** and copy its value.
- Register an Azure Bot for the app and enable the **Microsoft Teams** channel.
  Point the messaging endpoint at your bridge's public URL.

**Configure** `services/msbridge` (`createServiceConfig("msbridge")`):

| Env var | Value |
| --- | --- |
| `SERVICE_MSBRIDGE_TENANCY_MODE` | `single` (default) |
| `MICROSOFT_APP_ID` | the app's Application (client) id |
| `MICROSOFT_APP_PASSWORD` | the client secret value |
| `MICROSOFT_APP_TENANT_ID` | the Directory (tenant) id |

> `MICROSOFT_APP_TENANT_ID` is **required** here.
> `ConfigurationBotFrameworkAuthentication` defaults to multi-tenant
> validation when the value is absent. Every inbound activity then fails
> with 401.

The bridge runs the Bot Framework authenticator in `SingleTenant` mode. It
threads the literal tenant id `default` through `services/bridge`. Per-user
OAuth through the GitHub user App (`services/ghuser`) supplies the
`workflow_dispatch` credential.

**Onboarding** is manual: one Entra tenant, one app, one repo. This path has no
tenant registry.

## Hosted (multi-tenant)

Forward Impact registers and runs one shared Azure AD app plus the hosted
control plane. Adopters install the shared Teams app and never register their
own Azure app.

**App registration (Forward Impact operator):**

- **Supported account types** → **Accounts in any organizational directory**
  (multitenant). The bridge runs with `MicrosoftAppType` = **MultiTenant** and
  `MICROSOFT_APP_TENANT_ID` **omitted**. The Bot Framework SDK then accepts
  JWTs issued by any consenting Entra tenant.

**Configure the hosted services:**

| Service | Key configuration |
| --- | --- |
| `services/msbridge` | `SERVICE_MSBRIDGE_TENANCY_MODE=multi`. `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` set, `MICROSOFT_APP_TENANT_ID` omitted |
| `services/ghuser` | per-user OAuth — supplies the `workflow_dispatch` credential as the user who dispatches, the same per-user path as single-tenant |
| `services/tenancy` | tenant registry — consent registration, Entra-tid → tenant resolution, repo mapping |

**Onboarding** is self-service:

1. A tenant adds the shared Teams app. Bot Framework fires `installationUpdate`
   (`action = add`). The consent handler registers the tenant as
   `pending_consent` in `services/tenancy`, keyed by its Entra tenant id.
2. The customer calls `POST /onboard` with `{ repo: { owner, name } }`. The
   handler validates the inbound Bot Framework bearer JWT (same
   `ConfigurationBotFrameworkAuthentication` as the `/api/messages` path) to
   verify the caller's Entra `tid`. The handler then transitions that tenant to
   `active` and binds the repo. An absent or forged proof returns 401. The
   bridge rejects activities from non-active tenants.

> Custody hardening of the Bot Framework credential remains deferred. The
> credential has no cross-workflow fanout, unlike the GitHub App key. The
> [hosted control-plane hardening spec](https://github.com/forwardimpact/monorepo/blob/main/specs/1272-hosted-control-plane-hardening/spec.md)
> § Out of scope tracks it.

## Manual testing of the tenancy path (local)

Exercise the `tenancy` → resolve → per-user dispatch path on one developer
machine. Reuse one GitHub App.

> Microsoft does not permit multi-tenant Azure Bot resources, so the bot
> resource here is **Single Tenant**. The bridge's `multi` tenancy mode still
> drives the registry resolver. Dispatch uses the per-user OAuth token through
> `services/ghuser`. Only the Bot Framework app type follows
> `MICROSOFT_APP_TENANT_ID` (SingleTenant when set). A true multi-tenant
> offering uses a single-tenant bot plus a multi-tenant Entra app. It
> distributes that app through the Teams Store and builds on the Microsoft 365
> Agents SDK.

1. **Azure** — register an Entra app (a multi-tenant audience is fine and also
   serves Store distribution). Then create an **Azure Bot resource as Single
   Tenant** bound to your home tenant, with App ID = that app. Enable the
   Microsoft Teams channel.
2. **`.env`** — set `SERVICE_MSBRIDGE_TENANCY_MODE=multi`. **Keep
   `MICROSOFT_APP_TENANT_ID`** set to your home tenant. The bridge runs
   SingleTenant Bot Framework auth to match the bot, and the seed script uses
   that value as the Entra tenant id. Point `ghserver` at a GitHub App installed
   on the test repo with **`actions: write`**, through `SERVICE_GHSERVER_APP_ID`
   and `SERVICE_GHSERVER_PRIVATE_KEY`. The self-hosted `ghbridge` App works if
   it carries that permission.
3. **`config/config.json`** — add `tenancy` and `ghserver` ahead of `msbridge`
   (see [`config/CLAUDE.md`](../../config/CLAUDE.md) § `init`).
4. **Start** the stack (`bunx fit-rc start`). Set the Azure Bot messaging
   endpoint to the fresh tunnel (`README.md` § Azure Bot messaging endpoint).
5. **Seed the registry** against the `tenancy` service while it runs:

   ```sh
   bun scripts/seed-tenancy.mjs        # values default from .env
   ```

   It creates the `github-discussions` row first, so `services/ghserver` can
   split the installation id. It then creates the `msteams` row. It fails loudly
   if `ResolveByRepo` would return an unmintable row.
6. **Smoke test** — send `@Kata Agent hello` from the test tenant. Watch
   `data/logs/msbridge/current` and `data/logs/ghserver/current` for the resolve
   → mint → dispatch chain.

> The seed step is the practical path because `POST /onboard` requires a **Bot
> Framework-issued** bearer token (audience = the bot's `MICROSOFT_APP_ID`).
> `/onboard` rejects an Entra user or Graph token. The seed step also creates
> the `github-discussions` row that `/onboard` never writes.

## See also

- [GitHub server App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md)
  — the symmetric GitHub guide.
- [GitHub user App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md)
  — the shared per-user dispatch identity for self-hosted.
- [`services/msbridge` README](README.md) § Tenancy mode — runtime
  configuration and multi-tenant onboarding detail.
- [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)
  — trust model for both paths.
