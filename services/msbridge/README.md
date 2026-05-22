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
- A GitHub token with `actions:write` on `forwardimpact/monorepo`.
- Credentials (`MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`,
  `MICROSOFT_APP_TENANT_ID`, `GH_TOKEN`) and service params
  (`SERVICE_MSBRIDGE_PORT`, `SERVICE_MSBRIDGE_CALLBACK_BASE_URL`,
  `SERVICE_MSBRIDGE_GITHUB_REPO`) in `.env`. All config is loaded by
  `libconfig` via `createServiceConfig("msbridge")`.
- `STATE_DIR` env var (default `/var/lib/msbridge`) — directory for the
  JSONL discussion-context store. The directory must be writable by the
  service process.

## Running

Start all services (bridge + tunnel) via `fit-rc`:

```sh
just rc-start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After starting, check the tunnel log for the assigned URL:

```sh
cat data/logs/msbridge-tunnel/current | grep trycloudflare.com
```

Set that URL as the Azure Bot messaging endpoint in the Azure portal
(Settings → Configuration):
`https://<tunnel-domain>/api/messages`.

Also set `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` in `.env` to the same
tunnel domain (without the `/api/messages` path) so the bridge can
receive workflow callbacks. The bridge must be restarted after changing
`.env` — kill the bridge process and let the supervisor restart it, or
stop and start `fit-rc`. Avoid restarting the tunnel itself, as that
generates a new hostname.

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
