---
title: Bridge Microsoft Teams to the Agent Team
description: Stand up the msbridge service so a Teams mention dispatches a Kata session and the verdict posts back to the same thread.
---

Engineers discuss work in Microsoft Teams. The Kata agent team listens on
GitHub. Without a bridge, every interaction means context-switching: open a
new tab, file an issue, hand-craft a workflow_dispatch, paste the verdict
back into Teams when it's done. The `msbridge` service closes that gap. A
user mentions the bot in a Teams thread, the bridge dispatches the
channel-agnostic `kata-dispatch.yml` workflow with the conversation history,
and posts the lead's reply back into the same thread when the workflow
finishes.

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
- The Kata Agent Team workflows installed in a GitHub repository.
- A GitHub token with `actions:write` on that repository. `libconfig` falls
  back to `gh auth token` when `GH_TOKEN` is not set in `.env`, so
  `gh auth login` is sufficient.
- The `mstunnel` service available alongside `msbridge` to publish the
  bridge's HTTP endpoint to the public internet (uses `cloudflared` under
  the hood).

## Architecture overview

`msbridge` runs alongside the `mstunnel` sidecar and connects three ends —
the Teams channel via the Bot Framework, the GitHub Actions workflow via
`workflow_dispatch`, and the same Teams thread for the reply:

```text
Teams thread ──webhook── mstunnel ── msbridge ──dispatch──> kata-dispatch
     ▲                                  │
     └────────── callback ──────────────┘
```

The service is built on `@forwardimpact/libbridge`. The dispatch dance,
callback handler, callback registry, rate limiter, history bound, prompt
builder, lenient payload validator, and the acknowledgement lifecycle
(reaction + randomized typing-verb ticker) all come from the library.
Durable thread state lives in the shared `services/bridge` gRPC service,
which `msbridge` reaches through a `BridgeClient`. Per-user GitHub auth
(used to mint the dispatch token) lives in `services/ghuser`, reached
through a `GhuserClient`. `msbridge` owns three Bot Framework adapters in
`src/teams.js`:

- `botFrameworkIntake` — converts Bot Framework's express-style
  `adapter.process(req, res, cb)` into a Hono request handler.
- `buildReactionAdapter` / `buildTypingAdapter` — deliver libbridge's
  acknowledgement actions through the Bot Framework's
  `continueConversationAsync`.
- `sendReply` — posts a reply message to the conversation reference saved
  on the discussion context.

## Configure credentials

Set the credentials and service parameters in `.env`. All are loaded via
`createServiceConfig("msbridge")`:

| Env var                                       | Purpose                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `MICROSOFT_APP_ID`                            | Azure Bot app ID                                                                                 |
| `MICROSOFT_APP_PASSWORD`                      | Azure Bot app password / secret                                                                  |
| `MICROSOFT_APP_TENANT_ID`                     | Azure AD tenant ID                                                                               |
| `SERVICE_MSBRIDGE_GITHUB_REPO`                | `owner/repo` target for workflow dispatch                                                        |
| `SERVICE_MSBRIDGE_CALLBACK_BASE_URL`          | Public URL the workflow POSTs callbacks back to                                                  |
| `SERVICE_MSBRIDGE_TRUSTED_IDP_ORIGINS`        | Comma-separated `https://…` IdP origins; empty / unset is fatal at startup (see [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)) |
| `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET` | Shared HMAC secret across `ghuser`, `ghbridge`, and `msbridge` (≥32 CSPRNG bytes); see [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for rotation |

Discussion context is persisted by the shared `services/bridge` gRPC
service at `data/bridges/discussions.jsonl`. `msbridge` calls `bridge`
through a `BridgeClient` channel — no per-bridge storage configuration
is needed. `services/ghuser` similarly persists per-user GitHub link
state under `data/ghuser/` and is reached through a `GhuserClient`. Add
both `bridge` and `ghuser` to `config/config.json` under `init.services`
ahead of `msbridge` so they start first.

## Start the bridge

Add `mstunnel` and `msbridge` to `config/config.json` under `init.services`,
in that order, so restarting the bridge does not cycle the tunnel
(declaration order determines restart scope).

Start both services:

```sh
npx fit-rc start
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
   (no trailing path; the bridge composes
   `/api/callback/<tenant_id>/<token>` itself — `default` is the tenant
   in single-tenant deployments — and strips any trailing slashes via
   `normalizeBaseUrl`).

Pick up the callback URL change without recycling the tunnel:

```sh
npx fit-rc restart msbridge
```

The tunnel hostname survives bridge restarts because `mstunnel` is a
separate service in `config/config.json` and `fit-rc restart msbridge`
only restarts services listed after the tunnel.

## Package and sideload the Teams app

Build the manifest archive:

```sh
just msbridge-package
```

The recipe reads `MICROSOFT_APP_ID` and the tunnel domain from `.env` via
`libconfig` and produces `dist/kata-agent-bridge.zip` (git-ignored).
Override the tunnel domain with `--tunnel-domain=<host>` when needed. The
manifest uses Teams schema v1.17; the package can be rebuilt and
re-uploaded without removing the app from Teams because Azure Bot routing
depends on the messaging endpoint, not the manifest contents.

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
  acknowledged with both a `like` reaction on the user's message and a
  randomized typing verb posted into the thread (`"Moonwalking..."`,
  `"Unravelling..."`, `"Tempering..."`, `"Crafting..."`, `"Simmering..."`,
  `"Percolating..."`, `"Decoding..."`) refreshed every ~25 seconds.
- The bridge dispatches `kata-dispatch.yml` to the configured GitHub
  repository (visible under the repo's Actions tab).
- When the workflow finishes, the facilitator's `replies` are posted back
  into the same Teams thread (one message per reply) and the `like`
  reaction is removed.
- `data/bridges/discussions.jsonl` contains a JSONL record per
  conversation, keyed by `msteams:<conversation-id>` and written by the
  `bridge` service when `msbridge` calls `SaveDiscussion`.

If the workflow dispatch fails, the bridge posts `Failed to reach the
agent team. Please try again later.` into the thread; confirm the GitHub
token has `actions:write` on the target repository and check the bridge
log for `api.github.com` errors. If you are on a corporate VPN with
tenant restrictions, outbound calls to Azure AD or GitHub may be
blocked; disconnect or allowlist the relevant endpoints.

## What's next

<div class="grid">

<!-- part:card:dispatch-from-chat -->

</div>
