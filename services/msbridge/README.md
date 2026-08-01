# MS Teams Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Microsoft Teams bridge onto libbridge — relay messages between Teams
conversations and the Kata agent team.

<!-- END:description -->

See [TRUST.md](../../TRUST.md) for the trust model. It covers this bridge as
the hosted Forward Impact service and as the customer's self-hosted
deployment.

See [azure-app.md](azure-app.md) to configure the Azure AD (Entra) app behind
this bridge. It covers self-hosted single-tenant and hosted multi-tenant.

## Prerequisites

- A Microsoft 365 developer tenant with an Azure Bot resource registered for
  the Teams channel. See
  [config-msteams.md § 1–3](../../specs/1200-teams-agent-bridge/config-msteams.md).
- The Azure Bot resource must have the **Microsoft Teams channel** enabled
  (Settings → Channels → add Microsoft Teams).
- The `ghuser` service must run and be reachable. It provides per-user GitHub
  tokens for dispatch. Each user who triggers a dispatch must link their GitHub
  account through the OAuth flow first. The bridge prompts on the channel when
  a link is missing.

### Dependencies

| Service | Why |
| --- | --- |
| `bridge` | Canonical discussion and origin store (gRPC) |
| `ghuser` | Per-user GitHub token for `workflow_dispatch` |

`services/bridge` owns the discussion state. This bridge talks to it over
gRPC and keeps no on-disk discussion state of its own. Operators who upgrade
from a bridge that predates this service can safely delete legacy
`data/bridges/msbridge/` files. Those files expire under their existing
24-hour TTL anyway.

## Tenancy mode

`SERVICE_MSBRIDGE_TENANCY_MODE` selects the deployment shape:

- **`single`** (default, self-hosted) — the Bot Framework authenticator runs
  in `SingleTenant` mode bound to the static `MICROSOFT_APP_TENANT_ID`. The
  literal tenant id `default` threads through every `services/bridge` RPC with
  a `DefaultTenantResolver`. Per-user OAuth (`services/ghuser`) supplies the
  `workflow_dispatch` credential.
- **`multi`** (hosted) — the Bot Framework authenticator runs in Microsoft's
  documented **`MultiTenant`** mode. `MicrosoftAppType` is `MultiTenant` and
  `MICROSOFT_APP_TENANT_ID` is omitted. The SDK then accepts JWTs issued by any
  consenting Entra tenant. Each inbound activity's Entra tenant id
  (`channelData.tenant.id`) resolves to a registry tenant. The bridge rejects
  non-active (`pending_consent`) tenants. The GitHub `workflow_dispatch`
  credential is the per-user OAuth token of the user who dispatches
  (`services/ghuser`). That is the same per-user path as single-tenant, so a
  hosted workflow commit carries the human dispatcher as its author. The Bot
  Framework reply credential stays in process.

### Multi-tenant onboarding

1. A tenant adds the Teams app. Bot Framework fires `installationUpdate`
   (`action = add`). The consent handler registers the tenant as
   `pending_consent` in `services/tenancy`, keyed by the Entra tenant id.
2. The customer calls `POST /onboard` with `{ repo: { owner, name } }`. The
   handler verifies the caller's Entra `tid`. The injected `authenticateTenant`
   verifier binds that `tid` to a signature. The handler then resolves and
   transitions that `tid`'s registry row in one state-agnostic upsert.
   `UpsertByChannelKey({ channel: "msteams", channel_tenant_key: tid, state:
   "active" })` finds the `pending_consent` row by `(channel, key)` regardless
   of state. It flips the row to `active` and returns its registry `tenant_id`
   (a UUID). `SetRepo` then binds the repo to that UUID. An active-only resolve
   would never see the `pending_consent` row, so the upsert makes the
   consent → active transition reachable. The `tid` and the registry
   `tenant_id` live in different id-spaces. The channel key comes only from
   the authenticated `tid`. The UUID comes only from the resolved row. So the
   handler never trusts a body-supplied registry id. For a `tid` with no prior
   consent row, the upsert creates a fresh row as `active`. The `tid` is
   signature-bound, so the caller provably owns that Entra tenant.

