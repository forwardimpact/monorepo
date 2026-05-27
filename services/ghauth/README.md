# GitHub User Authentication

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub user authentication — per-user OAuth token lifecycle for the Kata Agent
User App.

<!-- END:description -->

## Prerequisites

- A **Kata Agent User** GitHub App (user-to-server auth model) with
  "Expire user authorization tokens" enabled and the permissions the
  dispatch workflow requires (e.g. `actions:write`).
- The App's **Client ID** and a generated **Client Secret**.

Configuration (loaded via `createServiceConfig("ghauth")`):

| Env var | Purpose |
| --- | --- |
| `SERVICE_GHAUTH_URL` | Listen URL (default `grpc://localhost:3006`) |
| `SERVICE_GHAUTH_CLIENT_ID` | Kata Agent User App client ID |
| `SERVICE_GHAUTH_CLIENT_SECRET` | Kata Agent User App client secret |
| `SERVICE_GHAUTH_LINK_BASE_URL` | Public URL of the `oauth` service (used in `LinkRequired.authorize_url`) |

## Running

Add `ghauth` and `oauth` to `config/config.json` under `init.services` —
see [`config/CLAUDE.md`](../../config/CLAUDE.md) for the entry format.
List `oauthtunnel` with the other tunnels (before services) so that
restarting `ghauth` does not cycle the tunnel (declaration order determines
restart scope). List `ghauth` before `oauth` (dependency first).

Start both services:

```sh
just rc-start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After starting, check the tunnel log for the assigned URL:

```sh
cat data/logs/oauthtunnel/current | grep trycloudflare.com
```

### GitHub App callback configuration

In the App settings (`github.com/settings/apps/<app>`):

1. Set **Callback URL** to `https://<tunnel-domain>/callback`.
2. Save changes.

Set `SERVICE_GHAUTH_LINK_BASE_URL` in `.env` to the tunnel domain
(without any path), then restart only the auth services:

```sh
bunx fit-rc restart ghauth
```

The tunnel keeps its hostname across service restarts.

Token bindings are persisted as JSONL under `data/ghauth/` via
`libstorage` (the standard `createStorage` path — no extra env var
needed).

### Corporate network considerations

The service must be able to reach `github.com` to exchange authorization
codes and refresh tokens. If you are on a corporate VPN with tenant
restrictions, disconnect before starting.

## Smoke test

Visit the authorize URL in a browser:

```
https://<tunnel-domain>/authorize?surface=test&surface_user_id=you
```

The flow:

1. Redirects to GitHub to authorize the Kata Agent User App.
2. GitHub calls back to `/callback` on the `oauth` service.
3. `ghauth` exchanges the authorization code for a user-to-server token.
4. The binding is stored in `data/ghauth/bindings.jsonl`.
5. The browser shows "Linked — Your account has been linked."

Verify the binding via gRPC:

```js
const result = await client.GetToken({ surface: "test", surface_user_id: "you" });
// result.token → "ghu_..."
```

For an unlinked user, `GetToken` returns `link_required` with the
authorize URL. For a revoked or expired token that cannot be refreshed,
it returns `re_auth_required`.
