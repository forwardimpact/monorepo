---
title: Bridge Microsoft Teams to the Agent Team
description: Stand up the msbridge service so a Teams mention dispatches an agent session and the verdict posts back to the same thread.
---

Engineers discuss work in Microsoft Teams. Their agent team listens on
GitHub. Without a bridge, every interaction forces a context switch. You
open a new tab, file an issue, hand-craft a workflow_dispatch, and paste the
verdict back into Teams when it is done.

The `msbridge` service closes that gap. A user mentions the bot in a Teams
thread. The bridge then dispatches the channel-agnostic agent-dispatch
workflow with the conversation history. It posts the lead's reply back into
the same thread when the workflow finishes.

This guide walks through the operational steps to stand up `msbridge` for a
target GitHub repository. Provision the Azure Bot resource. Configure the
service. Run it behind a tunnel. Package the Teams app. Verify the round
trip end-to-end.

For the library primitives `msbridge` is built on, see
[Bridge a Threaded Channel to the Agent Team](/docs/libraries/bridge-channels/).

## Prerequisites

- A **Microsoft 365 developer tenant** with an Azure Bot resource registered
  for the Teams channel. You must enable the Teams channel on the bot
  (Settings → Channels → add Microsoft Teams).
- An agent-team dispatch workflow installed in a GitHub repository. The
  [Kata agent team](https://www.kata.team/) ships the reference
  implementation.
- A GitHub token with `actions:write` on that repository. `libconfig` falls
  back to `gh auth token` when `GH_TOKEN` is not set in `.env`, so
  `gh auth login` is sufficient.
- The `mstunnel` service available alongside `msbridge`. It publishes the
  bridge's HTTP endpoint to the public internet through `cloudflared`.

## Architecture overview

`msbridge` runs alongside the `mstunnel` sidecar. It connects three ends:
the Teams channel through the Bot Framework, the GitHub Actions workflow
through `workflow_dispatch`, and the same Teams thread for the reply:

```text
Teams thread ──webhook── mstunnel ── msbridge ──dispatch──> agent-dispatch
     ▲                                  │
     └────────── callback ──────────────┘
```

The service builds on `@forwardimpact/libbridge`. The library supplies the
dispatch dance, the callback handler, the callback registry, the rate
limiter, the history bound, and the prompt builder. It also supplies the
lenient payload validator and the acknowledgement lifecycle with the
reaction and the randomized typing-verb ticker.

Durable thread state lives in the shared `services/bridge` gRPC service.
`msbridge` reaches that service through a `BridgeClient`.

Per-user GitHub auth lives in `services/ghuser`. `msbridge` reaches it
through a `GhuserClient`. That auth mints the dispatch token.

`msbridge` owns three Bot Framework adapters in `src/teams.js`:

- `botFrameworkIntake` converts Bot Framework's express-style
  `adapter.process(req, res, cb)` into a Hono request handler.
- `buildReactionAdapter` and `buildTypingAdapter` deliver libbridge's
  acknowledgement actions through the Bot Framework's
  `continueConversationAsync`.
- `sendReply` posts a reply message to the conversation reference saved
  on the discussion context.

## Configure credentials

Set the credentials and service parameters in `.env`.
`createServiceConfig("msbridge")` loads all of them:

| Env var                                       | Purpose                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `MICROSOFT_APP_ID`                            | Azure Bot app ID                                                                                 |
| `MICROSOFT_APP_PASSWORD`                      | Azure Bot app password / secret                                                                  |
| `MICROSOFT_APP_TENANT_ID`                     | Azure AD tenant ID                                                                               |
| `SERVICE_MSBRIDGE_GITHUB_REPO`                | `owner/repo` target for workflow dispatch                                                        |
| `SERVICE_MSBRIDGE_CALLBACK_BASE_URL`          | Public URL the workflow POSTs callbacks back to                                                  |
| `SERVICE_MSBRIDGE_TRUSTED_IDP_ORIGINS`        | Comma-separated `https://…` IdP origins. An empty or unset value is fatal at startup (see [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md)) |
| `SERVICE_MSBRIDGE_LINK_COMPLETION_TICKET_SECRET` | Shared HMAC secret across `ghuser`, `ghbridge`, and `msbridge` (≥32 CSPRNG bytes). See [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for rotation |

The shared `services/bridge` gRPC service persists the discussion context
at `data/bridges/discussions.jsonl`. `msbridge` calls `bridge` through a
`BridgeClient` channel. You need no per-bridge storage configuration.
`services/ghuser` persists per-user GitHub link state under `data/ghuser/`
in the same way, and `msbridge` reaches it through a `GhuserClient`. Add
both `bridge` and `ghuser` to `config/config.json` under `init.services`
ahead of `msbridge` so they start first.

## Start the bridge

Add `mstunnel` and `msbridge` to `config/config.json` under `init.services`,
in that order. A bridge restart then does not cycle the tunnel. Declaration
order determines the restart scope.

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

1. **Azure Bot messaging endpoint.** In the Azure portal, under
   Settings → Configuration, set the endpoint to
   `https://<tunnel-domain>/api/messages`.
2. **Bridge callback URL.** Set
   `SERVICE_MSBRIDGE_CALLBACK_BASE_URL=https://<tunnel-domain>` in `.env`.
   Add no trailing path. The bridge composes
   `/api/callback/<tenant_id>/<token>` itself. In a single-tenant
   deployment the tenant is `default`. The bridge also strips any trailing
   slashes with `normalizeBaseUrl`.

Restart only the bridge to pick up the callback URL change:

```sh
npx fit-rc restart msbridge
```

The tunnel hostname survives bridge restarts because `mstunnel` is a
separate service in `config/config.json`. `fit-rc restart msbridge` only
restarts the services listed after the tunnel.

## Package and sideload the Teams app

Build the manifest archive:

```sh
just msbridge-package
```

The recipe reads `MICROSOFT_APP_ID` and the tunnel domain from `.env` with
`libconfig`. It writes the archive to the `--output` path, which defaults
to a git-ignored file under `dist/`. Override the tunnel domain with
`--tunnel-domain=<host>` when needed.

The manifest uses Teams schema v1.17. It also carries the bot's display
name, which becomes the mention your users type in Teams.

You can rebuild the package, re-upload it, and keep the app in Teams. Azure
Bot routes on the messaging endpoint. It does not route on the manifest
contents.

Sideload through Teams Admin Center:

1. In [Teams Admin Center](https://admin.teams.microsoft.com/), under
   *Org-wide app settings*, allow interaction with custom apps.
2. Under *Setup policies → Global*, enable *Upload custom apps*.
3. Open Teams → Apps → Manage your apps → **Upload an app** →
   **Upload a custom app** → select the archive you built.
4. Add the app to a team or group chat.

## Verify

You have reached the outcome of this guide when:

- The bridge acknowledges a mention of the configured bot in the configured
  team or chat. It adds a `like` reaction on the user's message. It also
  posts a randomized typing verb into the thread (`"Moonwalking..."`,
  `"Unravelling..."`, `"Tempering..."`, `"Crafting..."`, `"Simmering..."`,
  `"Percolating..."`, `"Decoding..."`) and refreshes it every ~25 seconds.
- The bridge dispatches its configured dispatch workflow to the configured
  GitHub repository (visible under the repo's Actions tab).
- When the workflow finishes, the bridge posts the agent team's `replies`
  back into the same Teams thread, one message per reply. It also removes
  the `like` reaction.
- `data/bridges/discussions.jsonl` contains a JSONL record per
  conversation, keyed by `msteams:<conversation-id>`. The `bridge` service
  writes each record when `msbridge` calls `SaveDiscussion`.

If the workflow dispatch fails, the bridge posts `Failed to reach the
agent team. Please try again later.` into the thread. Confirm the GitHub
token has `actions:write` on the target repository. Check the bridge log
for `api.github.com` errors. A corporate VPN with tenant restrictions may
block outbound calls to Azure AD or GitHub. Disconnect, or allowlist the
relevant endpoints.

## What's next

<div class="grid">

<!-- part:card:dispatch-from-chat -->

</div>
