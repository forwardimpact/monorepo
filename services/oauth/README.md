# OAuth Authorization Server

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

OAuth 2.1 authorization server adapter — protocol-only HTTP front that delegates
to a configured provider backend over gRPC.

<!-- END:description -->

## Prerequisites

- A running provider backend (currently `ghauth`) that implements the
  `Begin`, `Complete`, and `Redeem` RPCs.

Configuration (loaded via `createServiceConfig("oauth")`):

| Env var | Purpose |
| --- | --- |
| `SERVICE_OAUTH_URL` | Listen URL (default `http://localhost:3007`) |
| `SERVICE_OAUTH_ISSUER` | Authorization server issuer URL (used in metadata document) |
| `SERVICE_OAUTH_PROVIDER` | Backend provider service name, resolved via `createClient` (default `ghauth`) |

## Running

Add `oauth` to `config/config.json` under `init.services` — see
[`config/CLAUDE.md`](../../config/CLAUDE.md) for the entry format. List
`oauthtunnel` with the other tunnels (before services) and `ghauth`
before `oauth` (dependency first).

Start the service:

```sh
bunx fit-rc start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After starting, check the tunnel log for the assigned URL:

```sh
cat data/logs/oauthtunnel/current | grep trycloudflare.com
```

Set the tunnel domain as `SERVICE_GHAUTH_LINK_BASE_URL` in `.env` (so
`ghauth` composes the correct `LinkRequired.authorize_url`), then restart
the auth services:

```sh
bunx fit-rc restart ghauth
```

The tunnel keeps its hostname across service restarts.

## Endpoints

| Route | Method | Description |
| --- | --- | --- |
| `/.well-known/oauth-authorization-server` | GET | AS metadata document |
| `/authorize` | GET | Begin authorization — redirects to upstream provider |
| `/callback` | GET | Provider callback — redirects to client or renders "linked" page |
| `/token` | POST | Exchange authorization code for token |
| `/health` | GET | Liveness check |

## Smoke test

Verify the metadata document:

```sh
curl https://<tunnel-domain>/.well-known/oauth-authorization-server
```

Returns the issuer, authorization endpoint, token endpoint, supported
response types (`code`), grant types (`authorization_code`), and code
challenge methods (`S256`).

Verify the authorize redirect:

```sh
curl -sI 'https://<tunnel-domain>/authorize?surface=test&surface_user_id=you'
```

Returns a `302` redirect to the upstream provider's authorization URL.
The full linking flow is described in the
[ghauth README](../ghauth/README.md#smoke-test).