The injected `authenticateTenant` verifier validates the inbound Bot Framework
bearer JWT. It uses the same `ConfigurationBotFrameworkAuthentication` the
`/api/messages` path uses (one SDK validation path). This proves the caller's
`tid` cryptographically. A request with a proven `tid` onboards as above. An
absent or forged proof returns 401 before any registry read. The caller must
present a Bot Framework-issued bearer token whose audience is the bot's
`MICROSOFT_APP_ID`. The handler rejects a Graph or Entra user token.
`test/onboard-handler.test.js` exercises the resolved-`tid` → registry-row →
`SetRepo` contract. `test/onboard-verifier.test.js` exercises the verifier.

### Documented limitation: multi-tenant elapsed-recess re-arm on restart

In `single` mode, the bridge re-arms time-based (`elapsed`-trigger) recesses at
startup with `ResumeScheduler.rearm()`. That call reads the open recesses for
the one tenant (`default`). In `multi` mode there is no single tenant at boot.
The registry also exposes no cross-tenant enumeration of open recesses, so
`rearm()` returns nothing. A hosted bridge that restarts while an `elapsed`
recess is pending does not fire that recess on a timer. Multi-tenant
`elapsed`-trigger recesses instead re-arm lazily on the next inbound activity
on the thread. The resume lifecycle runs through `processInbound`.
`missing_input` recesses are unaffected. They resume on the next reply
regardless of restart. Self-hosted (`single`) re-arm behaviour is unchanged.

### Multi-tenant dependencies

| Service | Why |
| --- | --- |
| `services/tenancy` | Tenant registry — consent registration, Entra-tid → tenant resolution, repo mapping |
| `services/ghuser` | Per-user GitHub token for `workflow_dispatch` (the dispatch credential in both modes) |

### Configuration

Loaded with `createServiceConfig("msbridge")`:

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

Add `mstunnel` and `msbridge` to `config/config.json` under `init.services`.
See [`config/CLAUDE.md`](../../config/CLAUDE.md) for the entry format. List the
tunnel with the other tunnels (before services). A bridge restart then does not
cycle the tunnel. Declaration order determines restart scope.

Start both services:

```sh
bunx fit-rc start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After you start it, check the tunnel log for the assigned URL:

```sh
cat data/logs/mstunnel/current | grep trycloudflare.com
```

### Azure Bot messaging endpoint

In the Azure portal (Settings → Configuration), set the messaging endpoint
to `https://<tunnel-domain>/api/messages`.

Set `SERVICE_MSBRIDGE_CALLBACK_BASE_URL` in `.env` to the tunnel domain
(without any path). Then restart only the bridge:

```sh
bunx fit-rc restart msbridge
```

The tunnel keeps its hostname across bridge restarts.

## Service supervision

If you supervise `msbridge` with `fit-rc`, list `bridge` ahead of the bridge
entries in `init.services` so `createClient('bridge', …)` resolves at startup.

### Corporate network considerations

The bridge must reach `api.github.com` to dispatch workflows. If you are on a
corporate VPN with tenant restrictions, the VPN may block outbound calls to
Azure AD and GitHub. Disconnect from the VPN before you start the bridge, or
allowlist the required endpoints.

## Packaging the Teams App

```sh
just msbridge-package
```

The recipe reads `MICROSOFT_APP_ID` from `.env` with libconfig. It reads the
tunnel domain from `SERVICE_MSBRIDGE_CALLBACK_BASE_URL`. It produces
`dist/kata-agent-bridge.zip` (git-ignored), which holds the manifest and
placeholder icons. Override the tunnel domain with `--tunnel-domain=<host>` if
needed.

The manifest uses Teams schema v1.17. You do not have to remove the app from
Teams to rebuild and re-upload the package. The Azure Bot messaging endpoint
controls routing. The package contents do not.

## Sideloading

1. In
   [Teams Admin Center](https://admin.teams.microsoft.com/policies/manage-apps),
   make sure **Org-wide app settings → Allow interaction with custom apps** is
   on.
2. In **Setup policies → Global**, make sure **Upload custom apps** is on.
3. Open Teams → Apps → Manage your apps → **Upload an app** →
   **Upload a custom app** → select `kata-agent-bridge.zip`.
4. Add the app to a team or group chat.

## Smoke test

Send `@Kata Agent hello` in the configured team or chat. The bot shows a
randomized status word ("Moonwalking...", "Crafting...", etc.) while the agent
team works. The bot then posts the facilitator's response back in the same
thread once the session completes.
