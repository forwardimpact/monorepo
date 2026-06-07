# Spec 1600 — MCP service URL-default source-of-truth assertion

## Persona and job

Hired by **Teams Using Agents** to keep MCP service URL defaults
coherent across the four kinds of surface that restate them — the
service's authoritative manifest, the product CLI that bootstraps a
project, the environment-example files that operators copy, and the
public service-contract documentation — so that an agent or operator
following any one surface arrives at a running service rather than
at three contradicting URLs.

The failure mode this gate forecloses is the one an agent meets at
install time: read the published docs, run the bootstrap CLI, land
on an `.env` whose `SERVICE_MCP_URL` does not match either the docs
the agent just read or the docker-example block the operator will
reach next. The same gate serves human contributors who edit one
surface and forget the others, but agents driving installs from the
published docs are the primary tenant.

Related JTBD: *Teams Using Agents — Run a Continuously Improving
Agent Team* ([JTBD.md](../../JTBD.md)).

## Problem

The MCP service has no single declared default for its listen URL.
The four kinds of surface that restate the URL today carry three
distinct values, and the service's own manifest declares none of
them:

| Surface kind | Path | Restated value | Role of the surface |
|---|---|---|---|
| Service authoritative manifest | `services/mcp/server.js` `createServiceConfig` defaults | not declared | The `defaults` object `services/CLAUDE.md` § Configuration calls "the authoritative manifest of what the service expects" |
| Bootstrap CLI written value | `products/guide/src/commands/init.js` env block | `http://localhost:3005` | Value `npx fit-guide init` writes to `.env` |
| Operator example (commented) | `.env.docker-native.example`, `.env.docker-supabase.example`, `.env.local.example` | `http://localhost:3011` | Value the operator uncomments to enable the service |
| Public service-contract docs | `websites/fit/docs/services/typed-contracts/index.md` start, `/health` probe, client URL | `http://localhost:3008` | Value a reader copies into a client URL and a `curl /health` probe |

A fifth, internal contradiction lives on the Bootstrap CLI surface:
the user-facing summary `init.js` prints describes the service URLs
it writes as "ports 3001–3005", but the same file writes URLs up to
port 3007. This is one self-contradicting surface (not a separate
consumer) and is included here because the consumer-side sweep
needs to reconcile it.

### What the runtime actually does

`services/mcp/server.js` constructs its config with `createServiceConfig("mcp", { system_prompt: "", tools: "" })` — declaring only service-specific keys, no network key. `libconfig` then auto-injects the network keys (`protocol="grpc"`, `host="0.0.0.0"`, `port=3000`, `path=""`, `url="grpc://0.0.0.0:3000"`) into the merged config before the env-override loop, so `SERVICE_MCP_URL` from `.env` *is* resolved when set. Which means the runtime URL is path-dependent:

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
the operator happened to follow. A reader of the public docs (3008)
who runs the bootstrap CLI (writes 3005) and then consults the
docker-example block (3011) has no mechanical way to know which
surface to trust.

The declaration question — whether the manifest entry is a `url`
string or a `host`+`port` pair (plus `protocol`, since libconfig
defaults `protocol="grpc"` while MCP is HTTP) — is a design-phase
choice. Three of the four consumer surfaces carry full
`SERVICE_MCP_URL` strings, so whichever form the declaration takes,
the gate's job at consumer surfaces is to assert URL equality
against the URL the manifest produces.

### Recurrence in numbers

`SERVICE_*_URL`-shaped scalar drift has surfaced as its own one-line
documentation fix twice in the 7 days from 2026-05-31 to
2026-06-06, both on the same documented embedding URL, framed by
one intervening proactive renumber:

| Date | PR | Shape | Drift |
|---|---|---|---|
| 2026-05-31 | PR #1318 | Reactive drift-fix | `internals/vectors/index.md` `SERVICE_EMBEDDING_URL` `3011` → `3012` |
| 2026-06-04 | PR #1413 | App-config refactor with port renumber as side-effect | `.env.*.example` URL block restructured; embedding canonicalized to `3015` |
| 2026-06-06 | PR #1454 | Reactive drift-fix | `internals/vectors/index.md:80` `SERVICE_EMBEDDING_URL` `3012` → `3015` (second drift on the same documented row in 7 days) |

