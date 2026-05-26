# Spec 1020 — Node.js runtime floor alignment

**Persona / job:** Engineering Leaders — _Measure Engineering Outcomes_
(primary, via Landmark); Empowered Engineers — _Find Growth Areas_
(secondary, via Guide + Landmark). The runtime-floor mismatch lives at the
activation funnel both jobs share: an external evaluator installs a published
`@forwardimpact/*` package on the Node version the docs advertise and hits a
hard stop inside the documented flow before any product output is seen.

## Problem

Ten getting-started pages under `websites/fit/docs/getting-started/` advertise
`Node.js 18+` as the runtime floor — every `{leaders,engineers}/<product>/`
guide plus the two top-level role index pages. Every `package.json` in the
monorepo that declares an `engines.node` field — every product, library,
service, and the workspace root — sets that field to `>=18.0.0`. The
published floor at both the doc surface and the manifest surface is the
same: Node 18.

The published floor is not the floor the runtime requires. Every published
package whose dependency graph reaches `@supabase/supabase-js` — at the time
of writing, three products (`@forwardimpact/{map,landmark,summit}`), one
library (`@forwardimpact/libterrain`), and one service
(`@forwardimpact/svcmap`) — transitively loads `@supabase/realtime-js`. On
any Node release that does not expose `globalThis.WebSocket`, the upstream
realtime package throws an `Error` during the supabase client's eager
construction of a realtime client, with text shipped by the upstream
package verbatim: `Node.js <N> detected without native WebSocket support.`
for Node <22 and `Node.js <N> detected but native WebSocket not found.` for
Node 22+ that lacks the constructor. The user-visible failure is
upstream-authored, not product-authored, and it surfaces during client
construction — so commands that never open a realtime channel still hit it.

