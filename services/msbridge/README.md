# MS Teams Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Microsoft Teams bridge onto libbridge — relay messages between Teams
conversations and the Kata agent team.

<!-- END:description -->

## Prerequisites

- A Microsoft 365 developer tenant with an Azure Bot resource registered
  for the Teams channel — see
  [config-msteams.md § 1–3](../../specs/1200-teams-agent-bridge/config-msteams.md).
- The **Microsoft Teams channel** must be enabled on the Azure Bot resource
  (Settings → Channels → add Microsoft Teams).
- The `ghauth` service running and reachable (provides per-user GitHub
  tokens for dispatch). Each user who triggers a dispatch must have linked
  their GitHub account through the OAuth flow — the bridge prompts on the
  channel when a link is missing.

### Dependencies

| Service | Why |
| --- | --- |
| `bridge` | Canonical discussion and origin store (gRPC) |
| `ghauth` | Per-user GitHub token for `workflow_dispatch` |

Discussion state is owned by `services/bridge`; the bridge talks to it
over gRPC and keeps no on-disk discussion state of its own. Operators
upgrading from a bridge that predates this service can safely delete
legacy `data/bridges/msbridge/` files; they expire under their existing
24-hour TTL regardless.

### Configuration

Loaded via `createServiceConfig("msbridge")`:

| Env var | Purpose |
| --- | --- |
| `SERVICE_MSBRIDGE_URL` | Listen URL (default `http://localhost:3010`) |
| `SERVICE_MSBRIDGE_GITHUB_REPO` | `owner/repo` target |
| `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` | Public URL the workflow POSTs callbacks to |
| `SERVICE_GHAUTH_URL` | gRPC address of the ghauth service |
| `MICROSOFT_APP_ID` | Azure Bot application id |
| `MICROSOFT_APP_PASSWORD` | Azure Bot client secret |
| `MICROSOFT_APP_TENANT_ID` | Azure AD tenant id |

## Running

Add `mstunnel` and `msbridge` to `config/config.json` under
`init.services` — see [`config/CLAUDE.md`](../../config/CLAUDE.md) for the
entry format. List the tunnel with the other tunnels (before services) so
that restarting the bridge does not cycle the tunnel (declaration order
determines restart scope).

Start both services:

```sh
just rc-start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After starting, check the tunnel log for the assigned URL:

```sh
cat data/logs/mstunnel/current | grep trycloudflare.com
```

### Azure Bot messaging endpoint

In the Azure portal (Settings → Configuration), set the messaging endpoint
to `https://<tunnel-domain>/api/messages`.

Set `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` in `.env` to the tunnel domain
(without any path), then restart only the bridge:

```sh
bunx fit-rc restart msbridge
```

The tunnel keeps its hostname across bridge restarts.

## Service supervision

If you supervise `msbridge` via `fit-rc`, list `bridge` ahead of the bridge
entries in `init.services` so `createClient('bridge', …)` resolves at startup.

### Corporate network considerations

The bridge must be able to reach `api.github.com` to dispatch workflows.
If you are on a corporate VPN with tenant restrictions, outbound calls
to Azure AD and GitHub may be blocked. Disconnect from the VPN before
starting the bridge, or allowlist the required endpoints.

## Packaging the Teams App

```sh
just msbridge-package
```

Reads `MICROSOFT_APP_ID` from `.env` via libconfig and the tunnel domain
from `SERVICE_MSBRIDGE_CALLBACK_BASE_URL`. Produces
`dist/kata-agent-bridge.zip` (git-ignored) containing the manifest and
placeholder icons. Override the tunnel domain with
`--tunnel-domain=<host>` if needed.

The manifest uses Teams schema v1.17. The package can be rebuilt and
re-uploaded without removing the app from Teams — the Azure Bot
messaging endpoint is what controls routing, not the package contents.

## Sideloading

1. In [Teams Admin Center](https://admin.teams.microsoft.com/policies/manage-apps),
   ensure **Org-wide app settings → Allow interaction with custom apps** is on.
2. In **Setup policies → Global**, ensure **Upload custom apps** is on.
3. Open Teams → Apps → Manage your apps → **Upload an app** →
   **Upload a custom app** → select `kata-agent-bridge.zip`.
4. Add the app to a team or group chat.

## Smoke test

Send `@Kata Agent hello` in the configured team or chat. The bot shows
a randomized status word ("Moonwalking...", "Crafting...", etc.) while
the agent team works, then posts the facilitator's response back in the
same thread once the session completes.
