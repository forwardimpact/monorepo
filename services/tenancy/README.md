# Tenancy

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Tenant registry — `(channel, channel_tenant_key) → Tenant` lookup for the hosted
control plane.

<!-- END:description -->

## What this service owns

The hosted control plane runs two bridges (`ghbridge`, `msbridge`) and a
custody service (`ghserver`) that each need to answer the same question:
"which customer tenant does this event, repo, or callback belong to?"
`services/tenancy` is the one place that answer lives.

The registry stores one row per `(channel, channel_tenant_key)` pair —
GitHub uses the composite `"{installation_id}:{owner}/{name}"`; Microsoft
Teams uses the Azure tenant id. Lifecycle states are `pending_consent`,
`active`, and `revoked`; `ResolveByChannelKey` and `ResolveByRepo` return
only `active` rows. `ResolveByTenantId` returns the row regardless of
state so callback verification can reject mismatched tenant ids without
sniffing state first.

The registry holds **no** credential material. The GitHub App private key
lives only in `services/ghserver`; the Bot Framework credential lives in
`services/msbridge`. The callback-verification token model is the
single-use registry already owned by `libraries/libbridge` — `services/tenancy`
only adds tenant-id binding on top of that token; it does not introduce a new
signature primitive.

Configuration (loaded via `createServiceConfig("tenancy")`):

| Env var               | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `SERVICE_TENANCY_URL` | Listen URL (gRPC, control-plane internal)     |

The service binds to the control plane's internal network. Production
hardening of the registry substrate and gRPC peer authentication are
deferred (see [design § What this design does not cover](../../specs/1270-kata-bridges-public-hosting/design-a.md#what-this-design-does-not-cover)).

## Running

Add `tenancy` to `config/config.json` under `init.services` (see
[`config/CLAUDE.md`](../../config/CLAUDE.md) for entry format). In
single-tenant deployments the service is **not** started — `libbridge`'s
`DefaultTenantResolver` returns the fixed `default` tenant directly.

Tenants are persisted as JSONL under `data/tenancy/` via `libstorage`
(the standard `createStorage` path — no extra env var needed).

## RPCs

| RPC                  | Direction | Used by                          |
| -------------------- | --------- | -------------------------------- |
| `ResolveByChannelKey`| read      | bridges (event resolution)       |
| `ResolveByRepo`      | read      | `services/ghserver` (mint path)  |
| `ResolveByTenantId`  | read      | bridges (callback verification)  |
| `UpsertByChannelKey` | write     | `msbridge` consent handler       |
| `UpsertByPair`       | write     | `ghbridge` install handler       |
| `SetState`           | write     | revocation / lifecycle updates   |
| `SetRepo`            | write     | Teams self-served repo mapping   |

The proto definition is at [`proto/tenancy.proto`](proto/tenancy.proto).
Wire shape matches the `TenantResolver` duck type the bridges already
consume via `libraries/libbridge`'s `RegistryTenantResolver`.
