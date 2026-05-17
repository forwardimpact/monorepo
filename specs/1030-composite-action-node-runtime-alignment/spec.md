# Spec 1030 — GitHub Actions composite-action Node runtime alignment

**Persona / job:** Internal contributor — operator of the Kata Agent Team
and adjacent CI workflows. The operational hire is to keep CI logs
readable so trusted reviewers can monitor agent runs without sifting
through GitHub Actions deprecation banners, and to avoid the
hard-failure scramble that arrives when GitHub eventually retires the
`node20` runner. The role is not enumerated in
[`JTBD.md`](../../JTBD.md), which carries external-product jobs only.
The Kata product ([CLAUDE.md § Primary
Products](../../CLAUDE.md#primary-products)) hires Teams Using Agents
(per [spec 1010](../1010-jtbd-teams-using-agents/spec.md)); this spec
sits at the operations substrate that product runs on.

## Problem

Two composite-action `using:` declarations the monorepo controls name
`node20` — the Node.js LTS line that reached end-of-life on 2026-04-30:

| File (at the named ref) | Owner |
|---|---|
| `.github/actions/post-run/action.yml` line 7 (this monorepo, `main` HEAD) | this monorepo |
| `forwardimpact/kata-agent/post-run/action.yml` line 7 (sibling repo, `v1` tag → commit `8dc1ec06c102325d20f512c6d42d41520749da64` at spec authoring time on 2026-05-17; the force-tag move this spec invokes will replace the SHA) | sibling-repo `v1` tag; edit and force-tag procedure per [`.github/CLAUDE.md` § Editing a published action](../../.github/CLAUDE.md) |

Both files mirror the same Node-JavaScript composite action (`post-run`
— defers a shell command to job cleanup, used by `bootstrap` to push
the wiki on job end). Two distinct consumption paths reach a `post-run`
action declared with `using: node20`:

- **Local path.** Workflows that invoke `./.github/actions/bootstrap`,
  which internally calls `./.github/actions/post-run` when a token is
  set. 16 workflow files at `main` HEAD consume `bootstrap`
  (`check-*`, `eval-*`, `kata-interview`, `agent-react`, the four
  `website-*`, the three `publish-*` — full set verified by
  `rg 'actions/bootstrap' .github/workflows`).
- **Sibling path.** Workflows that invoke `forwardimpact/kata-agent@v1`,
  whose internal `post-run/` action carries the same `using: node20`.
  3 workflow files at `main` HEAD consume `kata-agent@v1`:
  `agent-team`, `kata-coaching`, `kata-storyboard` — the workflows
  that drive the Kata loop.

Workflow runs on both paths inherit a deprecation warning in the run
log of the form `Node.js 20 actions are deprecated. Please update the
following actions to use Node.js 22: …`. The warning is non-fatal today
but has two costs:

- **Signal degradation now.** Internal contributors and `agent-react`
  triage scan CI run logs to assess agent health. A deprecation banner
  pinned to the top of every job page pushes real failure signal further
  down the surface.
- **Hard-failure cliff later.** GitHub's published deprecation calendar
  removed `node12` and `node16` runners after a warning period in prior
  years (announcements on
  [actions/runner](https://github.blog/changelog/2023-09-22-github-actions-transitioning-from-node-16-to-node-20/)
  and similar). The `node20` runner will follow the same trajectory;
  the removal date is not yet announced but is bounded by the Node 20
  EOL that has already passed.

The two surfaces must move together. A local-only bump leaves the
sibling-path workflows still showing the warning; a sibling-only bump
leaves the `website-*`/`publish-*` workflows still showing it. The
sibling-repo edit also requires the force-tag move documented in
`.github/CLAUDE.md`, so it cannot be incidental to another change.

### What is *not* the problem

- The other two sibling composite-action repos —
  `forwardimpact/fit-eval` and `forwardimpact/fit-benchmark` — both
  declare `using: composite` (shell-only) at the root, with no
  Node-runtime declaration. Issue
  [#975](https://github.com/forwardimpact/monorepo/issues/975)
  speculated they "likely" carried `node20`; observed state at HEAD of
  `forwardimpact/{fit-eval,fit-benchmark}@main` shows they do not.
  Bringing them into scope would be a false expansion.
- `actions/setup-node@v6.4.0` invocations across every workflow already
  pin `node-version: 22` (six workflow files at `main` HEAD). The drift
  is concentrated entirely in the `using:` field of the two
  `post-run/action.yml` files identified above.

## Why now

- Spec 1020 (PR
  [#971](https://github.com/forwardimpact/monorepo/pull/971), currently
  `spec draft` per `wiki/STATUS.md`) explicitly defers "skill-pack and
  composite-action runtimes" in its § Out of scope, deferred. This spec
  fills exactly that sibling slot, and inherits 1020's chosen Node
  version line so the two outstanding Node decisions resolve coherently
  in the same calendar window.
- Node 20 reached end-of-life on 2026-04-30 (17 days before this
  spec's authoring date of 2026-05-17). The GitHub Actions runner has
  begun surfacing the deprecation warning on every workflow run;
  reported by @dickolsson on
  [PR #971 issuecomment-4470574745](https://github.com/forwardimpact/monorepo/pull/971#issuecomment-4470574745):
  > Some of [the workflows] throw warnings due to deprecated workflow
  > features from older Node versions.
- `agent-team.yml` runs three times per day on scheduled crons (03:00,
  12:00, and 20:00 Paris time) and on manual dispatch; each invocation
  adds a deprecation banner to the run-log surface that the trusted
  human reviewer reads when triaging the team.

### Coherence with spec 1020

Spec 1020 chose **Node 22** as the product-CLI floor on a documented
LTS-calendar rationale (Node 22 in Maintenance LTS through April 2027).
This spec adopts the same Node-line decision for the composite-action
runtime so that:

- The next calendar-driven bump (when Node 22 reaches EOL) moves both
  surfaces in one pass rather than at staggered cadences.
- The monorepo's two outstanding Node decisions name the same line in
  the same window — no internal contradiction across product-CLI floor
  vs. CI-action runtime.

The dependency on spec 1020 is the load-bearing one: this spec inherits
1020's chosen Node major version line, and 1020 is currently
unapproved (`spec draft`). § Strategic decision below carries the
revisit clause if 1020 shifts before this spec lands.

## Strategic decision: Node 22 in the composite-action `using:` fields

The WHAT/WHY constraint this spec sets is that the runtime declared in
both `post-run/action.yml` files (local and sibling) must:

1. Name the runtime the GitHub Actions `Node.js 20 actions are
   deprecated` warning text asks workflows to move to (currently Node
   22).
2. Name the same Node major version line spec 1020 sets for the
   product CLIs (currently Node 22).

At the date this spec is written, both requirements jointly identify
**`node22`** (Node 22). The success criteria below name `node22` as
the WHAT decision the spec records. If either requirement changes
before this spec lands — GitHub's warning text starts naming `node24`,
or spec 1020 (still `spec draft`) lifts its floor — the Strategic
decision section and the success criteria are revisited together.
Mechanism of the edit (which tool, which commit message, how the
force-tag move is sequenced, which workflow run is inspected
post-merge) is HOW, deferred to the design and implementation phases.

## Scope

### In scope

| Surface | Change kind |
|---|---|
| `.github/actions/post-run/action.yml` | `using:` field carries the chosen runtime. |
| `forwardimpact/kata-agent` `v1` tag (`post-run/action.yml`) | `using:` field carries the chosen runtime. The `v1` tag points to a commit at which the file declares the chosen runtime. Edit and force-tag move follow [`.github/CLAUDE.md` § Editing a published action](../../.github/CLAUDE.md). |
| `.github/CLAUDE.md` § Local composite actions | The `post-run` row's description currently reads "node20 `post:` step". The description does not name a runtime that contradicts the action's declared `using:` value. |

### Out of scope, deferred

- **Other Node-runtime declarations.** A pre-spec audit (`rg 'using:
  node' -g '!specs/**'` on this repo, `gh api` reads against each
  sibling) found no other `using: node<N>` field in the monorepo or in
  the three sibling composite-action repos at the named refs. If a
  future audit surfaces one, a separate change handles it.
- **`actions/setup-node` `node-version` values across workflows.**
  Already at `22` across all workflow files at `main` HEAD; no change
  required here. Whether to bump those to `24` later is a separate spec.
- **Skill-pack runtimes.** `forwardimpact/{kata-skills,fit-skills}` are
  publish targets, not GitHub Actions composite actions; their runtime
  is the consumer's installed Node. Spec 1020 covers the consumer Node
  floor for product CLIs; this spec does not extend that decision to
  skill packs.
- **`fit-doc` / website-build runtime.** Runs through
  `actions/setup-node` in the `website-*.yaml` workflows, already
  pinned to Node 22.
- **CI matrix structure.** Whether to add or drop Node versions in the
  test matrix is outside the runtime-floor question this spec resolves.
- **Removing the deprecation warning from completed historical runs.**
  Cosmetic and not addressable; only forward-looking runs benefit.

## Success criteria

The "chosen runtime" throughout this section is `node22` per
§ Strategic decision. Each row states an observable property; the
example command in the verification column is illustrative — the design
or implementation phase may pick a different mechanism that observes
the same property.

| Claim | Verification (illustrative) |
|---|---|
| No file the monorepo controls under `.github/actions/` declares `using: node20`. | `rg 'using:\s*node20' .github/actions/` returns no matches. (Scoped to action files so the spec's own quoted strings do not trip the check.) |
| The `forwardimpact/kata-agent` `v1` tag points to a commit at which `post-run/action.yml` declares `using: node22`. | `gh api repos/forwardimpact/kata-agent/contents/post-run/action.yml?ref=v1 --jq '.content' \| base64 -d \| grep 'using:'` reads `using: node22`. |
| The two `post-run/action.yml` files declare the same runtime as one another. | The `using:` value at `.github/actions/post-run/action.yml` (on `main`) equals the `using:` value at `forwardimpact/kata-agent/post-run/action.yml` (at `v1`). The criterion is observed at the steady state after both edits land; the rollout-window note below covers the transient between them. |
| `.github/CLAUDE.md` does not describe the local `post-run` action's runtime as `node20`. | `rg 'node20' .github/CLAUDE.md` returns no matches. |
| No workflow run after merge produces a `Node.js 20 actions are deprecated` warning whose enumerated action list contains `./.github/actions/post-run` or `forwardimpact/kata-agent/post-run`. | After both edits land, the next scheduled `agent-team.yml` run (sibling-path representative) and the next scheduled `check-quality.yml` run (local-path representative) show no warning log line containing the substring `Node.js 20 actions are deprecated` whose body cites either of the two `post-run` action paths. Verification window: the first scheduled run in each named workflow after both edits land. |

**Rollout-window note (not a criterion).** During the rollout, there
is a transient between the moment the local edit merges and the
moment the `forwardimpact/kata-agent@v1` force-tag move lands (or
vice versa). During that transient, the "two files declare the same
runtime" property is false. This is expected and is not a criterion
violation. The criteria are observed at the steady state after both
edits land. If the transient exceeds 7 days the team has stalled and
the spec re-opens.
