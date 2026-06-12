# Spec 1600 — Service URL-default source-of-truth assertion

## Persona and job

Hired by **Teams Using Agents** to keep every service's URL default
coherent across the four kinds of surface that restate it — the
service's authoritative manifest, the product CLI that bootstraps a
project, the environment-example files operators copy, and the
public service-contract documentation — so that an agent or operator
following any one surface arrives at a running service rather than
at three contradicting URLs.

The failure mode this gate forecloses is the one an agent meets at
install time: read the published docs, run the bootstrap CLI, land
on an `.env` whose `SERVICE_<name>_URL` does not match either the
docs the agent just read or the docker-example block the operator
will reach next. The same gate serves human contributors who edit
one surface and forget the others, but agents driving installs from
the published docs are the primary tenant.

Related JTBD: *Teams Using Agents — Run a Continuously Improving
Agent Team* ([JTBD.md](../../JTBD.md)). The Little Hire this spec
serves within that job is the install-time URL-touch: the first
service-start or `curl /health` after running the bootstrap CLI,
where the URL the agent reaches must match the URL the surface the
agent just consulted said to use.

## Problem

The monorepo ships sixteen services under `services/`. Every one of
them has a `SERVICE_<name>_URL` row in `.env.*.example`, and most
have additional restatements in `products/guide/src/commands/init.js`
and in `websites/fit/docs/services/` or `websites/fit/docs/internals/`.
**None** of them declare a network URL (or the
`protocol`+`host`+`port` triple that produces one) in their own
`createServiceConfig` manifest. The handful that declare a `port`
(`ghserver: 9201`, `oidc: 9202`) declare a backend port, not the
listen URL the consumer surfaces restate.

The result is structural: for every service, the manifest is silent
and the consumer surfaces are the only places URLs live. When the
consumer surfaces disagree, there is no in-repo authority to
adjudicate.

### Worked example — the MCP service

The MCP service is HTTP-transported (its consumers carry `http://`
URLs and operators connect via `curl /health`) and exhibits a
three-way snapshot disagreement across four surface kinds:

| Surface kind | Path | Restated value | Role of the surface |
|---|---|---|---|
| Service authoritative manifest | `services/mcp/server.js` `createServiceConfig` defaults | not declared | The `defaults` object `services/CLAUDE.md` § Configuration calls "the authoritative manifest of what the service expects" |
| Bootstrap CLI written value | `products/guide/src/commands/init.js` env block | `http://localhost:3005` (the `SERVICE_MCP_URL=` line) | Value `npx fit-guide init` writes to `.env` |
| Operator example (commented) | `.env.docker-native.example`, `.env.docker-supabase.example`, `.env.local.example` | `http://localhost:3011` (the `SERVICE_MCP_URL=` line in each) | Value the operator uncomments to enable the service |
| Public service-contract docs | `websites/fit/docs/services/typed-contracts/index.md` start, `/health` probe, client URL | `http://localhost:3008` | Value a reader copies into a client URL and a `curl /health` probe |

### What the runtime actually does

`services/mcp/server.js` constructs its config with
`createServiceConfig("mcp", { system_prompt: "", tools: "" })` —
declaring only service-specific keys, no network key. `libconfig`
then auto-injects the network keys (`protocol="grpc"`,
`host="0.0.0.0"`, `port=3000`, `path=""`,
`url="grpc://0.0.0.0:3000"`) into the merged config before the
env-override loop, so `SERVICE_MCP_URL` from `.env` *is* resolved
when set. The runtime URL is therefore path-dependent:

