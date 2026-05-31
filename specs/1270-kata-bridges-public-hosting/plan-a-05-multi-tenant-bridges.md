# Plan 1270 — Part 05: Multi-tenant bridges

Adds `tenancy_mode = "multi"` to `services/ghbridge`, `services/msbridge`,
and `services/bridge`. In multi-tenant mode each bridge resolves the
tenant per request and calls `services/ghserver` for installation
tokens; the canonical store scopes records by `tenant_id`; the
callback route becomes `POST /api/callback/:tenant_id/:token`.
Single-tenant mode (default) is unchanged for self-hosted operators.
Depends on parts 01 (protos, tenancy), 02 (ghserver), 04 (libbridge
resolver).

## Step 1 — Open the STATUS sub-row

Append `1270/multi-tenant-bridges\tplan\tapproved` to `wiki/STATUS.md`.

## Step 2 — `services/ghbridge` mode flag and resolver wiring

Modified files: `services/ghbridge/server.js`, `services/ghbridge/index.js`.

Add `tenancy_mode: "single"` to the `createServiceConfig` defaults
object (allowed: `"single" | "multi"`). In `server.js`, use the
direct-class client pattern already present in this file at
`services/ghbridge/server.js` (the `clients` destructure block) (`const { GhuserClient, BridgeClient } = clients`):

```js
const { GhuserClient, BridgeClient, TenancyClient, GhserverClient } = clients;
let tenantResolver, ghserverClient;
if (config.tenancy_mode === "multi") {
  const tenancyConfig = await createServiceConfig("tenancy");
  const tenancyClient = new TenancyClient(tenancyConfig, logger, tracer);
  const ghserverConfig = await createServiceConfig("ghserver");
  ghserverClient = new GhserverClient(ghserverConfig, logger, tracer);
  tenantResolver = new RegistryTenantResolver({ client: tenancyClient });
} else {
  tenantResolver = new DefaultTenantResolver({
    channel: "github-discussions",
    repo: parseRepo(config.github_repo),
  });
}
```

Pass `tenantResolver` and (when present) `ghserverClient` to
`GhBridgeService` constructor as `deps`. The constructor stores both;
the request handler reads `deps.tenantResolver` to look up the tenant
and reads `deps.ghserverClient` instead of using the existing
`getInstallationToken` closure (built from `createAppAuth` at
`services/ghbridge/server.js` (the `getInstallationToken` closure built from `createAppAuth`)) when in multi-tenant mode.

Verification: `services/ghbridge/test/server.test.js` adds
single-tenant and multi-tenant startup cases; multi-tenant case
mocks `TenancyClient` and `GhserverClient` via libmock.

## Step 3 — `services/ghbridge` token derivation

Modified files: `services/ghbridge/server.js`, `services/ghbridge/index.js`.

The token derivation today lives at `services/ghbridge/server.js` (the `getInstallationToken` closure built from `createAppAuth`)
(`getInstallationToken` closure built from `createAppAuth` with the
static `app_installation_id`) and is consumed by `graphqlClient` for
the reply path. In multi-tenant mode, build the closure differently:

```js
async function getInstallationToken(repo) {
  if (config.tenancy_mode === "multi") {
    const { installation_token } = await ghserverClient.MintInstallationToken({
      owner: repo.owner, name: repo.name, requested_by: "ghbridge",
    });
    return installation_token;
  }
  const { token } = await appAuth({ type: "installation" });
  return token;
}
```

In single-tenant mode, `repo` is read from `parseRepo(config.github_repo)`
and `appAuth` is built once from the static `app_installation_id` as
today. In multi-tenant mode, callers pass the per-request `repo`
(resolved from the inbound webhook's `installation.id` via the
extractor in Step 5). The `Dispatcher` (in libbridge — `dispatcher.js`)
already consumes the resolved tenant through part 04 Step 6's
constructor injection.

Verification: `services/ghbridge/test/server.test.js` adds a
multi-tenant call shape exercising the mock `ghserverClient`; single-
tenant continues to call `appAuth` as today.

## Step 4 — `services/ghbridge` callback URL routing

Modified files: `services/ghbridge/index.js`.

