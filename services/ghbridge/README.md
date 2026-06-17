# GitHub Discussions Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub Discussions bridge — relay messages between GitHub Discussion threads and
the Kata agent team.

<!-- END:description -->

For the trust model when this bridge runs as the hosted Forward Impact
service vs the customer's self-hosted deployment, see
[TRUST.md](../../TRUST.md).

For configuring the GitHub **server App** this bridge uses (self-hosted holds
the key here; hosted custodies it in `services/ghserver`), see
[`services/ghserver` § github-app.md](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md).

## Prerequisites

- The Kata Agent Team GitHub App with `discussions: write` permission and
  webhook subscriptions for `discussion` and `discussion_comment` events
  (see the kata-setup skill for initial App creation).
- An installation of that App on the target repository.
- The `ghuser` service running and reachable (provides per-user GitHub
  tokens for dispatch). Each user who triggers a dispatch must have linked
  their GitHub account through the OAuth flow — the bridge posts a link
  prompt on the discussion when a link is missing.

The App installation token is still used for posting replies, reactions,
and declined-dispatch notices — only the `workflow_dispatch` call uses
the per-user token.

### Dependencies

| Service | Why |
| --- | --- |
| `bridge` | Canonical discussion and origin store (gRPC) |
| `ghuser` | Per-user GitHub token for `workflow_dispatch` |

Discussion state is owned by `services/bridge`; the bridge talks to it
over gRPC and keeps no on-disk discussion state of its own. Operators
upgrading from a bridge that predates this service can safely delete
legacy `data/bridges/ghbridge/` files; they expire under their existing
24-hour TTL regardless.

## Tenancy mode

`SERVICE_GHBRIDGE_TENANCY_MODE` selects the deployment shape:

- **`single`** (default, self-hosted) — the bridge reads the App private key
  in process, mints installation tokens from the static
  `app_installation_id`, and threads the literal tenant id `default` through
  every `services/bridge` RPC via a `DefaultTenantResolver`. Per-user OAuth
  (`services/ghuser`) supplies the `workflow_dispatch` credential.
- **`multi`** (hosted) — the bridge holds no App key. It resolves the tenant
  per inbound webhook from the delivery's repository (`resolveByRepo`), mints
  repo-scoped tokens through `services/ghserver`, and scopes every store RPC
  by the resolved tenant. `installation.created` /
  `installation.repositories_added` deliveries onboard repositories into the
  registry (`services/tenancy`) with `state = active`.

### Multi-tenant dependencies

| Service | Why |
| --- | --- |
| `services/tenancy` | Tenant registry — resolves a delivery's repo to a tenant and records onboarding upserts |
| `services/ghserver` | Mints repo-scoped App installation tokens for replies, reactions, and `workflow_dispatch` (the bridge never holds the App key) |

### Deferred: `installation.repositories_removed` revoke

Onboarding upserts on `installation.created` /
`installation.repositories_added`. The revoke path — rotating a tenant from
`active` to `revoked` on `installation.repositories_removed` or a full
uninstall — is not handled here. A partial uninstall leaves the `active` row
in place until the revoke path ships. Self-hosted (`single`) deployments are
unaffected.

### Documented limitation: multi-tenant elapsed-recess re-arm on restart

In `single` mode, the bridge re-arms time-based (`elapsed`-trigger) recesses at
startup: `ResumeScheduler.rearm()` reads the open recesses for the one tenant
(`default`) and re-schedules each. In `multi` mode there is no single tenant at
boot, and the registry does not expose a cross-tenant enumeration of open
recesses, so `rearm()` returns nothing. The consequence: a hosted bridge that
restarts while an `elapsed` recess is pending does not fire that recess on a
timer. Instead, multi-tenant `elapsed`-trigger recesses re-arm lazily on the
next inbound activity on the thread (the resume lifecycle runs through
`processInbound`). `missing_input` recesses are unaffected — they resume on the
next reply regardless of restart. Self-hosted (`single`) re-arm behaviour is
unchanged.