| Operator path | Resulting runtime URL |
|---|---|
| Runs `npx fit-guide init` (writes `SERVICE_MCP_URL=http://localhost:3005`), starts MCP | `http://localhost:3005` |
| Uncomments `.env.local.example` (`SERVICE_MCP_URL=http://localhost:3011`), starts MCP | `http://localhost:3011` |
| Follows `typed-contracts/index.md` and exports `SERVICE_MCP_URL=http://localhost:3008` | `http://localhost:3008` |
| No env value at all | `grpc://0.0.0.0:3000` (libconfig's implicit defaults — wrong protocol for the HTTP-based MCP server) |

The structural problem is not that env vars are ignored — they are
resolved. The problem is that no surface in the repo is the
authoritative one: each of the four currently emits or documents a
different value, and the runtime simply binds to whichever surface
the operator happened to follow. The MCP case is the worked example
because its snapshot disagreement is unambiguous; the same shape
applies to every other service, where the manifest is equally
silent and the consumer surfaces have no in-repo authority to
adjudicate.

The declaration question — whether the manifest entry is a `url`
string or a `host`+`port` pair (plus `protocol`) — is a
design-phase choice, and may differ per service. Three of the four
MCP consumer surfaces carry full `SERVICE_<name>_URL` strings, so
whichever form the declaration takes, the gate's job at consumer
surfaces is to assert URL equality against the URL the manifest
produces.

### Recurrence in numbers

The same scalar-URL topology has surfaced as its own one-line
documentation fix twice within a 6-day window (2026-05-31 to
2026-06-06), both on the same documented embedding URL, framed by
one intervening proactive renumber:

| Date | PR | Shape | Drift |
|---|---|---|---|
| 2026-05-31 | PR #1318 | Reactive drift-fix | `internals/vectors/index.md` `SERVICE_EMBEDDING_URL` `3011` → `3012` |
| 2026-06-04 | PR #1413 | App-config refactor with port renumber as side-effect | `.env.*.example` URL block restructured; embedding canonicalized to `3015` |
| 2026-06-06 | PR #1454 | Reactive drift-fix | `internals/vectors/index.md` `SERVICE_EMBEDDING_URL` `3012` → `3015` (second drift on the same documented row inside the 6-day window) |

Two reactive drift-fix PRs in a six-day window on the same row
warrant a build-time assertion at the shape level. The recurrence
evidence is `SERVICE_EMBEDDING_URL` (grpc://) and the snapshot
evidence is `SERVICE_MCP_URL` (http://); the underlying topology
(`SERVICE_<name>_URL=<scheme>://<host>:<port>`, hand-restated
across consumer surfaces) is scheme-agnostic and shared across
both, and the gate that asserts URL equality between manifest and
consumer applies to either without per-scheme branching.

### Why this is not covered by spec 1460

Spec 1460 (enumeration-drift build-time assertion, landed on `main`
at `356f980c` on 2026-06-09) excludes scalar value drift from its
registry, citing the cycle-77 `SERVICE_EMBEDDING_URL` drift as *"a
single-source single-sink scalar drift, a different topology with a
much lower recurrence cadence"* than the list-shaped restatements
it covers. Spec 1600 attacks that excluded slice directly.

The double-drift on the same embedding URL row inside a 6-day
window, and the simultaneous three-way disagreement on the MCP URL,
both challenge the "much lower" half of the comparator's premise.
The "single-source" half is contradicted today: not one of the
sixteen services declares a URL source for the consumer surfaces to
drift away from.

The two registries are disjoint by construction. List-shaped
enumerations (services trees, library counts, sibling tables) and
URL-shaped scalars are different file-or-section-to-asserted-value
topologies, and the gates operate on disjoint consumer paths even
when the consumers live in the same documentation tree.

### Why a docs-only sweep is insufficient

The bare proposal would be: choose a number for each service, fix
the surfaces once, close the issue. That collapses to a docs-only
sweep and leaves the structural cause — no declared
source-of-truth, no programmatic gate — in place. The next URL
renumbering or new-service introduction will reopen the same drift
on the next consumer page, exactly as PR #1318 → PR #1413 →
PR #1454 has demonstrated on the embedding URL.

The structural fix is to declare a URL (or the
`protocol`+`host`+`port` that produces it) in each service's own
`createServiceConfig` defaults and to gate consumer restatements
against that declaration at build time.

## Scope

### In scope

- A **declared URL default** for every service that carries a
  `SERVICE_<name>_URL` consumer-surface restatement, registered in
  the service's authoritative `createServiceConfig` manifest.
  Whether the declaration is shaped as a `url` string or a
  `protocol`+`host`+`port` triple is a design-phase choice and may
  differ per service; the spec requires only that one form exists
  per service and that consumer-side equality can be asserted
  against the URL the manifest produces. Schemes covered: `http://`
  and `grpc://` — the URL equality check is scheme-agnostic and
  the assertion does not branch on scheme.
- A **build-pipeline assertion** that fails CI when any of the
  registered consumer surfaces restates a URL that disagrees with
  the corresponding service's declared URL. The structural
  requirement is that no PR can land on `main` with a stale
  registered consumer; the trigger surface (which named step in the
  documentation-build pipeline, and whether it path-filters on
  registered files or runs on every PR) is a design choice.
- A **trigger population that includes source-side-only edits**.
  A PR that changes a declaration but touches no registered
  consumer must still be gated, so a renumber cannot land green
  with stale consumer pages — the failure mode the PR #1413 →
  PR #1454 sequence exhibited.
- An **error surface** that names the consumer file, the service,
  the disagreeing value, and the declared value so the one-line fix
  is unambiguous from CI output alone.
- A **consumer-side sweep** that brings every currently divergent
  surface into agreement with each service's declared URL at the
  moment the gate is activated, so the gate's first run is green
  across every registered row.
- **A registry shape that admits future services** without
  rewriting the assertion. Adding a row for a new service must be a
  registry-only edit.

### Excluded

- **Choice of the canonical URL value per service.** The spec
  requires that one value be declared and asserted per service; it
  does not pre-decide which port each service binds to. The design
  phase weighs collision risk and continuity with the existing
  docker-example block.
- **List-shaped enumeration drift.** Covered by spec 1460. The two
  gates may share infrastructure but the registries are disjoint:
  no registry row appears in both, and the design phase keeps the
  topology separation explicit.
- **Non-URL scalar drift** (model identifiers, retry thresholds,
  cron schedules, log-level defaults). Excluded for the same
  topology-coupling reason spec 1460 cites; these may earn their
  own spec when their recurrence cadence justifies it.
- **`_CALLBACK_BASE_URL` and `_LINK_BASE_URL` variants** (e.g.,
  `SERVICE_GHBRIDGE_CALLBACK_BASE_URL`,
  `SERVICE_GHUSER_LINK_BASE_URL`). These are configured per
  deployment and have no in-repo default value; the gate asserts
  equality between a declared URL and its restatements, and these
  rows do not have a single declared URL by design. They remain
  out of scope.
- **Free-prose port and URL mentions**, including the user-facing
  summary string `init.js` prints ("ports 3001–3005").
  Sentence-form and list-of-ports references are not parsed by the
  gate. Whether any prose-shaped restatement gains a registry row —
  by way of a parseable structural anchor (regex, AST marker,
  sentinel comment) — is a design-phase choice.
- **Out-of-repo consumers** of the URLs (e.g., the published
  `kata-skills` pack at consumption time, downstream installations'
  own env files, sibling repos). The registry covers only paths
  that live inside `forwardimpact/monorepo`.
- **Implicit-default removal in `libconfig`.** Whether `libconfig`
  should remove its auto-injection of network defaults
  (`grpc://0.0.0.0:3000`) or otherwise refuse to start when no
  manifest key is declared is a separate hardening question. This
  spec assumes that channel continues to exist; the gate's job is
  to make each service's manifest declaration travel through it.
- **Retroactive verification.** The gate activates at merge of the
  implementation and applies to subsequent PRs. Past divergence in
  git history is not backfilled to green.

## Consumer registry (initial)

Every service that carries a `SERVICE_<name>_URL` consumer-surface
restatement is in the initial registry. Not every service appears
in every surface kind — the design phase reads the on-disk state
at implementation time to populate each row's exact set.

In-scope services (16 as of filing): `bridge`, `embedding`,
`ghbridge`, `ghserver`, `ghuser`, `graph`, `map`, `mcp`,
`msbridge`, `oauth`, `oidc`, `pathway`, `tenancy`, `trace`,
`vector`, and any service present under `services/<name>/` at
implementation time whose `createServiceConfig` is consulted to
produce a `SERVICE_<name>_URL` value.

The four surface kinds the registry covers per service:

| Surface kind | Path glob |
|---|---|
| Authoritative manifest | `services/<name>/server.js` `createServiceConfig` defaults |
| Bootstrap CLI | `products/guide/src/commands/init.js` env block (`SERVICE_<name>_URL=` lines) |
| Operator examples | `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example` (`SERVICE_<name>_URL=` rows, commented or uncommented) |
| Public service-contract docs | `websites/fit/docs/services/<topic>/index.md` and `websites/fit/docs/internals/<topic>/index.md` (URLs in code blocks, `curl /health` probes, client constructors) |

The design phase produces a single registry file (path is design's
call) listing each in-scope service with its concrete consumer
paths and the marker convention by which the gate locates each
restated URL on each page.

## Success criteria

| # | Claim | Verification |
|---|---|---|
| 1 | Every in-scope service's authoritative manifest declares a key (or keys) from which the listen URL is derivable. | For each service in the registry: read the service's `createServiceConfig` defaults object after merge; it contains a `url`, or a `protocol`+`host`+`port` triple, that was absent on the spec's parent commit. |
| 2 | Every registered consumer surface restates the URL the corresponding service's manifest produces. | A one-off audit script (independent of the new gate's assertion code) reads each service's manifest-produced URL, locates each registered consumer, and emits a `service → path → restated → expected` table covering every `SERVICE_<name>_URL=` value in each `.env.*.example`, every URL `init.js` writes, and every URL or port restated in the in-scope docs pages. On the merge commit, the table has zero rows where `restated ≠ expected`. |
| 3 | CI fails when a PR introduces a disagreement on any registered consumer surface. | A test PR that edits one consumer to a wrong URL produces a failing CI run whose error message names the service, the consumer file, the disagreeing value, and the declared value. |
| 4 | CI fails when a PR edits a service's declaration but leaves a registered consumer stale. | A test PR that changes one service's declared URL without sweeping its consumers produces a failing CI run naming each stale consumer file. |
| 5 | Adding a new service to the registry is a registry-only edit. | A test PR that adds one new registry row and seeds a disagreement on that row's consumers — with no other source edits — produces a failing CI run whose error surface names the new row's service, consumer, and disagreeing value, identical in shape to the errors emitted on the initial registry's services. |
| 6 | The first run of the gate after activation is green across every registered service. | The implementation's merge commit passes the new check on every row in the initial registry; the consumer-side sweep accomplishes the alignment before the gate becomes active. |

— Technical Writer 📝
