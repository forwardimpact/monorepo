# Plan 1270 — Public hosting for the Kata Agent Team

## Approach

The design ratifies one Forward Impact-owned hosted control plane with
three new services — `services/ghserver` (gRPC App-key custody and
installation-token mint), `services/oidc` (HTTP front for GitHub Actions
OIDC), and `services/tenancy` (gRPC tenant registry) — plus a
channel-agnostic `TenantResolver` in `libraries/libbridge` and a
single-tenant-by-default mode flag in the existing
`ghbridge`/`msbridge`/`bridge` services. Self-hosted is the same code
running with the mode flag off; the hosted control-plane services are
not started in that configuration. Per [design § Decisions], custody
follows the protocol-front pattern (`services/oauth`→`services/ghuser`)
so the only publicly-listening control-plane process holds no signing
material. The plan executes that direction as a foundations PR
(protos + tenancy stub) followed by per-service / per-library /
per-template parts that can be run by independent agents in the
sequencing recorded below.

The implementation publishes nothing externally that did not already
exist; new gRPC services join the existing internal service catalog,
the new HTTP service joins the same tunnel-fronted ingress pattern that
`services/oauth` already uses, and the hosted GitHub App / Azure AD app
registrations are operator deliverables produced outside this
repository (spec § Operator commitments).

## Parts index

| # | Part | Scope | Depends on | Parallelizable with |
|---|---|---|---|---|
| 01 | [protos-and-tenancy](plan-a-01-protos-and-tenancy.md) | Author `services/tenancy/proto/tenancy.proto` and `services/ghserver/proto/ghserver.proto`; build `services/tenancy` (gRPC registry skeleton + stores). | — | 04 |
| 02 | [ghserver](plan-a-02-ghserver.md) | Build `services/ghserver`: gRPC mint endpoint, in-process App-key custody, `tenancy.resolveByRepo` check, per-tenant rate ceiling. | 01 | 04 |
| 03 | [oidc](plan-a-03-oidc.md) | Build `services/oidc`: stateless HTTP front, GitHub Actions OIDC validation, gRPC delegate to `services/ghserver`. | 02 | 04, 07 |
| 04 | [libbridge-tenancy](plan-a-04-libbridge-tenancy.md) | Add `TenantResolver` interface to `libraries/libbridge`; default `default`-tenant resolver for single-tenant mode; constructor wiring for bridges. | 01 (`Tenant` shape only) | 02, 03 |
| 05 | [multi-tenant-bridges](plan-a-05-multi-tenant-bridges.md) | Add multi-tenant mode to `services/ghbridge`, `services/msbridge`, and `services/bridge`: tenant resolution per request, per-tenant scoping in the canonical store, callback URL `/api/callback/:tenant_id/:token`, `installation` and `installationUpdate` onboarding handlers. | 01, 02, 04 | 06, 07 |
| 06 | [workflow-templates](plan-a-06-workflow-templates.md) | Rewrite hosted-path templates for every kata workflow named in spec § Proposal 2 to call `services/oidc` for credentials; preserve self-hosted templates unchanged. | 03 | 05, 07 |
| 07 | [trust-md](plan-a-07-trust-md.md) | Author `TRUST.md` at repo root per spec § Proposal 5; link from `kata-setup`, `ghbridge/README.md`, `msbridge/README.md`. | — | any |

