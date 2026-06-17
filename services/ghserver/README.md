# Ghserver

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub App key custody and short-lived installation-token minting surface for
the hosted control plane.

<!-- END:description -->

For configuring the GitHub **server App** (self-hosted vs hosted), see
[github-app.md](github-app.md). The separate per-user OAuth app is documented
in `services/ghuser`.

## What this service owns

`services/ghserver` is the only process in the hosted control plane that
holds GitHub App signing material. It mints **repo-scoped, short-lived**
installation tokens on demand so no bridge or front-end process needs the
App private key.

Every `MintInstallationToken` call:

1. resolves the requesting `(owner, name)` repo to an `active` tenant via
   `services/tenancy.ResolveByRepo` — an unknown or non-`active` repo
   returns gRPC `NOT_FOUND`;
2. enforces a per-tenant mint-rate ceiling — exceeding it returns gRPC
   `RESOURCE_EXHAUSTED` (the `RATE_LIMITED` contract; `services/oidc`
   surfaces it as HTTP 429);
3. mints a token bound to the resolved installation through the in-process
   `@octokit/auth-app` custody.

The token is scoped to the resolved installation, so a token minted for
one customer repo is never reusable for another (the `@octokit/auth-app`
memoization key is the `installation_id`).

## Credential custody and the deferred substrate

The App private key resolves from `SERVICE_GHSERVER_PRIVATE_KEY` at
runtime. Production substrate hardening — KMS / HSM custody, and **gRPC
peer authentication** (mTLS / signed JWT / mesh credential) — is the
deferred follow-on per
[design § What this design does not cover](../../specs/1270-kata-bridges-public-hosting/design-a.md#what-this-design-does-not-cover).

Until the peer-authentication substrate lands, the mint surface is
unauthenticated at the gRPC level and relies on **network isolation**.
The service refuses to start on a non-loopback / non-private address
unless `SERVICE_GHSERVER_ALLOW_PUBLIC_BIND=true` is set explicitly (see
[`src/bind-guard.js`](src/bind-guard.js)). Both in-control-plane callers —
the hosted bridges and `services/oidc` — reach it over the internal
network.

## Configuration

Loaded via `createServiceConfig("ghserver")`:

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
single-tenant deployments the service is **not** started — the bridge
reads `KATA_APP_PRIVATE_KEY` directly and builds its own in-process
`createAppAuth` closure.

## RPCs

| RPC                     | Direction | Used by                                  |
| ----------------------- | --------- | ---------------------------------------- |
| `MintInstallationToken` | read      | `services/oidc`, hosted `ghbridge`/`msbridge` |

The proto definition is at [`proto/ghserver.proto`](proto/ghserver.proto).
