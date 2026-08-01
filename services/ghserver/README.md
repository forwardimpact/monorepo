# Ghserver

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub App key custody and a surface that mints short-lived installation tokens
for the hosted control plane.

<!-- END:description -->

To configure the GitHub **server App** (self-hosted or hosted), see
[github-app.md](github-app.md). `services/ghuser` documents the separate
per-user OAuth app.

## What this service owns

`services/ghserver` is the only process in the hosted control plane that
holds GitHub App signing material. It mints **repo-scoped, short-lived**
installation tokens on demand so no bridge or front-end process needs the
App private key.

Every `MintInstallationToken` call:

1. resolves the `(owner, name)` repo in the request to an `active` tenant
   through `services/tenancy.ResolveByRepo`. An unknown or non-`active` repo
   returns gRPC `NOT_FOUND`.
2. enforces a per-tenant mint-rate ceiling. A call over the ceiling returns
   gRPC `RESOURCE_EXHAUSTED` (the `RATE_LIMITED` contract). `services/oidc`
   surfaces it as HTTP 429.
3. mints a token bound to the resolved installation through the in-process
   `@octokit/auth-app` custody.

The service scopes the token to the resolved installation, so nobody can
reuse a token from one customer repo on another. The `@octokit/auth-app`
memoization key is the `installation_id`.

## Credential custody and the deferred substrate

The App private key resolves from `SERVICE_GHSERVER_PRIVATE_KEY` at
runtime. Production substrate hardening is the deferred follow-on per
[design § What this design does not cover](../../specs/1270-kata-bridges-public-hosting/design-a.md#what-this-design-does-not-cover).
That hardening covers KMS / HSM custody and **gRPC peer authentication**
(mTLS / signed JWT / mesh credential).

Until the peer-authentication substrate lands, the mint surface is
unauthenticated at the gRPC level and relies on **network isolation**.
The service refuses to start on a non-loopback / non-private address
unless you set `SERVICE_GHSERVER_ALLOW_PUBLIC_BIND=true` explicitly (see
[`src/bind-guard.js`](src/bind-guard.js)). Both callers inside the control
plane reach it over the internal network. Those callers are the hosted
bridges and `services/oidc`.

## Configuration

`createServiceConfig("ghserver")` loads the configuration:

| Env var                                       | Default       | Purpose                                              |
| --------------------------------------------- | ------------- | ---------------------------------------------------- |
| `SERVICE_GHSERVER_APP_ID`                     | —             | GitHub App id (required)                             |
| `SERVICE_GHSERVER_PRIVATE_KEY`                | —             | GitHub App private key, PEM (required)               |
| `SERVICE_GHSERVER_HOST`                       | `127.0.0.1`   | Bind address (loopback / private only by default)    |
| `SERVICE_GHSERVER_PORT`                       | `3007`        | Listen port                                          |
| `SERVICE_GHSERVER_ALLOW_PUBLIC_BIND`          | `false`       | Opt in to a non-private bind address                 |
| `SERVICE_GHSERVER_RATE_CEILING_PER_TENANT_PER_MINUTE` | `10`  | Per-tenant mint ceiling (60s sliding window)         |

## Running

Add `ghserver` to `config/config.json` under `init.services` (see
[`config/CLAUDE.md`](../../config/CLAUDE.md) for entry format). In
single-tenant deployments the service does **not** run. The bridge
reads `KATA_APP_PRIVATE_KEY` directly and builds its own in-process
`createAppAuth` closure.

## RPCs

| RPC                     | Direction | Used by                                  |
| ----------------------- | --------- | ---------------------------------------- |
| `MintInstallationToken` | read      | `services/oidc`, hosted `ghbridge`/`msbridge` |

The proto definition is at [`proto/ghserver.proto`](proto/ghserver.proto).