A note on protocol: PRs #1318 and #1454 fix a `grpc://` URL value,
not HTTP, and § Consumer registry below scopes the initial gate to
HTTP-shaped `SERVICE_*_URL` values. The cited evidence is therefore
analogous, not within scope: same `SERVICE_*_URL=<scheme>://localhost:NNNN`
topology, same hand-restated-value failure shape, different scheme.
The recurrence cadence motivates the *gate*; the *initial registry*
covers MCP only and the design phase decides whether `grpc://` URLs
are admitted alongside.

### Why this is not covered by spec 1460

Spec 1460 (enumeration-drift build-time assertion, PR #1373 open at
filing time) excludes scalar value drift from its registry, citing
the cycle-77 `SERVICE_EMBEDDING_URL` drift as *"a single-source
single-sink scalar drift, a different topology with a much lower
recurrence cadence"* than the list-shaped restatements it covers.
Spec 1600 attacks that excluded slice directly.

The 7-day double-drift on the same embedding URL row, and the
simultaneous three-way disagreement on the MCP URL, both challenge
the "much lower" half of the comparator's premise. The
"single-source" half is contradicted for MCP at this moment:
there is no declared single source to drift away from.

Sequencing: spec 1460 is not yet on `main`. If 1460's exclusion
wording shifts during its own review, the wording quoted here will
go stale; the structural argument (different registry topology, no
mechanical entanglement between list-shaped and scalar gates) does
not depend on the quoted exclusion remaining verbatim.

The two registries are disjoint by construction. List-shaped
enumerations (services trees, library counts, sibling tables) and
URL-shaped scalars are different file-or-section-to-asserted-value
topologies, and the gates operate on disjoint consumer paths even
when the consumers live in the same documentation tree.

### Why a docs-only sweep is insufficient

The bare proposal would be: choose a number, fix the four surfaces
once, close the issue. That collapses to a docs-only sweep and
leaves the structural cause — no declared source-of-truth, no
programmatic gate — in place. The next URL renumbering or new-service
introduction will reopen the same drift on the next consumer page,
exactly as PR #1318 → PR #1413 → PR #1454 has demonstrated on the
embedding URL.

The structural fix is to declare a URL (or the `protocol`+`host`+`port`
that produces it) in the service's own `createServiceConfig` defaults
and to gate consumer restatements against that declaration at build
time.

## Scope

### In scope

- A **declared URL default** for the MCP service, registered in the
  service's authoritative manifest. Whether the declaration is shaped
  as a `url` string or a `protocol`+`host`+`port` triple is a
  design-phase choice; the spec requires only that one form exists and
  that consumer-side equality can be asserted against the URL the
  manifest produces.
- A **build-pipeline assertion** that fails CI when any of the
  registered consumer surfaces restates a URL that disagrees with
  the MCP service's declared URL. The assertion runs on every PR
  that touches a registered consumer file or the declaration
  itself; which named step in the documentation-build pipeline it
  attaches to is a design choice.
- A **trigger population that includes source-side-only edits**.
  A PR that changes the declaration but touches no registered
  consumer must still be gated, so a renumber cannot land green
  with stale consumer pages — the failure mode the PR #1413 →
  PR #1454 sequence exhibited.
- An **error surface** that names the consumer file, the
  disagreeing value, and the declared value so the one-line fix is
  unambiguous from CI output alone.
