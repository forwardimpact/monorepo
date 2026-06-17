# GitHub server App configuration

How to configure the **GitHub server App** — the installation App whose private
key mints repo-scoped, server-to-server installation tokens — for each
deployment model. `services/ghserver` is the App's key-custody service in the
hosted model; `services/ghbridge` holds the same key in the self-hosted model.

> **Two GitHub apps, do not conflate them.** This guide covers the **server
> App** (installation tokens for the discussion-reply / reaction path). The
> separate **user App** — per-user OAuth, the `workflow_dispatch` credential in
> **both** deployment models — is documented in
> [`services/ghuser` § GitHub user App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md).

This is the GitHub counterpart of
[`services/msbridge` § Azure AD app configuration](https://github.com/forwardimpact/monorepo/blob/main/services/msbridge/azure-app.md);
the two guides share a structure. See
[TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for the
trust model.

## At a glance

| Aspect | Self-hosted (single-tenant) | Hosted (multi-tenant) |
| --- | --- | --- |
| Who registers / owns the App | the adopting team | Forward Impact (one shared App) |
| App scope toggle | "Where can this GitHub App be installed?" → **Only on this account** | → **Any account** |
| Tenant binding | static installation id (`SERVICE_GHBRIDGE_APP_INSTALLATION_ID`) | resolved per inbound webhook from the delivery's repository (`resolveByRepo`) |
| Signing credential | App private key (PEM) | App private key (PEM) |
| Where the key lives | in the `ghbridge` process | in `services/ghserver` **only** — no bridge or workflow holds it |
| Workflow credential | `KATA_APP_ID` + `KATA_APP_PRIVATE_KEY` repo secrets | installation token minted at run time from `services/oidc` (repo sets the `FIT_OIDC_URL` variable; no App-key secret) |
| Discussion-reply credential | installation token from the static installation id | per-repo installation token minted by `services/ghserver` |
| Bridge mode flag | `SERVICE_GHBRIDGE_TENANCY_MODE=single` (default) | `SERVICE_GHBRIDGE_TENANCY_MODE=multi` |
| Onboarding | install the App on your own account, by hand | install the shared App from its public URL; `installation` webhooks onboard repos into `services/tenancy` |
| Services required | `ghbridge`, `bridge`, `ghuser` | `ghbridge`, `bridge`, `ghserver`, `oidc`, `tenancy` |

## Self-hosted (single-tenant)

You own and run one GitHub App for your account/organization; the bridge holds
its key directly (`services/ghserver` is not deployed).

**Register the App** following
[`kata-setup` § GitHub App Setup](https://github.com/forwardimpact/monorepo/blob/main/.claude/skills/kata-setup/references/github-app.md):

- **Where can this GitHub App be installed?** → **Only on this account.**
- Enable the webhook → `${GHBRIDGE_PUBLIC_URL}/api/webhook` with a 32-byte hex
  secret (also set as `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET`).
- Install the App on the target repository and note the **installation id**.

**Configure** `services/ghbridge` (`createServiceConfig("ghbridge")`):

| Env var | Value |
| --- | --- |
| `SERVICE_GHBRIDGE_TENANCY_MODE` | `single` (default) |
| `SERVICE_GHBRIDGE_APP_ID` | the App's numeric id |
| `SERVICE_GHBRIDGE_APP_PRIVATE_KEY` | PEM contents (single-line — see the ghbridge README § Private key format) |
| `SERVICE_GHBRIDGE_APP_INSTALLATION_ID` | installation id for the target repo |
| `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` | the webhook secret |

**Workflows** authenticate with the App via repo secrets `KATA_APP_ID` and
`KATA_APP_PRIVATE_KEY` (the `kata-setup` self-hosted workflow templates). The
bridge threads the literal tenant id `default` through `services/bridge`;
per-user OAuth via the **user App** (`services/ghuser`) supplies the
`workflow_dispatch` credential.

**Onboarding** is manual: one account, one App, one installation. No tenant
registry is involved.

## Hosted (multi-tenant)

Forward Impact registers and runs one shared GitHub App plus the hosted control
plane. Adopters install the App and never register their own.

**App registration (Forward Impact operator):**

- **Where can this GitHub App be installed?** → **Any account.**
- Webhook → the hosted `ghbridge` ingress; the App private key is provisioned
  **only** into `services/ghserver`.

**Configure the hosted services:**

| Service | Key configuration |
| --- | --- |
| `services/ghserver` | `SERVICE_GHSERVER_APP_ID`, `SERVICE_GHSERVER_PRIVATE_KEY` — the only process that holds the App key; mints repo-scoped installation tokens |
| `services/oidc` | validates a workflow's GitHub Actions OIDC token and delegates minting to `ghserver` |
| `services/ghbridge` | `SERVICE_GHBRIDGE_TENANCY_MODE=multi` — holds no App key; resolves the tenant per webhook and mints per-repo tokens via `ghserver` |
| `services/tenancy` | tenant registry — onboarding upserts and repo → tenant resolution |

**Adopter setup** carries **no** `KATA_APP_PRIVATE_KEY`: the repo sets the
`FIT_OIDC_URL` repository **variable** (and `ANTHROPIC_API_KEY`), and the
hosted workflow templates mint a short-lived installation token from
`services/oidc` at run time.

**Onboarding** is self-service: installing the shared App fires
`installation.created` / `installation.repositories_added`, which onboard each
repository into `services/tenancy` with `state = active`. Thereafter every
inbound webhook resolves to its tenant by repository.

> The `installation.repositories_removed` / full-uninstall **revoke** path and
> KMS/HSM custody of the App key are deferred hardening, tracked in the
> [hosted control-plane hardening spec](https://github.com/forwardimpact/monorepo/blob/main/specs/1272-hosted-control-plane-hardening/spec.md).

## See also

- [GitHub **user** App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghuser/github-app.md)
  — the other GitHub app (per-user OAuth dispatch identity).
- [Azure AD app configuration](https://github.com/forwardimpact/monorepo/blob/main/services/msbridge/azure-app.md)
  — the symmetric Teams guide.
- [`services/ghbridge` README](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md)
  § Tenancy mode — runtime configuration and the private-key format.
- [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)
  — trust model for both paths.
