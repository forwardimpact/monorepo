# MS Teams Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Microsoft Teams bridge onto libbridge — relay messages between Teams
conversations and the Kata agent team.

<!-- END:description -->

For the trust model when this bridge runs as the hosted Forward Impact
service vs the customer's self-hosted deployment, see
[TRUST.md](../../TRUST.md).

For configuring the Azure AD (Entra) app behind this bridge (self-hosted
single-tenant vs hosted multi-tenant), see [azure-app.md](azure-app.md).

## Prerequisites

- A Microsoft 365 developer tenant with an Azure Bot resource registered
  for the Teams channel — see
  [config-msteams.md § 1–3](../../specs/1200-teams-agent-bridge/config-msteams.md).
- The **Microsoft Teams channel** must be enabled on the Azure Bot resource
  (Settings → Channels → add Microsoft Teams).
- The `ghuser` service running and reachable (provides per-user GitHub
  tokens for dispatch). Each user who triggers a dispatch must have linked
  their GitHub account through the OAuth flow — the bridge prompts on the
  channel when a link is missing.

### Dependencies

| Service | Why |
| --- | --- |
| `bridge` | Canonical discussion and origin store (gRPC) |
| `ghuser` | Per-user GitHub token for `workflow_dispatch` |

Discussion state is owned by `services/bridge`; the bridge talks to it
over gRPC and keeps no on-disk discussion state of its own. Operators
upgrading from a bridge that predates this service can safely delete
legacy `data/bridges/msbridge/` files; they expire under their existing
24-hour TTL regardless.

## Tenancy mode

`SERVICE_MSBRIDGE_TENANCY_MODE` selects the deployment shape:

- **`single`** (default, self-hosted) — the Bot Framework authenticator runs
  in `SingleTenant` mode bound to the static `MICROSOFT_APP_TENANT_ID`; the
  literal tenant id `default` threads through every `services/bridge` RPC via
  a `DefaultTenantResolver`. Per-user OAuth (`services/ghuser`) supplies the
  `workflow_dispatch` credential.
- **`multi`** (hosted) — the Bot Framework authenticator runs in Microsoft's
  documented **`MultiTenant`** mode: `MicrosoftAppType` is `MultiTenant` and
  `MICROSOFT_APP_TENANT_ID` is omitted, so the SDK accepts JWTs issued by any
  consenting Entra tenant. Each inbound activity's Entra tenant id
  (`channelData.tenant.id`) resolves to a registry tenant; non-active
  (`pending_consent`) tenants are rejected. The GitHub `workflow_dispatch`
  credential shifts from per-user OAuth to a repo-scoped App installation
  token minted by `services/ghserver` for the resolved tenant repo — so
  hosted workflow commits are authored as the App, not the human dispatcher.
  The Bot Framework reply credential stays in process.

### Multi-tenant onboarding

1. A tenant adds the Teams app → Bot Framework fires `installationUpdate`
   (`action = add`) → the consent handler registers the tenant
   `pending_consent` in `services/tenancy`, keyed by the Entra tenant id.
2. The customer calls `POST /onboard` with `{ repo: { owner, name } }`. The
   handler verifies the caller's Entra `tid` (signature-bound via the injected
   `authenticateTenant` verifier), then resolves-and-transitions that `tid`'s
   registry row in one state-agnostic upsert: `UpsertByChannelKey({ channel:
   "msteams", channel_tenant_key: tid, state: "active" })` finds the
   `pending_consent` row by `(channel, key)` regardless of state, flips it
   `active`, and returns its registry `tenant_id` (a UUID). The repo is then
   bound to that UUID via `SetRepo`. An active-only resolve would never see the
   `pending_consent` row, so the upsert is what makes the consent → active
   transition reachable. The `tid` and the registry `tenant_id` live in
   different id-spaces; the channel key comes only from the authenticated `tid`
   and the UUID comes only from the resolved row, so a body-supplied registry
   id is never trusted. A `tid` with no prior consent row is created fresh as
   `active`, since the `tid` is signature-bound (the caller provably owns that
   Entra tenant).

The injected `authenticateTenant` verifier validates the inbound Bot Framework
bearer JWT through the same `ConfigurationBotFrameworkAuthentication` the
`/api/messages` path uses (one SDK validation path), so the caller's `tid` is
cryptographically proven. A request whose `tid` is proven onboards as above; an
absent or forged proof returns 401 before any registry read. The caller must
present a Bot Framework-issued bearer token whose audience is the bot's
`MICROSOFT_APP_ID` — a Graph or Entra user token is rejected. The
resolved-`tid` → registry-row → `SetRepo` contract is exercised by
`test/onboard-handler.test.js` and the verifier by `test/onboard-verifier.test.js`.

### Documented limitation: multi-tenant elapsed-recess re-arm on restart

In `single` mode, the bridge re-arms time-based (`elapsed`-trigger) recesses at
startup via `ResumeScheduler.rearm()`, which reads the open recesses for the
one tenant (`default`). In `multi` mode there is no single tenant at boot and
the registry exposes no cross-tenant enumeration of open recesses, so `rearm()`
returns nothing. A hosted bridge that restarts while an `elapsed` recess is
pending therefore does not fire that recess on a timer; instead, multi-tenant
`elapsed`-trigger recesses re-arm lazily on the next inbound activity on the
thread (the resume lifecycle runs through `processInbound`). `missing_input`
recesses are unaffected — they resume on the next reply regardless of restart.
Self-hosted (`single`) re-arm behaviour is unchanged.

### Multi-tenant dependencies

| Service | Why |
| --- | --- |
| `services/tenancy` | Tenant registry — consent registration, Entra-tid → tenant resolution, repo mapping |
| `services/ghserver` | Mints repo-scoped App installation tokens for the hosted `workflow_dispatch` |

### Configuration

Loaded via `createServiceConfig("msbridge")`:

| Env var | Purpose |
| --- | --- |
| `SERVICE_MSBRIDGE_URL` | Listen URL (default `http://localhost:3014`) |
| `SERVICE_MSBRIDGE_GITHUB_REPO` | `owner/repo` target |
| `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` | Public URL the workflow POSTs callbacks to |
| `SERVICE_GHUSER_URL` | gRPC address of the ghuser service |
| `MICROSOFT_APP_ID` | Azure Bot application id |
| `MICROSOFT_APP_PASSWORD` | Azure Bot client secret |
| `MICROSOFT_APP_TENANT_ID` | Azure AD tenant id (omitted in `multi` mode) |
| `SERVICE_MSBRIDGE_TENANCY_MODE` | `single` (default) or `multi` — see § Tenancy mode |

## Running

Add `mstunnel` and `msbridge` to `config/config.json` under
`init.services` — see [`config/CLAUDE.md`](../../config/CLAUDE.md) for the
entry format. List the tunnel with the other tunnels (before services) so
that restarting the bridge does not cycle the tunnel (declaration order
determines restart scope).

Start both services:

```sh
bunx fit-rc start
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
