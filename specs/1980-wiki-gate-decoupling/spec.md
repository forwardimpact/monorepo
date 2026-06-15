# Spec 1980 — decouple the per-PR `wiki` gate from shared wiki state

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The merge gate is the team's quality signal. A per-PR check that reddens on shared mutable state the PR never touched makes the documented-exception path the normal merge path: an agent doing everything right still loses, exceptions accrue as undifferentiated red history, and gate redness stops carrying information. Normalized deviation is exactly the failure mode a continuously improving team cannot afford in its own control loop. |

## Problem

The `wiki` check in the per-PR Context workflow answers a question about the
wrong subject. On every PR, it checks out the wiki repository's **current HEAD
at job-checkout time** and runs the full shared-state audit (`fit-wiki
audit`). Its verdict is therefore a property of a concurrently-mutating shared
resource read at a racing instant — not a property of the PR's change.

The gate conflates two distinct questions:

1. **Is this PR's change sound?** — what a PR gate exists to answer.
2. **Is the team's shared wiki currently audit-clean?** — a property of shared
   state that already has an owner and a repair lane: the wiki-curation duty
   runs the same audit, with fixes, when the thrice-daily agent shift's triage
   routes to it.

### Evidence — PR #1703 (obstacle #1714)

The PR's diff was `libeval` source and tests only — zero wiki surface. The
release engineer's gate record
([PR #1703 comment](https://github.com/forwardimpact/monorepo/pull/1703#issuecomment-4690858636)):

- Five consecutive audit-clean repair pushes (`fit-wiki audit` verified clean
  at each), and five consecutive race losses — every check re-run checked out
  a *descendant* wiki SHA already re-broken by concurrent facilitated-session
  writes (lineage verified).
- The merge proceeded only via a documented gate exception (the check is
  non-required; the PR was `MERGEABLE`/`UNSTABLE`).

### Evidence — PR #1705 (occurrence #2, record-verified)

Forty-two minutes after #1703 merged, the same gate blocked a second
zero-wiki-surface PR — `chore(deps)`, all 17 changed files
`package.json`/`bun.lock`. The occurrence datum
([#1714 comment](https://github.com/forwardimpact/monorepo/issues/1714#issuecomment-4691322098))
and the gate record it quotes
([PR #1705 comment](https://github.com/forwardimpact/monorepo/pull/1705#issuecomment-4691157156))
were verified against the workflow-run attempt history and wiki commit log
([record check](https://github.com/forwardimpact/monorepo/issues/1714#issuecomment-4691578265));
the corrected numbers below are what this spec carries:

- **Seven `wiki`-check failures across the PR's two heads** — 3 on the
  pre-rebase head (11:13, 11:21, 11:31Z), 4 on the post-rebase merge head
  (11:32–12:08Z) — green only on the merge head's fifth attempt, triggered
  12:08:34Z and concluding green (12:12:32Z) 43 seconds before the 12:13:15Z
  merge.
- **The breach mix spanned four budget classes and three owning agents, and
  shifted between failures**: per-agent summary word-budgets (the coach's in 5
  of 7 failures, the product manager's in 3, the security engineer's in 2), a
  weekly-log line budget, a weekly-log-part word budget, and the shared
  storyboard's word budget (3 of 7). No failure log shows the #1703
  XmR-payload class. Two failures reddened solely on product-manager
  surfaces, five solely or partly on coach surfaces — the gate's subject was
  whichever lane's churn happened to be mid-rotation at checkout.
- **The gate went green by coincidence of concurrent session timing, not
  merge-lane repair**: the final failure's three breaches were cleared by the
  owning agents' own session commits minutes before the re-run (the
  product manager's summary trim `5e8bebaf` 12:09:55Z, the coach's
  session-sync `274edf52` 12:10:57Z trimming the coach summary and
  storyboard). The gate record's repair narrative names a file absent from
  all seven failure logs — under this gate's shape, even the agent recording
  the merge cannot reliably say what un-reddened it.

### Baseline

The success criteria below measure against both merges combined: **PR #1703
(5 race losses + 1 documented exception) plus PR #1705 (7 failures across two
heads, cleared only by third-party session-lane coincidence) — two unrelated
zero-wiki-surface merges, 42 minutes apart, on 2026-06-12.**

### Why the race outlives the in-flight wiki fixes

The improvement coach's coverage adjudication
([#1714 comment](https://github.com/forwardimpact/monorepo/issues/1714#issuecomment-4691016737))
separates the two classes of wiki state that redden the audit:

| Re-breaker class | Law it grows under | Covered by |
|---|---|---|
| XmR chart payload regrowth (#1691) | Persistent — monotonic with dataset age; budget arithmetic structurally unreachable | Spec 1950 (bounded-window rendering), in flight |
| Per-answer summary appends during live facilitated sessions | Transient — the cap is reachable by routine rotation, but any instant between an append and its rotation is audit-dirty | **Nothing — this spec's scope** |

Spec 1950 removes the persistent red state but does not moot this obstacle: a
job-checkout-time audit still races the transient class. The five PR #1703
race losses would have remained possible against a 1950-fixed wiki, and
PR #1705 demonstrated it empirically — the transient summary class breached in
six of its seven failures, and none of the failure logs shows the XmR-payload
class spec 1950 bounds. During any
active facilitated session — hours per day, by design — the check is
structurally un-passable for **any** PR, regardless of content.

## Decision — scope the gate to the PR's subject (Direction 1 of #1714)

The two conflated questions get two homes:

- **The per-PR `wiki` check evaluates a PR only when its diff touches
  wiki-coupled surfaces** — surfaces whose change can alter what the audit
  verifies or how (the wiki tooling library and its audit rules, the audit
  invocation, the check's own definition). A PR with no wiki-coupled diff is
  not evaluated against shared wiki state: its check concludes without
  consulting the wiki's current HEAD.
- **The shared-state audit verdict lives solely in the wiki-curation lane.**
  The duty's audit-fix loop exists today but runs only when the technical
  writer's shift triage routes to it; this spec gives it a defined cadence
  (see Scope). Findings the curator cannot fix in-run route as issues or
  memos to named owners — they never redden an unrelated PR's gate.

Head-to-head against the other candidate directions from #1714:

| Axis | (1) Path-scope + curation lane | (2) Pin audit to merge-base / quiescent snapshot | (3) Machine-readable gate exception |
|---|---|---|---|
| Removes the race for unrelated PRs | Yes — shared state is no longer the check's subject | Yes — the read point stops racing | No — losses still occur, just labeled |
| Removes the conflation | Yes — the check's subject becomes the PR's change | No — every PR still audited against state it didn't touch; a red verdict still names no owner | No — legitimizes the conflation's fallout |
| Findings reach an owner with a repair loop | Yes — the curation duty's audit-fix loop is exactly this | No — red PR gates still page whoever happens to be merging | No |
| Cost shape | One-shot gate rescope; the curation duty exists | Snapshot-selection machinery maintained forever | Exception machinery for a gate shape worth retiring |

**Direction 3 is not adopted, including as interim hygiene.** This spec
removes the exception class for non-wiki PRs entirely; building
exception-labeling machinery for a gate shape this spec retires is throwaway
work, and a sanctioned exception channel would blunt the success signal below
(zero exceptions is only meaningful while exceptions stay costly and visible).

**Determinism rider for the residual check.** When the per-PR check does run
(wiki-coupled diff), its verdict must be a function of the PR's content and a
stable audit target — re-running the check on an unchanged PR head yields the
same conclusion. This applies direction 2's pinning property narrowly, inside
direction 1's scope, where the conflation objection no longer applies. The
stable target must be content-stable across re-runs of the same PR head:
pinning to the wiki's live HEAD at first run does not qualify, since that
target keeps mutating and re-introduces the race the determinism criterion
exists to close. The target must still exercise the real audit rules, so a
wiki-coupled regression still reddens (see Success Criteria). Which
content-stable target meets both constraints is a design decision.

## Scope

### In scope

| Component | What changes |
|---|---|
| The `wiki` job in the per-PR Context workflow (`.github/workflows/check-context.yml`). | Gains a wiki-coupled-surface condition: PRs whose diff touches no wiki-coupled surface are not evaluated against shared wiki state (skip vs. trivial pass is a design decision, under the constraint that the check's conclusion stays interpretable in the PR checks UI and in gate records). PRs whose diff does touch a wiki-coupled surface are evaluated per the determinism rider. |
| The same workflow's push-to-main run of the `wiki` job. | In scope — it audits the same shared state outside any PR context. A push-to-main run has no PR diff to scope against, so the path-scope condition does not transfer; the disposition follows from the principle alone — the shared-state audit verdict does not live in a commit-status check on `main` — and the exact form (remove the shared-state gate from the push path vs. another disposition routing the verdict to the curation lane) is a design decision. |
| The shared-state audit step inside the repository's composite check command (`check` → `wiki` in the root `package.json` scripts). | In scope — it is the same conflation's second home: a contributor running the composite check on a code-only change fails on shared wiki state during a live session. Design dispositions it under the same principle; the standalone `wiki` script stays available for whoever is actually auditing the wiki. |
| The wiki-coupled-surface definition. | Enumerated and documented where the gate is defined. Must include at minimum the wiki tooling library that implements the audit (`libraries/libwiki`), the audit invocation it gates through, and the check definition itself; the exact enumeration is a design decision. |
| The wiki-curation lane's cadence guarantee and routing contract. | Two commitments. (1) **A defined cadence exists**: the shared-state audit runs on a stated cadence rather than only when shift triage happens to route to it (today it runs only on that conditional path — at most the three shift runs per day, when triage selects it). (2) **A routing contract**: findings the curator cannot fix in-run surface as issues or memos to named owners within one such cycle. The cadence's exact value and the guarantee's home are design decisions, constrained to monorepo-local surfaces (agent profile, schedule, workflow) — not published skill text. |
| Gate-meaning documentation. | The check's documentation — homed in `.github/CLAUDE.md` or alongside the workflow definition — states what the per-PR `wiki` check verifies, when it runs, and where shared-state audit findings route instead. |

### Out of scope

- **Audit rule content** — what `fit-wiki audit` checks is unchanged; only
  where and when its verdict gates anything changes.
- **Spec 1950's bounded-window rendering and the #1691 budget family** — the
  persistent re-breaker class rides its own lane (scoped pattern-synthesis run
  covers the budget family per the #1714 routing note).
- **The wiki write-discipline spec family** (1730, 1750, 1780, 1840, 1890,
  1920, 1960, 1970) — concurrent-write correctness is orthogonal to which gate
  reads the result.
- **Direction 3 exception machinery** — rejected above, not deferred.
- **Branch-protection / required-check policy** — which checks are required
  stays a human admin decision; this spec changes what one check measures.
- **Published `kata-*` skill content** — the curation skill already states the
  audit-fix duty generically; the cadence guarantee and routing contract above
  land in monorepo-local surfaces only. No incident-fitting of skill text to
  this monorepo's episode.

## Success Criteria

| Claim | Verification |
|---|---|
| A PR with no wiki-coupled diff has its `wiki` check conclude without running the shared-state audit. | On such a PR, the `wiki` check run's job log shows the shared-state audit (`fit-wiki audit` against the wiki repository's current HEAD) did not run — whether the disposition is a skipped job, an early exit, or a trivial pass — so the conclusion cannot depend on shared wiki state; verifiable on any PR, including during an active facilitated session. |
| Zero documented `wiki`-gate exceptions on PRs with no wiki-coupled diff. | A trailing outcome, not checkable at merge: the release-engineer merge-gate disposition comments on PRs merged in the four weeks following the change contain zero such exceptions (§ Baseline). |
| A PR that can change audit behavior is still evaluated. | A wiki-coupled PR that introduces an audit-visible regression yields a red `wiki` check on that PR; the same PR with the regression removed yields green. |
| The residual check is deterministic. | Re-running the `wiki` check on an unchanged wiki-coupled PR head yields the same conclusion both times — against the content-stable target named in design, not the wiki's live HEAD. |
| The shared-state audit runs on a defined cadence. | The cadence is stated in its monorepo-local home (per § Scope) and a curator audit run is observable at that cadence in the run record — independent of whether a PR is in flight. |
| Shared-wiki audit findings still surface within one curation cycle. | An audit violation present at a curation run (per the cadence guarantee in § Scope) is either fixed in that run or routed as an issue or memo naming an owner — verifiable in the resulting issue/memo and the curator's run record. |
| The gate's meaning is documented. | The check documentation named in § Scope answers "what does a red `wiki` check mean, and who owns shared-state findings" without reference to this spec. |

— Product Manager 🌱
