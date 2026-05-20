# Setup — Microsoft Teams Bridge

This guide walks through running the bridge service on a developer machine
against a developer/test Microsoft 365 tenant. The Microsoft-side
configuration (Azure AD app registration, Azure Bot, Teams app manifest,
sideloading) lives in
[`specs/1200-teams-agent-bridge/msteams-config.md`](../../specs/1200-teams-agent-bridge/msteams-config.md).
Complete that guide first — the values it produces are the inputs to this
one.

## Prerequisites

- Node.js 18 or newer. The bridge **server** is started with `node
  server.js` — `botbuilder` ships CommonJS only and the Bot Framework
  adapter has historically been brittle under Bun's CJS interop. Bun is
  fine for running the test suite (`bun test`) — the tests cover pure
  helpers and stores, not the live adapter.
- A Microsoft 365 developer tenant with an Azure Bot resource registered
  for the Teams channel — see
  [msteams-config.md § 1–3](../../specs/1200-teams-agent-bridge/msteams-config.md).
- A dev tunnel tool (VS Code Dev Tunnels or ngrok) — see
  [msteams-config.md § 4](../../specs/1200-teams-agent-bridge/msteams-config.md).
- A GitHub token with `actions:write` on `forwardimpact/monorepo`
  (fine-grained PAT or GitHub App installation token).

## Environment variables

| Variable | Source | Notes |
|---|---|---|
| `MICROSOFT_APP_ID` | Azure AD app registration → Application (client) ID | UUID |
| `MICROSOFT_APP_PASSWORD` | Azure AD app registration → client secret value | shown once at creation |
| `MICROSOFT_APP_TENANT_ID` | Azure AD app registration → Directory (tenant) ID | required for single-tenant validation |
| `GH_TOKEN` | GitHub PAT or App token | `actions:write` only |
| `GITHUB_REPO` | `owner/repo` | typically `forwardimpact/monorepo` |
| `CALLBACK_BASE_URL` | Dev tunnel public URL | no trailing slash |
| `PORT` | Optional | defaults to `3978` |

Quick check that everything is set:

```sh
node -e "for (const v of ['MICROSOFT_APP_ID','MICROSOFT_APP_PASSWORD','MICROSOFT_APP_TENANT_ID','GH_TOKEN','GITHUB_REPO','CALLBACK_BASE_URL']) if (!process.env[v]) { console.error('Missing: ' + v); process.exit(1); }; console.log('All set')"
```

## Install and run

```sh
cd services/msteams
bun install
node server.js
```

The bridge logs `Teams bridge listening on port 3978` once it is ready.

## Start the dev tunnel

The bridge needs a publicly reachable HTTPS URL for two endpoints:

1. `POST /api/messages` — Bot Framework messaging endpoint (called by Teams)
2. `POST /api/callback/:token` — Callback webhook (called by GitHub Actions)

Both endpoints live on the same port. One tunnel covers both:

```sh
# VS Code Dev Tunnels (persistent named tunnel)
devtunnel host kata-bridge

# or ngrok (URL changes on every restart)
ngrok http 3978
```

Copy the public URL into:

- `CALLBACK_BASE_URL` (and restart the bridge)
- The Azure Bot resource's messaging endpoint:
  `https://<tunnel-domain>/api/messages`
- The Teams app manifest's `validDomains` (re-zip and re-upload if it
  changed) — see
  [msteams-config.md § 3](../../specs/1200-teams-agent-bridge/msteams-config.md).

## Smoke test

1. In the team or group chat where the app is installed, send
   `@Kata Agent hello`.
2. The bot replies `"Working on it..."` in the same thread within a few
   seconds.
3. Open the
   [agent-react.yml workflow runs](https://github.com/forwardimpact/monorepo/actions/workflows/agent-react.yml)
   and confirm a new run triggered by the bridge with the message text as
   the prompt input.
4. When the facilitate session completes, a reply containing
   `**<verdict>** — <summary>` arrives in the same Teams thread.
5. Send a follow-up message in the same thread — verify the workflow's
   prompt input now contains both the original message and the prior
   summary.

## Troubleshooting

See
[msteams-config.md § Troubleshooting](../../specs/1200-teams-agent-bridge/msteams-config.md)
for the most common failure modes (bot not responding, callback timing out,
manifest upload errors). The bridge's own console output (stdout) is the
primary diagnostic channel for the local process.

## Limitations

The prototype is intentionally minimal:

- **Single process, single tenant.** No clustering, no multi-tenant support.
- **In-memory state.** Conversation history is lost when the bridge
  restarts.
- **No rich formatting.** Plain text only — no Adaptive Cards, files, or
  images.
- **No streaming.** The reply arrives after the facilitate session
  concludes, not as partial output.
- **No retry/backoff.** A failed GitHub dispatch or callback POST is
  surfaced as an error message; the user re-sends the request manually.
