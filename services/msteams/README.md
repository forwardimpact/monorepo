# svcmsteams

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Microsoft Teams bridge — relay messages between Teams conversations and the Kata
agent team.

<!-- END:description -->

## Purpose

Engineers whose work happens in Microsoft Teams cannot engage the Kata agent
team without context-switching to GitHub. This service bridges the gap: a
message in a Teams group chat or channel dispatches a facilitate session, and
the facilitator's conclusion is delivered back to the same thread.

The bridge is a **prototype**, runs locally on a developer machine against a
developer/test Microsoft 365 tenant, and has no production deployment story
yet.

## How it works

```
Teams → /api/messages → Bot Framework adapter
      → workflow_dispatch (agent-react.yml) on GitHub
      → fit-eval facilitate session
      → fit-eval callback POST to /api/callback/:token
      → adapter.continueConversationAsync → Teams reply
```

Conversation continuity is in-memory per process. State is lost on restart —
acceptable for a prototype.

## Setup

See [`SETUP.md`](SETUP.md) for the dev environment walkthrough and
[`../../specs/1200-teams-agent-bridge/msteams-config.md`](../../specs/1200-teams-agent-bridge/msteams-config.md)
for the Microsoft Azure / Teams side.

## Run

```sh
cd services/msteams
bun install
node server.js
```

Required environment variables: `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`,
`MICROSOFT_APP_TENANT_ID`, `GH_TOKEN`, `GITHUB_REPO`, `CALLBACK_BASE_URL`.
Optional: `PORT` (default `3978`).

## Tests

```sh
bun test test/*.test.js
```

The Bot Framework adapter and live Teams API are not unit-tested — they
require a live tenant. Tests cover the pure helpers (`buildPrompt`,
`formatReply`) and the in-memory stores.
