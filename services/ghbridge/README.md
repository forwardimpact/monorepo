# GitHub Discussions Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub Discussions bridge — relay messages between GitHub Discussion threads and
the Kata agent team.

<!-- END:description -->

For the trust model, see [TRUST.md](../../TRUST.md). It covers this bridge as
the hosted Forward Impact service and as the customer's self-hosted
deployment.

To configure the GitHub **server App** this bridge uses, see
[`services/ghserver` § github-app.md](https://github.com/forwardimpact/monorepo/blob/main/services/ghserver/github-app.md).
A self-hosted deployment holds the key here. A hosted deployment holds it in
`services/ghserver`.

## Prerequisites

- The Kata Agent Team GitHub App with `discussions: write` permission and
  webhook subscriptions for `discussion` and `discussion_comment` events
  (see the kata-setup skill for how to create the App first).
- An installation of that App on the target repository.
- The `ghuser` service must run and stay reachable. It supplies per-user
  GitHub tokens for dispatch. Each user who triggers a dispatch must link
  their GitHub account through the OAuth flow. The bridge posts a link
  prompt on the discussion when a link is missing.

The bridge still uses the App installation token to post replies, reactions,
and declined-dispatch notices. Only the `workflow_dispatch` call uses the
per-user token.

### Dependencies

| Service | Why |
| --- | --- |
| `bridge` | Canonical discussion and origin store (gRPC) |
| `ghuser` | Per-user GitHub token for `workflow_dispatch` |

`services/bridge` owns the discussion state. The bridge talks to it over
gRPC. The bridge keeps no on-disk discussion state of its own. An operator
who upgrades from a bridge that predates this service can safely delete
legacy `data/bridges/ghbridge/` files. Those files expire under their
existing 24-hour TTL regardless.

## Tenancy mode

`SERVICE_GHBRIDGE_TENANCY_MODE` selects the deployment shape:

- **`single`** (default, self-hosted) — the bridge reads the App private key
  in process. It mints installation tokens from the static
  `app_installation_id`. It threads the literal tenant id `default` through
  every `services/bridge` RPC with a `DefaultTenantResolver`. Per-user OAuth
  (`services/ghuser`) supplies the `workflow_dispatch` credential.
- **`multi`** (hosted) — the bridge holds no App key. It resolves the tenant
  per inbound webhook from the delivery's repository (`resolveByRepo`). It
  mints repo-scoped tokens through `services/ghserver` for the reply/reaction
  path. It scopes every store RPC by the resolved tenant. The
  `workflow_dispatch` credential is the per-user OAuth token of the user who
  dispatches (`services/ghuser`). This is the same per-user path as
  single-tenant. `installation.created` /
  `installation.repositories_added` deliveries onboard repositories into the
  registry (`services/tenancy`) with `state = active`.

### Multi-tenant dependencies

| Service | Why |
| --- | --- |
| `services/tenancy` | Tenant registry — resolves a delivery's repo to a tenant and records upserts on onboarding |
| `services/ghuser` | Per-user GitHub token for `workflow_dispatch` (the dispatch credential in both modes) |
| `services/ghserver` | Mints repo-scoped App installation tokens for replies and reactions (the bridge never holds the App key) |

### Deferred: `installation.repositories_removed` revoke

The bridge upserts on `installation.created` /
`installation.repositories_added`. This service does not handle the revoke
path. That path rotates a tenant from `active` to `revoked` on
`installation.repositories_removed` or a full uninstall. A partial uninstall
leaves the `active` row in place until the revoke path ships. Self-hosted
(`single`) deployments are unaffected.

### Documented limitation: multi-tenant elapsed-recess re-arm on restart

In `single` mode, the bridge re-arms time-based (`elapsed`-trigger) recesses at
startup. `ResumeScheduler.rearm()` reads the open recesses for the one tenant
(`default`) and re-schedules each one. In `multi` mode there is no single
tenant at boot. The registry does not enumerate open recesses across tenants,
so `rearm()` returns nothing. A hosted bridge that restarts while an `elapsed`
recess is pending therefore does not fire that recess on a timer. Instead,
multi-tenant `elapsed`-trigger recesses re-arm lazily on the next inbound
activity on the thread (the resume lifecycle runs through `processInbound`).
`missing_input` recesses are unaffected. They resume on the next reply
regardless of restart. Self-hosted (`single`) re-arm behaviour is unchanged.

### Configuration

`createServiceConfig("ghbridge")` loads the configuration:

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

Enter the PEM file as a single line. Replace each line break with a literal
`\n`. Wrap the whole value in double quotes:

```text
SERVICE_GHBRIDGE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"
```

Convert a `.pem` file to this format:

```sh
awk 'NR>1{printf "\\n"}{printf "%s",$0}' path/to/your-key.pem
```

Paste the output between double quotes after the `=`.

## Service supervision

If you supervise `ghbridge` through `fit-rc`, list `bridge` ahead of the bridge
entries in `init.services`. Then `createClient('bridge', …)` resolves at
startup.

## Running

Add `ghtunnel` and `ghbridge` to `config/config.json` under
`init.services`. See [`config/CLAUDE.md`](../../config/CLAUDE.md) for the
entry format. List the tunnel before the bridge, so a bridge restart does
not cycle the tunnel (declaration order determines restart scope).

Start both services:

```sh
bunx fit-rc start
```

The tunnel uses a quick `trycloudflare.com` hostname that changes on
every restart. After you start the services, check the tunnel log for the
assigned URL:

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
(without any path). Then restart only the bridge:

```sh
bunx fit-rc restart ghbridge
```

The tunnel keeps its hostname across bridge restarts.

### Corporate network considerations

The bridge must reach `api.github.com` to dispatch workflows and post
GraphQL replies. If you are on a corporate VPN with tenant restrictions,
disconnect before you start.

## Smoke test

Open a new GitHub Discussion in the configured repository. The bridge:

1. Verifies the `X-Hub-Signature-256` against the webhook secret.
2. Saves a discussion record to `services/bridge` keyed by the discussion's
   `node_id`.
3. Dispatches `kata-dispatch.yml` through `workflow_dispatch`.
4. Adds an "EYES" reaction to the discussion as a progress indicator.

The bridge then waits for the workflow's callback. When it arrives:

- If `verdict: "adjourned"` — each `reply` in `payload.replies` becomes a
  threaded comment through `addDiscussionComment`. The bridge closes the RFC.
- If `verdict: "recessed"` — the bridge persists the trigger and re-dispatches
  the workflow with `resume_context` when the trigger fires.
- If `verdict: "failed"` — the bridge posts the summary to the thread, so the
  human sees the failure surface. The bridge does not re-dispatch.
