# GitHub user App configuration

How to configure the **GitHub user App** — the Kata Agent **User** App that
issues per-user OAuth (user-to-server) tokens through `services/ghuser`. Both
bridges share it: in self-hosted deployments it supplies the GitHub identity a
`workflow_dispatch` runs under, so commits are authored as the human who asked
rather than a shared bot.

> **Two GitHub apps, do not conflate them.** This guide covers the **user App**
> (per-user OAuth). The separate **server App** — the installation App whose key
> mints server-to-server tokens — is documented in
> [`services/ghserver` § GitHub server App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md).

See [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for
the trust model.

## At a glance

| Aspect | Self-hosted (single-tenant) | Hosted (multi-tenant) |
| --- | --- | --- |
| Who registers / owns the App | the adopting team | Forward Impact (one shared App) |
| App type | a GitHub App (or OAuth App) issuing **user-to-server** tokens | same |
| Role in dispatch | **the** `workflow_dispatch` identity — each dispatch runs as the linked user | **not on the dispatch path** — hosted `workflow_dispatch` uses the server App's installation token (`services/ghserver`) instead |
| Credential | OAuth `client_id` + `client_secret` | OAuth `client_id` + `client_secret` |
| Per-user linking | users link once via the OAuth flow; the bridge prompts on the channel when a link is missing | same flow where per-user identity is still wanted (e.g. attribution), but not required for dispatch |
| Services required | `ghuser` (+ the bridge that consumes it) | optional — `ghuser` need not run if only App-token dispatch is used |

## Self-hosted (single-tenant)

The user App is the dispatch identity. Register one GitHub App (or OAuth App)
that issues user-to-server tokens, set its **Authorization callback URL** to
`${GHUSER_LINK_BASE_URL}/callback`, and run `services/ghuser`.

**Configure** `services/ghuser` (`createServiceConfig("ghuser")`):

| Env var | Value |
| --- | --- |
| `SERVICE_GHUSER_CLIENT_ID` | the user App's OAuth client id |
| `SERVICE_GHUSER_CLIENT_SECRET` | the user App's OAuth client secret |
| `SERVICE_GHUSER_LINK_BASE_URL` | public base URL the bridge links users to for authorization |
| `SERVICE_GHUSER_IDP_ORIGIN` / `SERVICE_GHUSER_TRUSTED_IDP_ORIGINS` | identity-provider origin and the trusted-origin allowlist |
| `SERVICE_GHUSER_LINK_COMPLETION_TICKET_SECRET` | shared HMAC secret across `ghuser`, `ghbridge`, and `msbridge` |

Each user who triggers a dispatch links their GitHub account once; the bridge
(`ghbridge` or `msbridge`) prompts on the channel when a link is missing and
resolves the per-user token through `ghuser` at dispatch time.

## Hosted (multi-tenant)

Hosted `workflow_dispatch` does **not** use the user App. The dispatch
credential shifts to the **server App** installation token minted by
`services/ghserver` for the resolved tenant repo (so hosted workflow commits
are authored as the App, not the human dispatcher — the design's explicit
trade-off to avoid requiring every dispatcher to complete a per-user link
flow). `services/ghuser` therefore need not run on the hosted dispatch path.

Where per-user attribution is still desired on a hosted surface, the same OAuth
flow and configuration above apply; it simply no longer gates dispatch.

## See also

- [GitHub **server** App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md)
  — the other GitHub app (installation tokens), with the self-hosted vs hosted
  scenarios.
- [Azure AD app configuration](https://github.com/forwardimpact/monorepo/blob/main/services/msbridge/azure-app.md)
  — the Teams app; it shares this user App for self-hosted dispatch identity.
- [`services/ghuser` README](README.md) — the service's RPC surface and runtime
  configuration.
- [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)
  — trust model for both paths.