A sub-row per part is recorded in `wiki/STATUS.md` as `1270/<part>`
(follows spec 1370's sub-row convention). The master `1270` row
advances to `plan implemented` only when every sub-row is implemented.

## Execution

Parts 01, 04, and 07 are independently executable from the start. Part
02 opens once 01's protos are on `origin/main`; part 03 opens once 02's
mint RPC is on `origin/main`; part 05 opens once 01, 02, and 04 are on
`origin/main`; part 06 opens once 03 is on `origin/main`. Route
implementation parts to the standard engineering agent
([`kata-implement`](../../.claude/skills/kata-implement/SKILL.md)) and
route part 07 to the technical-writer agent
([`kata-documentation`](../../.claude/skills/kata-documentation/SKILL.md)).
Multiple parts may be in-flight in parallel; the per-part dependency
column above is the sequencing constraint.

## Cross-cutting concerns

### Single-tenant default and mode flag

Self-hosted deployments run the same code with `tenancy_mode = "single"`
(default). The data shape is identical in both modes — every record,
RPC, and route carries a `tenant_id`; single-tenant mode binds it to
the literal value `"default"`. No code path branches on
"is `tenant_id` set?" — the field is always set.

In single-tenant mode:

- `libbridge` constructs a `DefaultTenantResolver` that returns
  `{ tenant_id: "default", channel, channel_tenant_key: "default", repo: <config.github_repo>, state: "active" }`
  without reaching `services/tenancy`. `ghbridge` and `msbridge` instantiate
  this resolver from their existing `github_repo` / `app_*` / `ms_*` config.
- `services/tenancy`, `services/ghserver`, and `services/oidc` are not
  started. The bridge reads `KATA_APP_PRIVATE_KEY` directly to build
  its in-process `createAppAuth` closure.
- The `DiscussionAdapter` passes the resolved `tenant_id = "default"`
  through to `services/bridge` on every save and load.

In `tenancy_mode = "multi"`:

- `libbridge` constructs a `RegistryTenantResolver` that calls
  `services/tenancy`.
- Bridges call `services/ghserver` for installation tokens instead of
  using `createAppAuth` in-process.
- The `DiscussionAdapter` sets the resolved `tenant_id` on every
  request from the registry-backed resolver.

The mode flag is the single source of truth for deployment topology
(which services start, which credential source the bridge uses); the
on-the-wire data shape does not branch on it.

### Storage isolation in `services/bridge`

Per [design § Storage isolation], the canonical store gains a required
per-record `tenant_id` field passed through the `DiscussionAdapter`
over gRPC. Index keys are `${channel}:${tenant_id}:${discussion_id}`
in every mode; single-tenant mode emits `${channel}:default:${discussion_id}`.
The adapter sets `tenant_id` on save and filters on load; the canonical
`libindex`/`libstorage` stack remains caller-injected and unchanged.
The proto field is required (not optional) and the handler rejects
requests that omit it.

### Callback URL routing

Per [design § Tenant registry], the callback URL is
`/api/callback/:tenant_id/:token` in every mode. The `CallbackRegistry`
stores `(correlation_id, tenant_id, token)` on register; the bridge's
`createCallbackHandler` rejects on consume if the path's `tenant_id`
mismatches the bound value before any body parsing runs. Single-tenant
mode binds `tenant_id = "default"` and emits the three-segment route
with the literal `default` segment. There is no two-segment legacy
route, no dual-path handler, and no grace window — `createBridgeServer`
mounts exactly one callback route shape.

### gRPC peer authentication inside the control plane

The hosted bridges and `services/oidc` reach `services/ghserver` over
gRPC; both callers are inside the control-plane trust boundary. The
substrate that authenticates the gRPC peer connection — mTLS, signed
JWT, mesh-issued credential — is deferred to a follow-on spec per the
design's "What this design does not cover" list. For the initial
delivery, the gRPC server binds to the control-plane's internal
network only (loopback or VPC-internal) and `services/ghserver`
documents the deferred substrate work in its README.

### Code generation

Two new `.proto` files land in `services/tenancy/proto/tenancy.proto`
and `services/ghserver/proto/ghserver.proto`. The standard
`bunx fit-codegen --all` step regenerates `generated/` after each part
that adds or modifies a `.proto`. Worktree boot may need
`bunx fit-codegen --all` explicitly (see
[wiki staff-engineer.md § Recurring Patterns](../../wiki/staff-engineer.md)).

### Multi-tenancy library boundary

The design's [Key decision on tenant resolver placement] keeps the
channel-agnostic interface in `libbridge` while channel-specific
extraction (parsing a GitHub webhook or Bot Framework activity into a
`(channel, channel_tenant_key)` pair) stays in the calling bridge.
Part 04 adds the interface and the default resolver; part 05 wires the
channel-specific extraction in each bridge. `libbridge` gains no new
channel-SDK imports — the existing zero-channel-SDK posture holds.

### Anthropic key boundary

Spec success criterion "The hosted control plane does not read the
customer's Anthropic API key" is verified by a new repository check.
Part 05 Step 10 creates `scripts/check-byok-boundary.mjs` and wires it
into the existing `bun run check` chain. The script enumerates the
hosted control-plane directory list from a single source — a manifest
constant in the script itself, populated from the design's
[§ Components](design-a.md#components) table — and asserts:

- No `package.json` in the manifest lists a runtime dependency under
  `@anthropic-ai/*` (top-level `dependencies` only; transitive deps are
  out of scope because the existing monorepo `bun.lock` audit catches
  them).
- No `.js` / `.mjs` file in the manifest imports from `@anthropic-ai/*`.
- No `.js` / `.mjs` file in the manifest reads an env var matching
  `ANTHROPIC_*`.
- The same patterns are absent from every hosted-path workflow file
  emitted by `kata-setup` (part 06).

The manifest constant is the single source of truth so a future hosted
service added to a CLAUDE.md component table without updating the
manifest is caught by a separate `kata-pattern-synthesis` audit; the
check itself is intentionally narrow.

### Per-tenant rate ceiling

`services/ghserver` enforces a per-tenant mint-rate ceiling before
returning a token. The ceiling value is config-driven on `ghserver`
(default conservative — `10/min` per tenant) and is consulted on every
`MintInstallationToken` call. Exceeding the ceiling returns a typed
`RATE_LIMITED` gRPC error; bridges and `services/oidc` surface it to
their callers (HTTP 429 on the oidc path; gRPC error code on the bridge
path).

### Hosted-path workflow identity contract

The hosted-path call into `services/oidc` follows the GitHub Actions
OIDC token-exchange shape:

```text
POST https://<oidc-host>/token
Authorization: bearer <github-actions-oidc-token>
Body: { audience: "fit-ghserver" }
→ 200 { installation_token, expires_at }
```

`services/oidc` validates the OIDC token (issuer
`https://token.actions.githubusercontent.com`, audience equals the
configured `audience`, JWKS signature, `repository` claim present),
calls `services/ghserver.MintInstallationToken({ repo })` with the
asserted repository, and returns the resulting installation token. The
HTTP shape is fixed in part 03 and consumed by hosted-path workflow
templates in part 06.

## Risks

- **Tenant registry race during `installation` onboarding.** The hosted
  GitHub App fires `installation.created` and may fire
  `installation.repositories_added` for the same repo set before
  `ghbridge` has finished writing the `state = active` row. Part 05
  Step 5 mitigates by deduplicating per-`(installation_id, repo)` pair
  on insert (`tenancy.upsertByPair`) and idempotent state transitions
  on the registry side.

- **gRPC peer authentication substrate deferred.**
  `services/ghserver`'s mint API is unauthenticated at the gRPC level
  in the initial delivery and relies on network isolation (loopback /
  VPC-internal) for caller restriction. A compromise of any
  in-control-plane callable process exposes the mint surface. Part 02
  Step 7 documents the deferral in the service README and adds a
  bind-address check that refuses to start `ghserver` on a non-loopback
  / non-private address without an explicit `allow_public_bind = true`
  config override.

- **OIDC issuer-trust drift.** GitHub's OIDC issuer or JWKS endpoint
  may rotate or change. `services/oidc` caches JWKS for a bounded TTL
  (config default `10 minutes`) and re-fetches on signature
  verification failure. Part 03 Step 3 records this cache TTL knob.

## Verification

Each part's verification section enumerates the spec § Success criteria
rows it covers. Aggregated:

| Spec criterion | Verified by part |
|---|---|
| Hosted GitHub App installable without per-customer App | operator-side; part 06 confirms the hosted templates carry no App registration step |
| Hosted Teams bot installable without per-customer Azure AD app | operator-side; part 06 confirms |
| No `KATA_APP_PRIVATE_KEY` in hosted-path consuming repo | 06 |
| Hosted App signing material not in customer workflow files | 06 |
| Long-running runs not bounded by single credential lifetime | 06 + 02 (re-mint mid-run) |
| Hosted control plane does not read Anthropic API key | 05 (cross-cutting check) |
| Per-tenant state isolation | 05 + part 02 (per-tenant minting) |
| Per-tenant callback verification | 05 |
| Workflow identity scoped to requesting repository | 02 (mint claim ⇒ repo) + 03 (OIDC claim extraction) |
| Self-hosted setup still works | 04 + 05 (single-tenant mode default) |
| `TRUST.md` discoverable | 07 |
| `TRUST.md` enumerates trust model both paths | 07 |
| GitHub-side onboarding requires no operator intervention | 05 (Step 5 install handler) |
| Teams-side onboarding requires no operator intervention | 05 (Step 6 consent handler) |

## Libraries used

`libconfig`, `librpc`, `libstorage`, `libtelemetry`, `libtype`,
`libpreflight`, `libindex`, `libbridge` (existing). The new
`services/ghserver` declares `@octokit/auth-app` in its own
`package.json` (also present in `services/ghbridge`). The new
`services/oidc` declares `@hono/node-server`, `hono`, and `jose` in
its own `package.json` (also present in `services/oauth`,
`libraries/libbridge`, and elsewhere through transitive deps). No
new monorepo-level dependency.