### Configuration

Loaded via `createServiceConfig("ghbridge")`):

| Env var | Purpose |
| --- | --- |
| `SERVICE_GHBRIDGE_URL` | Listen URL (default `http://localhost:3013`) |
| `SERVICE_GHBRIDGE_GITHUB_REPO` | `owner/repo` target |
| `SERVICE_GHBRIDGE_CALLBACK_BASE_URL` | Public URL the workflow POSTs callbacks to |
| `SERVICE_GHUSER_URL` | gRPC address of the ghuser service |
| `SERVICE_GHBRIDGE_APP_ID` | Kata App numeric id |
| `SERVICE_GHBRIDGE_APP_PRIVATE_KEY` | PEM contents (see § Private key format) |
| `SERVICE_GHBRIDGE_APP_INSTALLATION_ID` | Installation id for the target repo |
| `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` | Shared secret for `X-Hub-Signature-256` verification |
| `SERVICE_GHBRIDGE_TENANCY_MODE` | `single` (default) or `multi` — see § Tenancy mode |

### Private key format

The PEM file must be entered as a single line with literal `\n` replacing
each line break, wrapped in double quotes:

```
SERVICE_GHBRIDGE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"
```

Convert a `.pem` file to this format:

```sh
awk 'NR>1{printf "\\n"}{printf "%s",$0}' path/to/your-key.pem
```

Paste the output between double quotes after the `=`.

## Service supervision

If you supervise `ghbridge` via `fit-rc`, list `bridge` ahead of the bridge
entries in `init.services` so `createClient('bridge', …)` resolves at startup.

## Running

Add `ghtunnel` and `ghbridge` to `config/config.json` under
`init.services` — see [`config/CLAUDE.md`](../../config/CLAUDE.md) for the
entry format. List the tunnel before the bridge so that restarting the
bridge does not cycle the tunnel (declaration order determines restart
scope).

Start both services:

```sh
bunx fit-rc start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After starting, check the tunnel log for the assigned URL:

```sh
cat data/logs/ghtunnel/current | grep trycloudflare.com
```

### GitHub App webhook configuration

In the App settings (`github.com/organizations/<org>/settings/apps/<app>`):

1. Under **Webhook**, check **Active**.
2. Set **Webhook URL** to `https://<tunnel-domain>/api/webhook`.
3. Set **Secret** to a shared value and save the same value as
   `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` in `.env`.
4. Under **Permissions & events → Subscribe to events**, check
   **Discussions** and **Discussion comments**.
5. Save changes.

Set `SERVICE_GHBRIDGE_CALLBACK_BASE_URL` in `.env` to the tunnel domain
(without any path), then restart only the bridge:

```sh
bunx fit-rc restart ghbridge
```

The tunnel keeps its hostname across bridge restarts.

### Corporate network considerations

The bridge must be able to reach `api.github.com` to dispatch workflows
and post GraphQL replies. If you are on a corporate VPN with tenant
restrictions, disconnect before starting.

## Smoke test

Open a new GitHub Discussion in the configured repository. The bridge:

1. Verifies the `X-Hub-Signature-256` against the webhook secret.
2. Saves a discussion record to `services/bridge` keyed by the discussion's `node_id`.
3. Dispatches `kata-dispatch.yml` via `workflow_dispatch`.
4. Adds an "EYES" reaction to the discussion as a progress indicator.

The bridge then waits for the workflow's callback. When it arrives:

- If `verdict: "adjourned"` — each `reply` in `payload.replies` becomes a
  threaded comment via `addDiscussionComment`. The RFC is closed.
- If `verdict: "recessed"` — the bridge persists the trigger and re-dispatches
  the workflow with `resume_context` when the trigger fires.
- If `verdict: "failed"` — the summary is posted to the thread so the human
  sees the failure surface; no re-dispatch.
