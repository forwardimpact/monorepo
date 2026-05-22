---
title: Bridge Microsoft Teams to the Agent Team
description: Stand up the msbridge service so a Teams mention dispatches a Kata session and the verdict posts back to the same thread.
---

Engineers discuss work in Microsoft Teams. The Kata agent team listens on
GitHub. Without a bridge, every interaction means context-switching: open a
new tab, file an issue, hand-craft a workflow_dispatch, paste the verdict
back into Teams when it's done. The `msbridge` service closes that gap. A
user mentions the bot in a Teams thread, the bridge dispatches the
channel-agnostic `kata-dispatch` workflow with the conversation history, and
posts the lead's reply back into the same thread when the workflow finishes.

This guide walks through the operational steps to stand up `msbridge` for a
target GitHub repository: provisioning the Azure Bot resource, configuring
the service, running it behind a tunnel, packaging the Teams app, and
verifying the round trip end-to-end.

For the library primitives `msbridge` is built on, see
[Bridge a Threaded Channel to the Agent Team](/docs/libraries/bridge-channels/).

## Prerequisites

- A **Microsoft 365 developer tenant** with an Azure Bot resource registered
  for the Teams channel. The Teams channel must be enabled on the bot
  (Settings → Channels → add Microsoft Teams).
- The Kata Agent Team workflows installed in a GitHub repository (kata-setup
  handles initial setup).
- A GitHub token with `actions:write` on that repository. `libconfig` falls
  back to `gh auth token` when `GH_TOKEN` is not set in `.env`, so
  `gh auth login` is sufficient.
- The `cloudflared` CLI on the host (used by the tunnel sidecar).

## Architecture overview

`msbridge` runs alongside a tunnel sidecar (`mstunnel`) and connects three
ends — the Teams channel via the Bot Framework, the GitHub Actions workflow
via `workflow_dispatch`, and the same Teams thread for the reply:

```text
Teams thread ──webhook── mstunnel ── msbridge ──dispatch──> kata-dispatch
     ▲                                  │
     └────────── callback ──────────────┘
```

The service is built on `@forwardimpact/libbridge` — the channel-agnostic
intake skeleton, callback registry, rate limiter, history bound, prompt
builder, and durable thread state come from the library. msbridge owns the
Bot Framework SDK glue (`botbuilder`), the Teams-shaped response, and the
typing-indicator UX.

## Configure credentials

Set the credentials and service parameters in `.env`. All are loaded via
`createServiceConfig("msbridge")`:

| Env var                            | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `MICROSOFT_APP_ID`                 | Azure Bot app ID                                           |
| `MICROSOFT_APP_PASSWORD`           | Azure Bot app password / secret                            |
| `MICROSOFT_APP_TENANT_ID`          | Azure AD tenant ID                                         |
| `SERVICE_MSBRIDGE_GITHUB_REPO`     | `owner/repo` target for workflow dispatch                  |
| `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` | Public URL the workflow POSTs callbacks back to          |

Discussion context is persisted as JSONL under `data/bridges/msbridge/`
through `libstorage`. The default `createStorage` path is used; no extra
env var is needed.

## Start the bridge

Add `mstunnel` and `msbridge` to `config/config.json` under `init.services`,
in that order, so restarting the bridge does not cycle the tunnel.

Start both services:

```sh
just rc-start
```

The tunnel publishes a fresh `trycloudflare.com` hostname on every restart.
Read it from the tunnel log:

```sh
grep trycloudflare.com data/logs/mstunnel/current
```

Configure two endpoints with that hostname:

1. **Azure Bot messaging endpoint** — in the Azure portal
   (Settings → Configuration), set the endpoint to
   `https://<tunnel-domain>/api/messages`.
2. **Bridge callback URL** — set
   `SERVICE_MSBRIDGE_CALLBACK_BASE_URL=https://<tunnel-domain>` in `.env`
   (no trailing path).

Pick up the callback URL change without recycling the tunnel:

```sh
bunx fit-rc restart msbridge
```

The tunnel hostname survives bridge restarts because the tunnel is a
separate service that restarts independently.

## Package and sideload the Teams app

Build the manifest archive:

```sh
just msbridge-package
```

`just msbridge-package` reads `MICROSOFT_APP_ID` and the tunnel domain
from `.env` via `libconfig` and produces `dist/kata-agent-bridge.zip`
(git-ignored). Override the tunnel domain with `--tunnel-domain=<host>`
when needed. The manifest uses Teams schema v1.17; the package can be
rebuilt and re-uploaded without removing the app from Teams because
Azure Bot routing depends on the messaging endpoint, not the manifest.

Sideload through Teams Admin Center:

1. In [Teams Admin Center](https://admin.teams.microsoft.com/), under
   *Org-wide app settings*, allow interaction with custom apps.
2. Under *Setup policies → Global*, enable *Upload custom apps*.
3. Open Teams → Apps → Manage your apps → **Upload an app** →
   **Upload a custom app** → select `kata-agent-bridge.zip`.
4. Add the app to a team or group chat.

## Verify

You have reached the outcome of this guide when:

- A `@Kata Agent hello` mention in the configured team or chat is
  acknowledged with a randomized status word ("Moonwalking...", "Crafting...",
  "Percolating...") as a typing indicator.
- The bridge dispatches `kata-dispatch.yml` to the configured GitHub
  repository (visible under the repo's Actions tab).
- When the workflow finishes, the facilitator's summary is posted back
  into the same Teams thread.
- `data/bridges/msbridge/` contains a JSONL record per conversation
  (keyed by the Teams conversation ID).

If the workflow dispatch fails, confirm the GitHub token has
`actions:write` on the target repository and check the bridge log for
`api.github.com` errors. If you are on a corporate VPN with tenant
restrictions, outbound calls to Azure AD or GitHub may be blocked;
disconnect or allowlist the relevant endpoints.

## What's next

<div class="grid">

<!-- part:card:dispatch-from-chat -->

</div>
