# GitHub User Authentication

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub user authentication — per-user OAuth token lifecycle for the Kata Agent
User App.

<!-- END:description -->

To configure this GitHub **user App** (self-hosted or hosted), see
[github-app.md](github-app.md). `services/ghserver` documents the separate
server/installation app.

## Prerequisites

- A **Kata Agent User** GitHub App (user-to-server auth model) with
  "Expire user authorization tokens" enabled and the permissions the
  dispatch workflow requires (e.g. `actions:write`).
- The App's **Client ID** and a generated **Client Secret**.

`createServiceConfig("ghuser")` loads the configuration:

| Env var | Purpose |
| --- | --- |
| `SERVICE_GHUSER_URL` | Listen URL (default `grpc://localhost:3009`) |
| `SERVICE_GHUSER_CLIENT_ID` | Kata Agent User App client ID |
| `SERVICE_GHUSER_CLIENT_SECRET` | Kata Agent User App client secret |
| `SERVICE_GHUSER_LINK_BASE_URL` | Public URL of the `oauth` service (used in `LinkRequired.authorize_url`) |

## Running

Add `ghuser` and `oauth` to `config/config.json` under `init.services`.
See [`config/CLAUDE.md`](../../config/CLAUDE.md) for the entry format.
List `oauthtunnel` with the other tunnels (before services), so a `ghuser`
restart does not cycle the tunnel (declaration order determines restart
scope). List `ghuser` before `oauth` (dependency first).

Start both services:

```sh
bunx fit-rc start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After you start the services, check the tunnel log for the
assigned URL:

```sh
cat data/logs/oauthtunnel/current | grep trycloudflare.com
```

### GitHub App callback configuration

In the App settings (`github.com/settings/apps/<app>`):

1. Set **Callback URL** to `https://<tunnel-domain>/callback`.
2. Save changes.

Set `SERVICE_GHUSER_LINK_BASE_URL` in `.env` to the tunnel domain
(without any path). Then restart only the auth services:

```sh
bunx fit-rc restart ghuser
```

The tunnel keeps its hostname across service restarts.

`libstorage` persists token bindings as JSONL under `data/ghuser/`. It uses
the standard `createStorage` path, so you need no extra env var.

### Corporate network considerations

The service must reach `github.com` to exchange authorization codes and
refresh tokens. If you are on a corporate VPN with tenant restrictions,
disconnect before you start.

## Smoke test

Visit the authorize URL in a browser:

```text
https://<tunnel-domain>/authorize?surface=test&surface_user_id=you
```

The flow:

1. Redirects to GitHub to authorize the Kata Agent User App.
2. GitHub calls back to `/callback` on the `oauth` service.
3. `ghuser` exchanges the authorization code for a user-to-server token.
4. `ghuser` stores the binding in `data/ghuser/bindings.jsonl`.
5. The browser shows "Linked — Your account has been linked."

Verify the binding through gRPC:

```js
const result = await client.GetToken({ surface: "test", surface_user_id: "you" });
// result.token → "ghu_..."
```

For an unlinked user, `GetToken` returns `link_required` with the
authorize URL. For a revoked or expired token that the service cannot
refresh, it returns `re_auth_required`.
