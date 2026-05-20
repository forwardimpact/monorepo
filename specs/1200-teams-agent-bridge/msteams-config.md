# Microsoft Teams Configuration — Spec 1200

Step-by-step configuration required on the Microsoft side before the bridge
service can connect. Everything below targets a **single-tenant developer
environment** — no organizational publishing, no multi-tenant Azure AD
setup.

This guide covers only the Microsoft/Azure side. The bridge service code
lives at `services/msteams/` — see that directory's `SETUP.md` for
installation and startup instructions.

## Prerequisites

- A Microsoft 365 developer tenant. Free via the
  [Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)
  (provides a renewable E5 sandbox with 25 user licenses).
- An Azure subscription linked to the same tenant. The developer program
  tenant comes with an Azure AD directory; create a free Azure subscription
  under it if one does not exist.
- Global admin or application admin role on the tenant (the developer
  program tenant grants this by default).
- A dev tunnel tool: [VS Code Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/)
  (`devtunnel` CLI) or [ngrok](https://ngrok.com/).

## 1. Azure AD App Registration

The bot authenticates to the Bot Framework using an Azure AD (Entra ID)
app registration. This produces the `MICROSOFT_APP_ID`,
`MICROSOFT_APP_PASSWORD`, and `MICROSOFT_APP_TENANT_ID` the bridge needs.

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Click **New registration**.
3. Configure:
   - **Name:** `Kata Agent Bridge` (or any descriptive name).
   - **Supported account types:** Select **Accounts in this organizational
     directory only** (single tenant).
   - **Redirect URI:** Leave blank (not needed for bot authentication).
4. Click **Register**.
5. On the overview page, copy the **Application (client) ID** — this is
   `MICROSOFT_APP_ID`.
6. Copy the **Directory (tenant) ID** — this is `MICROSOFT_APP_TENANT_ID`.
   Required for single-tenant bot authentication;
   `ConfigurationBotFrameworkAuthentication` defaults to multi-tenant
   validation when the tenant ID is absent, causing all inbound activities
   to fail with 401.

### Create a client secret

1. In the app registration, go to **Certificates & secrets**.
2. Click **New client secret**.
3. Set a description (`bridge-dev`) and expiration (e.g. 6 months).
4. Click **Add**.
5. Copy the secret **Value** immediately (it is shown only once) — this is
   `MICROSOFT_APP_PASSWORD`.

### API permissions

The default `User.Read` permission (delegated, Microsoft Graph) is added
automatically by Azure but is not used by the bot. The bot uses app-level
authentication through the Bot Framework, not Graph API calls. No
additional API permissions are required.

Do **not** add application permissions unless the bridge later needs to
call the Graph API directly (e.g. to look up user profiles).

## 2. Azure Bot Resource

The Azure Bot resource connects the app registration to the Bot Framework
and registers the messaging endpoint (the URL where Teams sends activities).

1. Go to [Azure Portal → Create a resource](https://portal.azure.com/#create/hub)
   and search for **Azure Bot** (may appear as **Azure AI Bot Service** in
   some portal regions).
2. Click **Create**.
3. Configure:
   - **Bot handle:** `kata-agent-bridge` (globally unique identifier).
   - **Subscription / Resource group:** Use an existing group or create
     `rg-kata-bridge-dev`.
   - **Pricing tier:** **F0 (Free)** — 10,000 messages/month, sufficient
     for development.
   - **Type of app:** **Single Tenant**.
   - **Creation type:** **Use existing app registration**.
   - **App ID:** Paste the `MICROSOFT_APP_ID` from § 1.
   - **App tenant ID:** Paste `MICROSOFT_APP_TENANT_ID` from § 1.
4. Click **Review + Create**, then **Create**.

### Configure the messaging endpoint

The messaging endpoint is the public URL where the Bot Framework delivers
activities to the bridge. It must be HTTPS and publicly reachable.

1. In the Azure Bot resource, go to **Settings → Configuration** (the
   Configuration blade is under the Settings group in the left nav).
2. Set **Messaging endpoint** to:
   ```
   https://<your-tunnel-domain>/api/messages
   ```
   Replace `<your-tunnel-domain>` with the tunnel's public hostname (set up
   in § 4 below). This URL can be updated at any time when the tunnel
   restarts with a new domain.

### Enable the Teams channel

1. In the Azure Bot resource, go to **Channels**.
2. Click **Microsoft Teams** (the Teams icon).
3. Accept the Terms of Service.
4. Leave all settings at their defaults (Messaging enabled, Calling
   disabled).
5. Click **Apply**.

The bot is now registered with Teams but not yet installed in any
conversation. That happens in § 3.

## 3. Teams App Package (Sideloading)

The bot must be packaged as a Teams app and sideloaded into the developer
tenant. Sideloading allows installing custom apps without publishing to the
Teams App Store.

### Enable sideloading on the tenant

Two toggles must be on — missing either one causes sideloading to silently
fail:

1. **Org-wide setting:**
   Go to [Teams Admin Center → Teams apps → Manage apps](https://admin.teams.microsoft.com/policies/manage-apps).
   Click **Org-wide app settings** (top bar). Ensure **Allow interaction
   with custom apps** is toggled **On**. Save.

2. **Setup policy:**
   Go to [Teams Admin Center → Teams apps → Setup policies](https://admin.teams.microsoft.com/policies/app-setup).
   Click the **Global (Org-wide default)** policy. Ensure **Upload custom
   apps** (also labeled **Allow users to upload custom apps**) is toggled
   **On**. Save.

Changes can take up to 24 hours to propagate (usually minutes in a
developer tenant). To verify propagation: open Teams → Apps → Manage your
apps — the **Upload an app** button should be visible.

### Create the app manifest

Create a directory for the app package with three files:

**`manifest.json`:**

```json
{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  "manifestVersion": "1.17",
  "version": "0.1.0",
  "id": "<MICROSOFT_APP_ID>",
  "packageName": "com.forwardimpact.kata-agent-bridge",
  "developer": {
    "name": "Forward Impact",
    "websiteUrl": "https://www.forwardimpact.team",
    "privacyUrl": "https://www.forwardimpact.team/privacy",
    "termsOfUseUrl": "https://www.forwardimpact.team/terms"
  },
  "name": {
    "short": "Kata Agent",
    "full": "Kata Agent Team Bridge"
  },
  "description": {
    "short": "Invoke the Kata agent team from Teams",
    "full": "Bridge between Microsoft Teams and the Kata agent team. Send a message to get the facilitator's conclusion back in the same thread."
  },
  "icons": {
    "outline": "outline.png",
    "color": "color.png"
  },
  "accentColor": "#4F46E5",
  "bots": [
    {
      "botId": "<MICROSOFT_APP_ID>",
      "scopes": ["team", "groupChat"],
      "supportsFiles": false,
      "isNotificationOnly": false
    }
  ],
  "permissions": ["messageTeamMembers"],
  "validDomains": ["<your-tunnel-domain>"]
}
```

Replace both `<MICROSOFT_APP_ID>` placeholders with the Application
(client) ID from § 1. Replace `<your-tunnel-domain>` with the tunnel
hostname from § 4 (e.g. `abc123.use2.devtunnels.ms`). Update
`validDomains` whenever the tunnel domain changes.

**Scopes:** `team` (channel conversations) and `groupChat` (group chats).
`personal` (1:1 chat with the bot) is excluded — the spec targets group
contexts only. When adding to a team, the Teams UI may offer "Also open"
for a personal tab — ignore this; the bot has no personal tab.

**`color.png`:** 192x192 PNG icon (full color). For development, generate a
solid-color placeholder:

```sh
# Using ImageMagick
convert -size 192x192 xc:'#4F46E5' color.png

# Or using Python (Pillow)
python3 -c "from PIL import Image; Image.new('RGB',(192,192),(79,70,229)).save('color.png')"

# Or use any 192x192 PNG file
```

**`outline.png`:** 32x32 PNG icon (white on transparent background):

```sh
convert -size 32x32 xc:white outline.png
```

### Package and sideload

1. Zip the three files (`manifest.json`, `color.png`, `outline.png`) into
   a file named `kata-agent-bridge.zip`. The files must be at the root of
   the zip — no subdirectory.

   ```sh
   zip kata-agent-bridge.zip manifest.json color.png outline.png
   ```

2. Open Microsoft Teams (desktop or web client).
3. Go to **Apps** (left sidebar) → **Manage your apps** → **Upload an app**.
4. Select **Upload a custom app** and choose `kata-agent-bridge.zip`.
5. Teams shows the app details. Click **Add**.
6. Choose where to install:
   - **Add to a team** — select a team and channel.
   - **Add to a chat** — select a group chat.

The bot now appears as a member of the selected team/chat. Users invoke it
by @mentioning: `@Kata Agent <message>`.

## 4. Dev Tunnel Setup

The bridge runs on `localhost:3978`. A single tunnel exposes both the Bot
Framework messaging endpoint (`/api/messages`) and the GitHub Actions
callback webhook (`/api/callback/:token`) to the public internet. Both the
Bot Framework connector and GitHub Actions POST to the same tunnel domain.

### Option A: VS Code Dev Tunnels (`devtunnel` CLI)

```sh
# Install (macOS/Linux)
curl -sL https://aka.ms/DevTunnelCliInstall | bash

# Login (uses the Microsoft account linked to the dev tenant)
devtunnel user login

# Create a persistent tunnel (--allow-anonymous is required because the
# Bot Framework connector does not pass tunnel auth credentials)
devtunnel create kata-bridge --allow-anonymous

# Map port 3978
devtunnel port create kata-bridge --port-number 3978

# Start the tunnel
devtunnel host kata-bridge
```

`--allow-anonymous` allows unauthenticated access to the tunnel endpoints.
This is acceptable for development: the Bot Framework messaging endpoint is
protected by JWT token validation (the adapter verifies tokens signed by
the Bot Framework connector), and the callback endpoint is protected by
capability URLs (unguessable token in the path). Do **not** use anonymous
tunnels in non-prototype contexts.

The output shows the public URL, e.g.
`https://abc123.use2.devtunnels.ms`. Use this as:
- **Messaging endpoint** in the Azure Bot resource (§ 2):
  `https://abc123.use2.devtunnels.ms/api/messages`
- **`CALLBACK_BASE_URL`** environment variable (§ 5):
  `https://abc123.use2.devtunnels.ms`
- **`validDomains`** in manifest.json (§ 3):
  `abc123.use2.devtunnels.ms`

### Option B: ngrok

```sh
ngrok http 3978
```

Copy the `https://...ngrok-free.app` forwarding URL. Same three uses as
above. Free ngrok URLs change on every restart — when the URL changes,
update all three locations:

1. Azure Bot messaging endpoint (§ 2).
2. `CALLBACK_BASE_URL` environment variable — restart the bridge.
3. `validDomains` in manifest.json — re-zip and re-upload the app package.

## 5. Environment Variables Summary

After completing sections 1–4, set these environment variables before
starting the bridge:

| Variable | Source | Example |
|---|---|---|
| `MICROSOFT_APP_ID` | § 1 — App registration overview → Application (client) ID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `MICROSOFT_APP_PASSWORD` | § 1 — Certificates & secrets → client secret Value | `abc~DEF123...` |
| `MICROSOFT_APP_TENANT_ID` | § 1 — App registration overview → Directory (tenant) ID | `f1e2d3c4-b5a6-7890-abcd-ef1234567890` |
| `GH_TOKEN` | GitHub PAT or App token with `actions:write` scope only | `ghp_xxxx` |
| `GITHUB_REPO` | `owner/repo` format | `forwardimpact/monorepo` |
| `CALLBACK_BASE_URL` | § 4 — tunnel public URL (no trailing slash) | `https://abc123.use2.devtunnels.ms` |
| `PORT` | Optional, defaults to `3978` | `3978` |

For `GH_TOKEN`, create a fine-grained PAT scoped to the target repository
with only the **Actions (write)** permission. Avoid using classic PATs with
broad `repo` scope.

Quick check that all required vars are set:

```sh
node -e "for (const v of ['MICROSOFT_APP_ID','MICROSOFT_APP_PASSWORD','MICROSOFT_APP_TENANT_ID','GH_TOKEN','GITHUB_REPO','CALLBACK_BASE_URL']) if (!process.env[v]) { console.error('Missing: ' + v); process.exit(1); }; console.log('All set')"
```

## 6. Verification Checklist

After all configuration is complete:

- [ ] App registration exists with a client secret that has not expired.
- [ ] Azure Bot resource shows the Teams channel as **Configured** (in the
      Channels blade).
- [ ] Messaging endpoint in the Azure Bot Configuration blade matches the
      running tunnel URL + `/api/messages`.
- [ ] Both sideloading toggles are on (org-wide custom apps + setup policy
      upload).
- [ ] The app package is installed in at least one team or group chat.
- [ ] The tunnel is running and forwarding to `localhost:3978`.
- [ ] All environment variables pass the quick-check script above.
- [ ] `node server.js` starts without error and logs the listening port.
- [ ] Sending `@Kata Agent hello` in the configured team/chat produces a
      `"Working on it..."` reply in the same thread.
- [ ] After the workflow completes, a reply with the facilitator's verdict
      and summary appears in the same Teams thread.
- [ ] Sending a follow-up message in the same thread triggers a new
      workflow run whose prompt includes prior conversation context.

## Troubleshooting

**Bot does not respond to `@Kata Agent hello`:**

1. Verify the tunnel is running: `curl -s https://<tunnel>/api/messages`
   should return a 405 (Method Not Allowed — the endpoint only accepts
   POST). If it times out, the tunnel is not forwarding.
2. Check the messaging endpoint in Azure Bot Configuration — it must
   exactly match `https://<tunnel>/api/messages`.
3. Verify `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`, and
   `MICROSOFT_APP_TENANT_ID` are correct. Wrong credentials cause the Bot
   Framework adapter to silently reject incoming activities (returns 401 to
   the Bot Framework connector; no error is visible in Teams).
4. Check the bridge's console output for errors. If no request arrives at
   all, the messaging endpoint or tunnel is misconfigured.
5. Verify the app is sideloaded in the specific team/chat you are testing
   in (Apps → Manage your apps → check the install list).
6. Wait for sideloading policy propagation if the app was just uploaded.

**`"Working on it..."` appears but no facilitator response arrives:**

1. Check `CALLBACK_BASE_URL` — it must be the tunnel's public URL, not
   `http://localhost:3978`. GitHub Actions cannot reach localhost.
2. Verify `GH_TOKEN` has `actions:write` scope and the token has not
   expired.
3. Check the GitHub Actions workflow run log — confirm the workflow was
   triggered and the "Deliver callback" step ran.
4. If the "Deliver callback" step shows "unknown command: callback", the
   published `fit-eval` version does not yet include the `callback`
   command. See plan-a.md § Risks (libeval publish timing).

**Manifest upload fails:**

1. Ensure all three files (`manifest.json`, `color.png`, `outline.png`)
   are at the zip root — not inside a subdirectory.
2. Validate the manifest against the schema: paste it into the
   [Teams App Validation Tool](https://dev.teams.microsoft.com/appvalidation.html)
   or use `npx @microsoft/teamsfx-cli validate`.
3. Check that `<MICROSOFT_APP_ID>` placeholders were replaced with the
   actual Application (client) ID.
4. Verify icon dimensions: `color.png` must be exactly 192x192,
   `outline.png` must be exactly 32x32.

## Credential Rotation

- **Client secret** expires per the configured lifetime (max 24 months).
  Create a new secret first, update `MICROSOFT_APP_PASSWORD`, verify the
  bridge works, then delete the old secret (zero-downtime rotation).
- **GitHub token** — if using a fine-grained PAT, note the expiration date
  and create a replacement before it expires (GitHub → Settings → Developer
  settings → Personal access tokens). GitHub App installation tokens
  auto-rotate.
- **Tunnel URL** — free ngrok URLs change on restart. Dev Tunnels with a
  named tunnel persist the URL across restarts. When the tunnel URL
  changes, update all three locations: Azure Bot messaging endpoint,
  `CALLBACK_BASE_URL` env var (restart the bridge), and `validDomains` in
  the manifest (re-zip and re-upload).

## Tenant Cleanup

To remove the prototype from the tenant:

1. Uninstall the app from all teams/chats (Teams → Apps → Manage your
   apps → Remove).
2. Delete the Azure Bot resource.
3. Delete the app registration (Azure Portal → App registrations →
   select → Delete).
4. Optionally delete the resource group (`rg-kata-bridge-dev`).
5. Revoke the GitHub PAT if one was created specifically for this prototype
   (GitHub → Settings → Developer settings → Personal access tokens →
   Delete).