User testing on issue
[#956](https://github.com/forwardimpact/monorepo/issues/956) reproduced the
mismatch end-to-end. The persona — a BioNova IT Director (J100 EM) hiring
Landmark against the _Measure Engineering Outcomes_ job — installed on the
Node 20 line that the getting-started page explicitly admits, ran
`fit-map people push` partway through the documented Map-setup flow, and saw
the upstream realtime error. The message reads as a tool defect rather than
a prerequisite check, several steps into a flow the docs presented as
supported. The persona worked around with a manual Node bump and a wrapper
script and proceeded to a successful evaluation — but the workaround is
exactly the kind of out-of-band step the activation funnel is built to
prevent.

Upstream has already taken its position. Supabase officially dropped Node 18
on 2025-10-31 (the `engines.node` field in `@supabase/{auth,functions,
storage}-js` moved to `>=20.0.0` in that release line), supports Node 20 in
the client libraries, and gates realtime on Node 22+ native WebSocket — the
channel that produces the upstream error above. The monorepo's published
floor is two major versions older than upstream's realtime floor; in the
meantime the Node release calendar has moved past every floor below 22. Node 18 reached end-of-life
on 2025-04-30 (over a year before this spec). Node 20 reached end-of-life
on 2026-04-30 (17 days before this spec). Node 22 entered Maintenance LTS
on 2025-10-21 and remains in maintenance through April 2027. Node 24 has
been the Active LTS line since 2025-10-28. On the date this spec is
written, Node 22 is the lowest Node line still receiving upstream support,
and Node 24 is the current Active LTS.

The downstream effect cascades through the job's forces. The _Measure
Engineering Outcomes_ job's **Anxiety** force ("measurement feels like
surveillance regardless of intent") activates the moment the persona reads an
error message that looks authored by the product; the **Pull** ("system-level
trends that show direction without naming individuals") never gets a fair
read because the persona never reaches a Landmark output. The same activation
gate applies to the _Find Growth Areas_ job: an engineer evaluating Guide +
Landmark on the documented floor hits the same wall before any career
guidance surface is exercised. The pattern is identical to spec 0950's auth
wall: the product positioning matches the JTBD, but the activation step
disqualifies the tool before any output is felt — except here the gate is in
the runtime rather than the auth layer, and it lives at the boundary between
what the docs and manifests advertise and what the runtime requires.

The two surfaces — docs and manifests — must move together. A doc-only
correction leaves the manifests authoritative for installer tooling
(`npm install` accepts the wrong floor); a manifest-only correction leaves
the docs lying. The correction has to be a single coherent floor decision
applied at every surface that names the floor.

## Why now

- Node 20 LTS reached end-of-life 17 days before this spec (2026-04-30). The
  one user-relevant Node line older than 22 that the published floor still
  authorizes is itself unsupported by upstream Node now. The doc/manifest
  delta has crossed a calendar boundary.
- Supabase realtime's Node 22+ gate has been in place since the same
  2025-10-31 release line in which Supabase dropped Node 18. The
  monorepo's published floor has been wrong against upstream for
  roughly six months.
- The diagnostic surface is the user-facing CLI of high-priority external
  products in active user testing. Issue #956 lands in a cluster of recent
  external-vs-internal friction issues filed inside the same user-testing
  cadence ([#921](https://github.com/forwardimpact/monorepo/issues/921) on
  Landmark auth-wall demo path,
  [#940](https://github.com/forwardimpact/monorepo/issues/940) on
  `fit-codegen` shared-proto packaging) — every clean-machine activation
  hits a wall internal contributors never see, and the runtime floor is the
  broadest of the three.
- The decision compounds: every new product, library, or service added to
  the monorepo today inherits `engines.node >=18.0.0` from the workspace
  template. Resolving the floor here prevents two more years of drift.

## Strategic decision: Node.js 22+ floor everywhere

The triage comment on #956
([c4467659452](https://github.com/forwardimpact/monorepo/issues/956#issuecomment-4467659452))
enumerated three design-space options. The strategic question — which Node
floor to publish — is a WHAT decision the spec resolves. The mechanism
questions (which file declares the floor, whether a startup preflight is
added, how the preflight surfaces the failure, what message text is shown)
are HOW decisions the design phase resolves.

| Option | Floor | Disposition |
| --- | --- | --- |
| A — Set the floor at the lowest Node line that satisfies upstream realtime's native-WebSocket gate. | Node 22 | **Chosen** |
| B — Keep the floor at the previous LTS line and supply a user-installed WebSocket transport to upstream realtime. | Node 20 | Rejected |
| C — Keep the floor at the previously published version and add a per-command preflight that names the actual per-command requirement. | Node 18 | Rejected |

**Why Option A.** Node 22 is the lowest Node line still receiving upstream
support on the date this spec is written. Node 18 has been end-of-life for
over a year; Node 20 reached end-of-life inside the two weeks before this
spec. Node 22 is the line at which Supabase realtime's native-WebSocket
gate is satisfied, so setting the floor at 22 ends the doc/manifest/runtime
disagreement at the lowest version that does so. Node 24 (the current
Active LTS) is also above the floor and is a supported runtime under this
option; the floor is the contract minimum, not a recommended target. A
future spec can raise the floor again when Node 22 itself reaches
end-of-life (scheduled April 2027), at which point the upstream calendar
forces the next move; until then, Node 22 is the broadest install matrix
that keeps every surface claim true.

**Why not Option B.** Keeping a Node 20 baseline requires installing a
WebSocket transport polyfill and routing the realtime client through it
across every package whose graph touches `@supabase/supabase-js`. That adds
a runtime transport seam the product owns and must keep in sync with
upstream's transport-option contract. The polyfill answer also ages out:
every Node 20 user is already past LTS support, so the maintenance cost is
incurred to keep a deprecated runtime in the funnel. Carrying that cost is
the wrong trade.

**Why not Option C.** A per-command preflight at startup that names the
actual floor preserves the broadest install matrix but leaves the published
floor wrong at every surface that names it. The docs still advertise 18+,
the manifests still permit 18+, and the only correction lives inside CLI
output the user sees after install. The doc/manifest claim and the runtime
claim continue to disagree — the friction surface moves but does not close.

## Scope

### In scope

| Component | What changes |
|---|---|
| Documentation runtime-floor claims | Every getting-started page under `websites/fit/docs/getting-started/` that names a Node version advertises the chosen floor. The set today is ten pages (every `{leaders,engineers}/<product>/index.md` plus the two role-level index pages). Exact phrasing and placement within each page are HOW choices. The contributors getting-started page advertises Bun rather than Node and is unchanged. |
| Package manifest `engines.node` | Every `package.json` in the monorepo workspace that declares an `engines.node` field carries the chosen floor as its lower bound. No manifest is exempted. The exact version-range syntax and whether `engines.npm` is also asserted are HOW choices. |
| Product-authored runtime-floor failure | An unsupported-Node invocation of any published product CLI surfaces a product-authored failure that names the chosen floor and the detected Node version, not the upstream realtime error. The spec requires the observable property; the mechanism that produces it — a preflight check in each `bin/` entry, a shared helper, an install-time gate, an engines-strict configuration, or any other route — is a HOW choice the design phase resolves. |

### Out of scope, deferred

- **Library-package floor exemptions.** A future spec may consider whether
  pure-library packages with no Supabase, no WebSocket, and no `bin/` entry
  could carry a lower `engines.node` floor than the product CLIs.
  v1 sets one floor across every `engines.node`-declaring manifest, with
  the rationale that a workspace-wide consistent floor is easier to verify
  and maintain than a per-package matrix, and that workspaces inheriting
  `engines` from the workspace root encourage uniformity by design.
  Splitting the floor by package class is deferred.
- **Bun version floor.** The contributors guide advertises Bun 1.2+ as the
  monorepo's local toolchain. Whether to bump the Bun floor or align it
  with Node 22's calendar is a separate question for a separate spec.
- **`peerDependencies` floor on `node`.** v1 only touches `engines.node`.
  Whether any published package should also declare a peer dependency on a
  Node range, and whether `optionalDependencies` should change, is deferred.
- **Upstream package floor follow-ons.** Whether to bump `@supabase/*`,
  `@grpc/*`, or other published dependencies in the same pass is deferred.
  This spec moves only the Node floor.
- **Realtime-transport injection.** A user-supplied WebSocket transport
  (the Option B mechanism) is not added. If a future spec decides to
  broaden the floor below the upstream native-WebSocket gate, it can
  revisit the transport-option contract at that time.
- **CI matrix changes.** Whether the GitHub Actions test matrix drops Node
  18 and Node 20 jobs, adds Node 22+ jobs, or restructures the matrix is a
  HOW choice the design phase resolves. The spec does not constrain the
  matrix shape beyond the observable property in Success Criteria below
  that CI verifies the chosen floor.
- **Skill-pack and composite-action runtimes.** `forwardimpact/{kata-agent,
  fit-eval,fit-benchmark}` composite actions and `kata-skills`/`fit-skills`
  skill packs run inside hosted runners with their own Node version. Whether
  those surfaces also publish the chosen floor is deferred.
- **`fit-doc serve` / website-build runtime.** The four `websites/`
  buildable sites run through `fit-doc`; their build-time Node floor is
  covered by the workspace-wide change but no doc-build pipeline behavior
  is in scope to verify here.
- **External Outpost installation.** The downstream `forwardimpact/outpost`
  repo carries its own `engines.node` outside this workspace. Whether to
  open a follow-up PR there is a HOW choice for the design or
  implementation phase.

## Success Criteria

The "chosen floor" throughout this section is **Node 22** (per § Strategic
decision). Verifications are stated as observable properties; the mechanism
each test uses to observe the property is a HOW choice for the design or
implementation phase.

| Claim | Verification |
|---|---|
| Every getting-started page that advertises a Node version advertises Node 22. | Test: every Node-version reference under `websites/fit/docs/getting-started/{leaders,engineers}/` names Node 22 and no other Node version. The contributors page is excluded because it advertises Bun rather than Node. |
| Every monorepo `package.json` `engines.node` field declares Node 22 as its lower bound. | Test: every `package.json` under `products/`, `libraries/`, `services/`, and the workspace root that carries an `engines.node` field declares a range whose lower bound is Node 22. No manifest is exempted. |
| The docs, the manifests, and the preflight publish the same Node floor as one another. | Test: the floor named on any one doc page, any one manifest, and the preflight failure message agree on Node 22. The verification is a single-source comparison, not three independent checks. |
| Invoking a published product CLI on a Node version below Node 22 surfaces a product-authored failure that names the floor and the detected version. | Test: invoking any published product CLI's entry-point script under Node <22 exits non-zero with output that names Node 22 as the required floor and the detected Node version, and that output does not contain either of the upstream realtime strings (`Node.js <N> detected without native WebSocket support.` or `Node.js <N> detected but native WebSocket not found.`). |
| Invoking a published product CLI on a Node version at or above Node 22 surfaces no runtime-floor failure. | Test: invoking any published product CLI on Node ≥22 produces the command's normal output. Running `fit-map people push` (and any other command that constructs a Supabase client) on Node ≥22 produces output that does not contain either of the two upstream realtime strings. |
| CI verifies the floor. | Test: the CI workflows that exercise the published product CLIs run against Node 22 or higher; no scheduled job targets a Node version below 22. The observable property is that a regression which drops a manifest's `engines.node` below the floor, or which lets an unsupported-Node invocation pass without the product-authored preflight failure, causes CI to fail. The exact workflow names and matrix shape are HOW choices. |
| `npm install` warns when the installer's Node is below the floor. | Test: running `npm install <published-package>` on Node <22 produces npm's `EBADENGINE` warning naming Node 22. This warning is emitted by the npm client when `engines.node` does not match the installer's Node version and does not by itself fail the install unless the installer sets `engine-strict=true`; the spec does not require install failure at this surface, only that the warning is the warning npm emits when the manifest is configured correctly. |
| The upstream realtime error is not the user-visible failure on the documented flow at any Node version. | Test: following the published getting-started flow for any of Landmark, Map, or Summit, the user sees neither upstream realtime string at any Node version — at Node ≥22 because no error is raised, at Node <22 because the product-authored failure intercepts the flow before the upstream error would surface. |