Pass `tenancyMode: config.tenancy_mode` to `createBridgeServer` (part
04 Step 5). The server registers the correct route shape:
single-tenant `/api/callback/:token`, multi-tenant
`/api/callback/:tenant_id/:token`. The `Dispatcher` instance (libbridge,
part 04 Step 6) is constructed with the `tenantResolver` so the
emitted callback URL matches the route shape. No grace window — per
plan-a.md § Callback URL routing, a deployment runs in one mode at a
time; the upgrade procedure is drain → flip → restart.

Verification: `services/ghbridge/test/server.test.js` adds two cases:
single-tenant inbound `/api/callback/:token` resolves; multi-tenant
inbound `/api/callback/:tenant_id/:token` with mismatched `tenant_id`
returns 404 (the registry's `consume` returns null on mismatch and
the existing handler maps null to 404).

## Step 5 — `services/ghbridge` GitHub install onboarding + per-request tenant extraction

Modified files: `services/ghbridge/index.js` (webhook router),
`services/ghbridge/src/install-handler.js` (new),
`services/ghbridge/src/tenant-extractor.js` (new).

The webhook router today (in `services/ghbridge/index.js`) authenticates
the App webhook signature and dispatches per event kind. Two changes:

1. **Onboarding handler.** Subscribe the multi-tenant webhook router
   to `installation.created` and `installation.repositories_added`.
   For each repository in the event payload, call
   `tenancyClient.UpsertByPair({ installation_id, owner, name })` with
   `state = "active"` (the gRPC handler is idempotent per part 01).
   Single-tenant mode skips this branch.
2. **Per-request tenant extraction.** For every other multi-tenant
   webhook delivery, parse the inbound payload's `installation.id`
   (now read from `payload.installation.id`) plus the event's
   `repository.owner.login` / `repository.name` and call
   `tenantResolver.resolveByRepo({ owner, name })`. The resolved
   tenant carries the `repo`, `tenant_id`, and `channel_tenant_key`
   that downstream Dispatcher and DiscussionAdapter pass through.

The extractor handles the case where a single installation covers
many repos — each delivery names one repo, and `resolveByRepo`
disambiguates which `(installation_id, repo)` row to use.

Verification: `services/ghbridge/test/install-handler.test.js`
covers a fresh `installation.created` with two repos (two upserts),
an idempotent re-fire (no error), and a `repositories_added` for an
existing installation (only the new repo upserts).
`services/ghbridge/test/tenant-extractor.test.js` covers
single-installation-many-repos resolution.

## Step 6 — `services/msbridge` mode flag, resolver, consent handler

Modified files: `services/msbridge/server.js`, `services/msbridge/index.js`,
`services/msbridge/src/consent-handler.js` (new),
`services/msbridge/src/tenant-extractor.js` (new).

Mirror Step 2's mode flag and resolver wiring for msbridge. The Bot
Framework authenticator change uses the standard botbuilder
`ConfigurationBotFrameworkAuthentication` shape: in multi-tenant
mode, the `MicrosoftAppType` is `"MultiTenant"` and `MicrosoftAppTenantId`
is **omitted** (per Microsoft's documented multi-tenant
authentication mode). The Bot Framework SDK accepts JWTs issued by
any tenant in this configuration — no per-tenant authenticator
construction is required. Single-tenant mode keeps the current
`SingleTenant` configuration with the static
`MICROSOFT_APP_TENANT_ID`.

The consent handler subscribes to Bot Framework `installationUpdate`
activities with `action = "add"` and calls
`tenancyClient.UpsertByChannelKey({ channel: "msteams",
channel_tenant_key: activity.channelData.tenant.id, state:
"pending_consent" })`. The repo mapping is set later via a hosted
onboarding endpoint (see Step 7).

The tenant extractor reads `activity.channelData.tenant.id` from
every inbound Bot Framework activity and calls
`tenantResolver.resolve({ channel: "msteams", key:
activity.channelData.tenant.id })` before any downstream handler
runs. Activities from `pending_consent` tenants are rejected (the
resolver returns null for non-active tenants).