- A **consumer-side sweep** that brings the four currently
  divergent surfaces into agreement with the declared URL at the
  moment the gate is activated, so the gate's first run is green.
  The `init.js` self-contradicting summary string ("ports
  3001–3005") is part of the sweep.
- **A registry shape that extends to other `SERVICE_*_URL`
  services** without rewriting the assertion. Adding a row for the
  embedding service or any other service must be a registry-only
  edit. Which services are activated at implementation time is a
  plan-phase choice; the spec requires the registry to be
  extension-shaped, not MCP-specific.

### Excluded

- **Choice of the canonical URL value.** The spec requires that one
  value be declared and asserted; it does not pre-decide whether the
  port is `3005`, `3008`, `3011`, or another free slot. The design
  phase weighs collision risk — port `3005` is already taken by
  `SERVICE_PATHWAY_URL` in every `.env.*.example` — against the
  docker-example block's existing port plan.
- **List-shaped enumeration drift.** Covered by spec 1460. The two
  gates may share infrastructure but the registries are disjoint:
  no registry row appears in both, and the design phase must keep
  the topology separation explicit.
- **Non-URL scalar drift** (model identifiers, retry thresholds,
  cron schedules, log-level defaults). Excluded for the same
  topology-coupling reason spec 1460 cites; these may earn their
  own spec when their recurrence cadence justifies it.
- **Free-prose port and URL mentions** outside the registered
  consumer surfaces. Sentence-form references such as "runs on
  port 3008" in narrative paragraphs are not parsed. The
  `init.js` summary string is included because it lives on a
  registered surface; arbitrary prose elsewhere is not.
- **Out-of-repo consumers** of the URL (e.g., the published
  `kata-skills` pack at consumption time, downstream installations'
  own env files, sibling repos). The registry covers only paths
  that live inside `forwardimpact/monorepo`.
- **Implicit-default removal in `libconfig`.** Whether `libconfig`
  should remove its auto-injection of network defaults
  (`grpc://0.0.0.0:3000`) or otherwise refuse to start when no
  manifest key is declared is a separate hardening question. This
  spec assumes that channel continues to exist; the gate's job is
  to make the manifest declaration travel through it.
- **`grpc://`-scheme registry rows.** The initial MCP entry is HTTP.
  Whether the same gate admits `grpc://` URLs (which would let the
  embedding service join the registry against its existing
  consumers) is a design-phase choice; the spec's required member
  is the MCP HTTP URL only.
- **Retroactive verification.** The gate activates at merge of the
  implementation and applies to subsequent PRs. Past divergence in
  git history is not backfilled to green.

## Consumer registry (initial)

The MCP row is the only entry required at implementation. Two
additional row shapes are listed to motivate the extension-shape
requirement and to make the consumer-side sweep scope concrete;
whether they are activated in the first implementation PR or in
follow-ups is a plan-phase choice (and success criterion 6 binds
the first-run-green guarantee to whichever rows are activated).

| Service | Authoritative declaration | Consumer surfaces |
|---|---|---|
| `mcp` | `services/mcp/server.js` `createServiceConfig` defaults | `products/guide/src/commands/init.js` env block + summary string, `.env.local.example`, `.env.docker-native.example`, `.env.docker-supabase.example`, `websites/fit/docs/services/typed-contracts/index.md` |
| `embedding` (illustrative extension) | `services/embedding/server.js` `createServiceConfig` defaults | `.env.*.example` rows, `websites/fit/docs/internals/vectors/index.md` |
| Other `SERVICE_*_URL` services (extension shape) | each service's `server.js` `createServiceConfig` defaults | `.env.*.example` rows + the matching service-docs page on `www.forwardimpact.team` |

The embedding and "other services" rows are illustrative — the
implementation may activate them, defer them, or admit them in a
follow-up PR without disturbing the gate's assertion code.

## Success criteria

| # | Claim | Verification |
|---|---|---|
| 1 | The MCP service's authoritative manifest declares a key (or keys) from which the listen URL is derivable. | Read `services/mcp/server.js`'s `createServiceConfig` defaults object after merge: it contains a `url`, or a `protocol`+`host`+`port` triple, that was absent on the spec's parent commit. |
| 2 | The four MCP consumer surfaces restate the URL the manifest produces. | An audit independent of the new gate compares the URL the manifest produces against the value at each consumer (the `SERVICE_MCP_URL=` value in each `.env.*.example`, the value written by `init.js`, and the port number used in `typed-contracts/index.md`'s start/`/health`/client-URL examples). The audit returns zero disagreements on the merge commit. |
| 3 | CI fails when a PR introduces a disagreement on any registered consumer surface. | A test PR that edits one consumer to a wrong URL produces a failing CI run whose error message names the consumer file, the disagreeing value, and the declared value. |
| 4 | CI fails when a PR edits the declaration but leaves a registered consumer stale. | A test PR that changes the declared URL without sweeping consumers produces a failing CI run naming each stale consumer file. |
| 5 | Adding another service to the registry is a registry-only edit. | The assertion code's only dependency on per-service information is the registry; demonstrated by reading the implementation, no per-service branching in the assertion. |
| 6 | The first run of the gate after activation is green. | The implementation's merge commit passes the new check on every activated registry row; the consumer-side sweep accomplishes the alignment before the gate becomes active. |

— Technical Writer 📝
