# GitHub user App configuration

How to configure the **GitHub user App** — the Kata Agent **User** App that
issues per-user OAuth (user-to-server) tokens through `services/ghuser`. Both
bridges share it, and it supplies the GitHub identity a `workflow_dispatch` runs
under in **both** deployment models, so commits are authored as the human who
asked rather than a shared bot.

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
| Role in dispatch | **the** `workflow_dispatch` identity — each dispatch runs as the linked user | **the** `workflow_dispatch` identity — each dispatch runs as the linked user, the same per-user path as self-hosted |
| Credential | OAuth `client_id` + `client_secret` | OAuth `client_id` + `client_secret` |
| Per-user linking | users link once via the OAuth flow; the bridge prompts on the channel when a link is missing | same flow; every hosted dispatcher links once before dispatch |
| Services required | `ghuser` (+ the bridge that consumes it) | **required** — `ghuser` is on the dispatch path in both models |

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

Hosted `workflow_dispatch` uses the user App, exactly as self-hosted does. The
dispatch credential is the dispatching user's per-user OAuth token resolved
through `services/ghuser`, so hosted workflow commits are authored as the human
dispatcher (the per-user attribution the design's later trade-off restored). The
resolved tenant repo comes from `services/tenancy`; the dispatch credential does
not vary by mode.

Every hosted dispatcher links their GitHub account once before dispatch, the
same OAuth flow and configuration as self-hosted above. `services/ghuser` is
therefore required on the dispatch path in both models.

## See also

- [GitHub **server** App configuration](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md)
  — the other GitHub app (installation tokens), with the self-hosted vs hosted
  scenarios.
- [Azure AD app configuration](https://github.com/forwardimpact/monorepo/blob/main/services/msbridge/azure-app.md)
  — the Teams app; it shares this user App for dispatch identity in both models.
- [`services/ghuser` README](README.md) — the service's RPC surface and runtime
  configuration.
- [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)
  — trust model for both paths.
