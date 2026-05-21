# MS Teams Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Microsoft Teams bridge — relay messages between Teams conversations and the Kata
agent team.

<!-- END:description -->

## Prerequisites

- A Microsoft 365 developer tenant with an Azure Bot resource registered
  for the Teams channel — see
  [config-msteams.md § 1–3](../../specs/1200-teams-agent-bridge/config-msteams.md).
- A GitHub token with `actions:write` on `forwardimpact/monorepo`.
- Credentials (`MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`,
  `MICROSOFT_APP_TENANT_ID`, `GH_TOKEN`) and service params
  (`SERVICE_MSTEAMS_CALLBACK_BASE_URL`, `SERVICE_MSTEAMS_GITHUB_REPO`) in
  `.env`. All config is loaded by `libconfig` via
  `createServiceConfig("msteams")`.

## Running

Start the tunnel and bridge in separate terminals:

```sh
just msteams-tunnel   # cloudflared → exposes localhost:3978
just msteams-bridge   # starts the bridge via fit-rc
```

Set the tunnel's public URL as the Azure Bot messaging endpoint:
`https://<tunnel-domain>/api/messages`.

## Packaging the Teams App

```sh
just msteams-package
```

Reads `MICROSOFT_APP_ID` and `SERVICE_MSTEAMS_CALLBACK_BASE_URL` from `.env`
via libconfig. Produces `dist/kata-agent-bridge.zip` (git-ignored) containing
the manifest and placeholder icons. Override the tunnel domain with
`--tunnel-domain=<host>` if needed.

## Sideloading

1. In [Teams Admin Center](https://admin.teams.microsoft.com/policies/manage-apps),
   ensure **Org-wide app settings → Allow interaction with custom apps** is on.
2. In **Setup policies → Global**, ensure **Upload custom apps** is on.
3. Open Teams → Apps → Manage your apps → **Upload an app** →
   **Upload a custom app** → select `kata-agent-bridge.zip`.
4. Add the app to a team or group chat.

## Smoke test

Send `@Kata Agent hello` in the configured team or chat. The bot replies
`"Working on it..."`, triggers an `agent-react.yml` run, and posts the
facilitator's verdict back in the same thread once the session completes.
