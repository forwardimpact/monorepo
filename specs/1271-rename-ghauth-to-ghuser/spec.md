# Spec 1271: Rename `services/ghauth` to `services/ghuser`

**Persona / job:** Platform Builders —
[give humans and agents shared capabilities through the same interface](../../libraries/README.md#jobs-to-be-done).
A platform builder reaching for a GitHub-identity service must pick the right
one at a glance; the current name makes that ambiguous (see Problem).

## Problem

Spec 1320 (per-user GitHub authentication) shipped `services/ghauth` — a gRPC service that owns the **Kata
Agent User** App and resolves a per-user, user-to-server GitHub token (`ghu_*`)
for a `(surface, surface_user_id)` pair. Spec 1270's design introduces a
sibling, `services/ghserver`, that holds the **Kata Agent Team** App private
key and mints repo-scoped, server-to-server installation tokens (`ghs_*`).

Two naming defects surface once both services exist side by side:

- **`ghauth` is a land-grab name.** It claims the entire "GitHub auth"
  namespace while implementing only the user-to-server half. Its own README
  title is "GitHub **User** Authentication" and its package description is
  "GitHub user authentication — per-user OAuth token lifecycle" — the
  directory name is broader than the service.
- **No symmetry with the arriving sibling.** A reader cannot tell from
  `ghauth` vs `ghserver` which handles which GitHub auth model. The two
  services are a deliberately-separate pair (distinct credentials, distinct
  blast radius — see [spec 1270 design-a](../1270-kata-bridges-public-hosting/design-a.md)),
  and their names should make the user/app split legible.

A naming rule resolves both: name each service after the GitHub token prefix
it deals in. `ghu_*` user tokens → **`ghuser`**; `ghs_*` server tokens →
**`ghserver`**. This spec renames the shipped service to `ghuser`; the
`ghserver` name is established separately in spec 1270.

## Proposal

Rename `services/ghauth` to `services/ghuser` across every active surface,
preserving the service's behaviour and gRPC contract exactly — only
identifiers change. The rename touches the service itself, its published
package identity, its configuration surface, its generated codegen artifacts,
its live consumers, and its documentation.

The rename is purely nominal: the OAuth authorization-code exchange, refresh,
revoke, durable binding storage, and the `GetToken` link/re-auth result
semantics established by spec 1320 are unchanged. A user who linked their
GitHub identity before the rename is not forced to re-link after it.

## Scope

**In scope** — every active occurrence of the `ghauth` identifier moves to
`ghuser`:

| Surface | What changes |
| --- | --- |
| Service directory | `services/ghauth/` → `services/ghuser/` |
| Package identity | `@forwardimpact/svcghauth` → `@forwardimpact/svcghuser`; bin `fit-svcghauth` → `fit-svcghuser` |
| gRPC contract names | proto `package ghauth` → `ghuser`, `service Ghauth` → `Ghuser`, file `proto/ghauth.proto` → `proto/ghuser.proto` (RPCs and message shapes unchanged) |
| Generated codegen | `generated/` artifacts for the service regenerate under the `ghuser` name; no `ghauth` codegen artifact remains |
| Configuration | env vars `SERVICE_GHAUTH_*` → `SERVICE_GHUSER_*` (`_URL`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_LINK_BASE_URL`) in `.env.*.example`, and the documented `init.services` entry in `config/CLAUDE.md` (service name + `svcghuser` package). The generated runtime `config/config.json` is gitignored and refreshed at setup time — not a tracked acceptance surface. |
| Persisted storage path | the service storage namespace moves from `data/ghauth/` to `data/ghuser/`; bindings written before the rename must remain resolvable afterward — a real data move, not a nominal change (the migration mechanism is a design/plan concern) |
| Live consumers | `services/ghbridge`, `services/msbridge`, and `libraries/libbridge` (token-resolver) reference the renamed service/package/contract; `services/oauth`'s provider binding (its `provider` default value and `SERVICE_OAUTH_PROVIDER`, which resolve the backend client **by name**) moves from `ghauth` to `ghuser`. Consumer-side identifiers move with it — the generated client class (`GhauthClient` → `GhuserClient`) and local symbols (`ghauthClient`). |
| Policy + lockfile | `scripts/check-ambient-deps.deny.json` (keyed on the service source path) and `bun.lock` (keyed on the package name) move to the renamed values |
| Documentation | `services/README.md`, `services/ghuser/README.md`, and the `websites/fit/docs/` pages that name the service |

**Out of scope (explicit):**

- Any behaviour, contract-shape, or semantic change. RPC set, message fields,
  token lifecycle, and link/re-auth results are preserved exactly.
- `services/ghserver` (the sibling rename of `apptoken`), established by
  [spec 1270](../1270-kata-bridges-public-hosting/spec.md).
- `services/oauth` keeps its name; only its references to the renamed service
  change.
- Historical spec/design/plan documents (specs `1300`, `1320`, `1340`, `1370`,
  `1380`, and others) are records of decisions at their time and are **not**
  rewritten.

## Success criteria

| # | Criterion | Verification |
| - | --------- | ------------ |
| 1 | The service lives at `services/ghuser/` and starts under `fit-rc`; a smoke gRPC call returns a response. | `bunx fit-rc start ghuser`; `services/ghuser/test/smoke.test.js` |
| 2 | No `ghauth` identifier remains on any active tracked surface. | `rg -i 'ghauth' -g '!specs/**' -g '!wiki/**'` returns nothing — run against tracked files; historical spec/wiki records are excluded by design, `benchmarks/` is skipped via `.rgignore`, and `generated/` + `bun.lock` are regenerated (criteria 3–4) |
| 3 | The package is published under the new name and bin. | `services/ghuser/package.json` declares `name: "@forwardimpact/svcghuser"` and bin `fit-svcghuser`; no `svcghauth`/`fit-svcghauth` string remains on an active surface |
| 4 | The gRPC contract is renamed but shape-preserving. | The source `services/ghuser/proto/ghuser.proto` and, after codegen, `generated/proto/ghuser.proto` declare `package ghuser` and `service Ghuser` with the same five RPCs (`Begin`, `Complete`, `Redeem`, `GetToken`, `Revoke`) and identical message fields as the pre-rename contract; no `ghauth` proto/codegen artifact remains under `generated/` |
| 5 | Configuration moved on tracked surfaces. | No `SERVICE_GHAUTH_*` key appears in any `.env.*.example` and the corresponding `SERVICE_GHUSER_*` keys are present; the documented `init.services` entry in `config/CLAUDE.md` names `ghuser` and `@forwardimpact/svcghuser` (the gitignored runtime `config/config.json` is refreshed at setup time and is not part of this check) |
| 6 | Live consumers resolve the renamed service and stay green. | `services/ghbridge`, `services/msbridge`, `services/oauth`, and `libraries/libbridge` reference `ghuser`; `bun run check` and `bun run test` pass |
| 7 | Behaviour is unchanged. | The migrated spec-1320 acceptance tests pass unchanged under `services/ghuser/test/` — `query-linked`, `query-unlinked`, `query-reauth`, `query-contract`, `persistence`, `identity-verification`, and `smoke` |
| 8 | A pre-rename link survives. | A binding seeded under the pre-rename storage namespace (`data/ghauth/`) is resolvable via `GetToken` through the renamed service after a fresh start, with no re-link required — `services/ghuser/test/migration.test.js` |
| 9 | Documentation names the renamed service. | `services/README.md`, `websites/fit/docs/getting-started/contributors/index.md`, `websites/fit/docs/services/bridge-conversations/index.md`, and `websites/fit/docs/services/bridge-discussions/index.md` reference `ghuser`; none reference `ghauth` |