Multi-tenant `services/msbridge` calls
`ghserverClient.MintInstallationToken` for the GitHub App credential
used to fire `workflow_dispatch` on the customer repo. The Bot
Framework credential remains in-process per
[design § Bot Framework credential custody](design-a.md#key-decisions).

The dispatch identity for `services/msbridge` in multi-tenant mode
shifts from per-user OAuth (`services/ghuser`) to the App
installation token; this is the design's explicit trade-off in
[design § Hosted dispatch identity](design-a.md#key-decisions). The
hosted-mode README documents the user-visible consequence (workflow
commits authored as the App, not the human dispatcher).

Verification: `services/msbridge/test/consent-handler.test.js`
covers a fresh consent (upsert with `pending_consent`), a re-fire
(no error), and a multi-tenant `workflow_dispatch` call exercising
the mock `ghserverClient`.

## Step 7 — Hosted onboarding endpoint for Teams repo mapping

Modified files: `services/msbridge/index.js`, `services/msbridge/src/onboard-handler.js`
(new).

Add `POST /onboard` with body `{ tenant_id, repo: { owner, name } }`.
The handler validates that the caller authenticated as a Microsoft
tenant matching the `tenant_id` (signature-bound; the Bot Framework
authenticator carries the tenant id of the caller), calls
`tenancyClient.SetRepo({ tenant_id, repo })` and
`tenancyClient.SetState({ tenant_id, state: "active" })`. The endpoint
is exposed only in multi-tenant mode.

Verification: `services/msbridge/test/onboard-handler.test.js` covers
the happy path, a tenant-id mismatch (`401`), and a
`pending_consent` row → `active` transition.

## Step 8 — `services/bridge` per-tenant scoping

Modified files: `services/bridge/index.js` only. `BufferedIndex` is
the `@forwardimpact/libindex` library class (consumed from
`services/bridge/index.js:1`); no `services/bridge/src/` exists and
no library edit is required — scoping lives in this service's
handler code, not in the index.

The `Discussion`, `Origin`, `OpenRecess`, `Inbox`, and
`PendingDispatch` index keys today are derived from the JSONL record
fields (e.g. `${channel}:${discussion_id}` for discussions, the
correlation_id for pending dispatches). Extend each handler:

- **`SaveDiscussion`** — when the request carries `tenant_id`, prefix
  the index key as `${channel}:${tenant_id}:${discussion_id}`.
  When `tenant_id` is absent (single-tenant), use the existing
  key shape unchanged.
- **`LoadDiscussion`** — when the request carries `tenant_id`, look
  up the tenant-scoped key; when absent, look up the legacy key.
  No fallback across modes; the request's `tenant_id` (or absence)
  is authoritative.
- **`LoadDiscussionByCorrelation`** — when the request carries
  `tenant_id`, filter results to records matching that tenant
  (records are scanned by correlation_id; the filter is applied
  after the scan). When absent, return any matching record.
- **`HasOrigin` / `RecordOrigin`** — `Origin` records gain `tenant_id`;
  the existence check is tenant-scoped when set.
- **`Sweep`** — when the request carries `tenant_id`, restrict the
  sweep to tenant-scoped records; when absent, sweep all records
  (preserves the current self-hosted behaviour).
- **`PutPendingDispatch` / `ResolvePendingDispatch`** — `tenant_id`
  carried through; the registry index keys include the tenant when
  set.
- **`EnqueueInbox` / `DrainInbox`** — tenant-scoped queue per
  `(tenant_id, correlation_id)` when set.
- **`ListOpenRecesses`** — request takes `common.Empty`; the gRPC
  metadata header `x-tenant-id` (set by the bridge in multi-tenant
  mode, absent in single-tenant) scopes the result. The
  `BridgeService` handler reads metadata via `librpc`'s
  per-call accessor.

Verification: `services/bridge/test/multi-tenant.test.js` covers each
RPC's scoping behaviour: single-tenant save/load (legacy key);
multi-tenant save/load (tenant-scoped key); cross-tenant
`LoadDiscussionByCorrelation` (tenant A by correlation_id → not
found if tenant B); `ListOpenRecesses` filters by metadata header;
`DrainInbox` returns only the requesting tenant's messages.

## Step 9 — `DiscussionAdapter` passes `tenant_id`

Modified files: `services/ghbridge/src/discussion-adapter.js` (exists;
the msbridge equivalent is in `services/msbridge/src/` if present
today, otherwise added per ghbridge's shape).

The adapter sets `tenant_id` on every `save` and on every `load`
request **only in multi-tenant mode**, sourced from the resolved
tenant via the constructor-injected `TenantResolver`. In single-
tenant mode the adapter omits the field entirely so existing JSONL
keys remain readable on upgrade (per plan-a.md § Storage isolation).
The gRPC metadata `x-tenant-id` header is set by the adapter on
`ListOpenRecesses` calls in multi-tenant mode only.

Verification: `services/ghbridge/test/discussion-adapter.test.js`
adds two cases: single-tenant mode → no `tenant_id` field set;
multi-tenant mode → resolved `tenant_id` set on every RPC.

## Step 10 — BYOK boundary check

Created files: `scripts/check-byok-boundary.mjs`.
Modified files: monorepo root `package.json` (`scripts.check` chain).

Script reads a manifest constant declaring the hosted control-plane
directories — `services/ghserver`, `services/oidc`, `services/tenancy`,
`services/ghbridge`, `services/msbridge`, `services/bridge`,
`libraries/libbridge` — and asserts none of:

- `package.json` lists a top-level runtime dependency under
  `@anthropic-ai/*` (transitive deps are out of scope — they are
  covered by the existing `bun.lock` audit and the spec criterion
  reads as a direct-dependency constraint).
- Any `.js` or `.mjs` file imports from `@anthropic-ai/*`.
- Any `.js` or `.mjs` file reads an env var matching `ANTHROPIC_*`
  (literal substring check on `process.env.ANTHROPIC_` plus
  `process.env["ANTHROPIC_`).

The script also scans the hosted-path workflow YAML emitted by
`kata-setup` (part 06) for the same patterns; the file paths are
read from `.claude/skills/kata-setup/references/workflow-*.md`
fenced YAML blocks.

Wire into the existing root `package.json` `scripts.check` chain so
`bun run check` fails if the boundary is breached.

Verification: `bun run check` passes; introduce a deliberate
violation in a test fixture under `scripts/test/byok-fixtures/` and
confirm the script fails.

## Step 11 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/multi-tenant-bridges\tplan\tapproved` →
`1270/multi-tenant-bridges\tplan\timplemented`.

## Risks

- **`installation.repositories_removed` not handled here.** This part
  upserts on add; the revoke path (rotating a tenant from `active`
  to `revoked`) is deferred to a follow-on PR. Self-hosted
  deployments are unaffected; hosted deployments retain a
  `state = active` row after a partial uninstall until the follow-on
  ships. Documented in `services/ghbridge/README.md` Step 5.

- **Bot Framework `MultiTenant` authentication mode is the
  resolved approach.** Step 6 uses Microsoft's documented
  `MicrosoftAppType: "MultiTenant"` mode with the static
  `MICROSOFT_APP_TENANT_ID` removed; no per-tenant authenticator
  construction is required. The implementer's only operational
  risk is if Microsoft removes the multi-tenant mode (no current
  signal of that). Documented in `services/msbridge/README.md`.

- **Existing self-hosted JSONL keys readable on hosted upgrade.** A
  deployment that flips from single-tenant to multi-tenant has
  records already written with the legacy
  `${channel}:${discussion_id}` key shape. Step 8 reads the legacy
  key only when the request omits `tenant_id`; once the adapter
  starts threading `tenant_id` (Step 9, multi-tenant mode), reads
  miss the legacy records by design. Migration is out of scope here
  per spec § Deferred — operators choose hosted or self-hosted at
  setup time.

## Libraries used

`libbridge` (parts 04 surface), `libconfig`, `librpc`, `libstorage`,
`libtelemetry`, `libtype`, `libpreflight`, plus existing bridge
dependencies (`@octokit/auth-app` for single-tenant mode in
ghbridge; `botbuilder` for msbridge).
