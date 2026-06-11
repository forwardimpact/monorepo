# Spec 1800 — Codify a zero-package-surface early exit in kata-release-cut

## Persona and job

Hired by **Teams Using Agents** so the post-merge release-cut assessment —
the Study/verify step that runs after every merge — costs what the merge
shape warrants, instead of paying the full per-package sweep on every
docs-only merge.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

The `kata-release-cut` skill's *Enumerate Changed Packages* step mandates a
per-package latest-tag comparison over every publishable package,
unconditionally. A cheap range check (changed paths since the last cut)
exists and runs first in practice — but the skill gives it **no verdict
authority**: nothing in the procedure says "range since last cut touches
zero publishable paths ⇒ NO CUT OWED, sweep not required." A careful agent
therefore runs the full sweep anyway, because only the sweep is defensible
under the current skill text. The obstacle is the missing codified
discriminator, not agent judgment
([Issue #1623](https://github.com/forwardimpact/monorepo/issues/1623)).

### Evidence

| Fact | Source |
| --- | --- |
| Zero-surface assessment costs $5.99 / 2,524,055 cache-read tokens / 28,095 output tokens / ~8m32s wall / 34 Bash calls | dispatch run 27329648271 (run-352, PR #1620: 4 files, all docs, zero npm surface) |
| Recurrence: runs 303, 323, 333, 352, 354 are all zero-package-surface full sweeps (issue body lists four; run-354 confirmed against the CSV). Run-303's range carried new unreleased package commits, so the early exit would correctly not have fired there — the avoidable-sweep class is n≥4 of the 5 | `wiki/metrics/kata-release-cut/2026.csv`; Issue #1623 coach triage |
| Run-354 re-swept a range its own record notes was already covered by run-352's sweep | same CSV, run-354 row |
| Docs/wiki/skill merges dominate current merge traffic — zero-surface is the *modal* assessment shape | Issue #1623, coach-ratified |

### The load-bearing counterexample

Run-343b (PR #1615, docs-only: two root markdown files) reached a **1-cut**
verdict: the sweep cleared a *carried* libbridge cut owed from an earlier
merge. A zero-surface **merge** does not imply a zero-cut **assessment** —
any codified early exit that discriminates on the merged PR's diff alone
silently violates the never-accumulate invariant. The discriminator must
assess the full range since the last verified-clean state **plus**
carry-forward obligations.

### Why the range check alone is also insufficient

The sweep's first-release path enumerates an untagged package's **entire
history**, not a range — so a held first-release package (currently:
svcembedding + svctenancy, deliberately held behind spec 1500 and
Discussion #1385) shows owed commits on every sweep regardless of recent
merge activity. A range predicate is structurally blind to this class; the
early exit must carry the first-release backlog as an explicit re-cite, not
assume the range check covers it.

## What — the early-exit contract

The skill gains an assessment step, positioned after pre-flight and before
the per-package enumeration, that grants verdict authority to a
**discriminator predicate**. When every condition holds, the agent records
**NO CUT OWED** and stops — the sweep is not required and skipping it is
the codified, defensible path. When any condition fails, the full sweep
runs; there is no judgment call in between.

### Discriminator predicate (all conditions required)

| # | Condition | Why it is load-bearing |
| --- | --- | --- |
| 1 | **Verified-clean baseline.** A prior run record establishes a baseline commit `B` at which an assessment verified zero **due** unreleased commits across all publishable packages — i.e., zero unreleased commits outside obligations re-cited as blocked under condition 3. A baseline is established by a full sweep reaching that state (for a cutting run: its post-cut verified state, once tags are pushed and verified), or by an earlier early-exit verdict chained to one. | Anchors the range to a state the procedure actually verified, not to the merged PR's diff. "Due" (not "zero unreleased, period") keeps the predicate satisfiable in the steady state the evidence shows — a standing blocked backlog would otherwise make the exit unreachable forever. |
| 2 | **Zero publishable paths in range.** The changed paths from `B` to current `HEAD` include nothing under any publishable-package directory. The publishable-path set is derived from the workspace manifest (currently `libraries/*`, `products/*`, `services/*`), not hardcoded. | Sound over-approximation: the sweep's own per-package check is path-scoped, so if no path under any workspace directory changed since a verified-clean baseline, every per-tagged-package comparison is provably empty. |
| 3 | **Carry-forward state re-cited.** Every standing obligation — first-release backlog, held/deferred cuts, pending publish-failure retries from prior runs — is either empty or explicitly re-cited as still blocked, with its blocking reference. Any obligation that is *due* (no longer blocked) defeats the early exit. | Covers what the range check structurally cannot see (run-343b's carried cut; the untagged-package class above). |
| 4 | **Main CI green.** The existing pre-flight checklist passed. Re-cited as a conjunct — even though the step sits after pre-flight — so the verdict record is self-contained. | The never-release-from-broken-main rule applies to the verdict, not just to cutting. |

### Authority boundary — full-sweep runs re-anchor the chain

The early exit applies to **event-driven post-merge assessments** only;
**full-sweep runs** (the scheduled cadence, and any run where the predicate
fails or cannot be evaluated) always perform the per-package sweep. Because
the published skill's audience cannot be assumed to share this monorepo's
dispatch vocabulary, the codified step must state the boundary in the
skill's own terms — its existing "When to Use" run classes — and must give
the rule for the unclassifiable case: a run that cannot determine which
class it is in, or cannot resolve an unambiguous baseline, performs the
full sweep.

The boundary also bounds the baseline chain: the skill text must require
that the chain re-anchor to a real full sweep at least once per scheduled
cadence interval, and that a consumer operating without a scheduled cadence
treat a chain older than its own re-anchor bound as unresolvable (⇒ full
sweep). This bounds the blast radius of a wrong or corrupted baseline
record to one re-anchor interval: even if condition 1's record were false,
the next full sweep re-verifies every tagged package from its tags and
every untagged package from its history, so unreleased **commits** cannot
silently accumulate past it — the never-accumulate invariant holds by
construction for the commit-accumulation class, not by record fidelity
alone. (Pending publish-failure recovery, by contrast, is record-dependent
under both the sweep and the early exit — the tag-based sweep cannot see a
failed publish either; this contract does not change that, and the design
must not lean on the re-anchor for it.)

### Recording contract

Every assessment verdict — full-sweep and early-exit alike — records, in
the same per-run recording surfaces the skill already mandates, the state
the next run needs to chain: the verified-clean (or post-cut) commit, and
each carry re-cite with its blocking reference. An early-exit verdict
additionally records the baseline it chained to and the range-check
evidence (path summary). Binding sweep verdicts too is what keeps
condition 1 resolvable after every re-anchor; an early-exit-only contract
would orphan the chain at exactly the runs that refresh it.

### Instruction-budget headroom

The skill file currently sits at 768/1280 words and 172/192 lines of its L5
budget, and spec 1500's implementation (spec in flight as PR #1384) will
land eight hazard codifications on the **same file**
([Issue #1613](https://github.com/forwardimpact/monorepo/issues/1613):
budgets across kata skills are structurally at ceiling, and trim-to-green
repairs conserve the treadmill). The WHAT-level constraints:

- The step's normative content (predicate, authority boundary, recording
  contract) lives in the skill file itself — verdict authority must be in
  the canonical procedure, not in a reference.
- After implementation the skill file retains headroom for spec 1500's
  content: ≤95% of both L5 caps (success criterion below). How content is
  placed or displaced to meet this is the design's call (carry-forward 4).

## Scope

### In scope

- The `kata-release-cut` skill gains the early-exit step defined in § What:
  discriminator predicate, authority boundary, and recording contract.
- A `references/` file for worked detail, if the design needs one under the
  headroom constraints above.
- The skill is published (kata-skills pack) and is the canonical source for
  the release procedure — this is a verdict-authority contract change for
  external consumers as well as for the monorepo's release-engineer
  (precedent: spec 1500 amended the same published skill via this
  pipeline). The codified text must stand alone for a consumer with no
  access to this monorepo's wiki: the baseline/recording contract is stated
  against the skill's own "Memory: what to record" surfaces, not against
  monorepo-specific files.

### Excluded

- **Spec 1500's hazard codification.** Publish-time hazards are a distinct
  concern with its spec in an in-flight PR; this spec is assessment-time
  cost. Whichever implementation lands second rebases over the other's
  skill-file changes; the headroom constraints above exist so both fit.
- **Tooling.** No new scripts, CLI flags, or CI gates; the predicate runs
  with the git/gh invocations the skill already uses.
- **`kata-release-merge` changes.** The merge gate is a separate procedure.
- **Scheduled-sweep cadence or metrics-schema changes.** The weekly full
  sweep and the per-run CSV format stay as they are.
- **Assessment-cost enforcement.** The cost reduction is observed via the
  existing metric home (`wiki/metrics/kata-release-cut/2026.csv` plus
  dispatch traces), not gated.

### Design-phase carry-forwards

1. **Baseline-record shape.** The design picks how condition 1's baseline
   is identified in run records (commit citation format, where it lives in
   the skill's recording surfaces) such that a fresh session can resolve it
   without ambiguity — including how the skill's monorepo-flavored
   recording paths generalize for external consumers — and confirms the
   no-unambiguous-baseline case routes to the full sweep.
2. **Publishable-path derivation.** The design picks the exact derivation
   of the path set from the workspace manifest — including at which commit
   the manifest is read (a manifest change within the range must not narrow
   the set) — and how a brand-new package directory appearing in the range
   is caught (it must defeat the early exit via condition 2).
3. **Step numbering and references.** The step's position is fixed by
   § What (after pre-flight, before enumeration); the design keeps existing
   step numbering and cross-references consistent around it.
4. **Content placement under the budget.** The design decides what, if
   anything, moves to the `references/` tier so the post-implementation
   file meets the ≤95% criterion without trimming the new step's normative
   content.

## Success criteria

| Claim | Verifies via |
| --- | --- |
| The skill carries an early-exit step with explicit verdict authority. | Reading the skill file alone shows a step stating that when the predicate holds, NO CUT OWED is the codified verdict and the sweep is not required. |
| All four predicate conditions are present and conjunctive. | The skill text names baseline, zero-publishable-paths range, carry-forward re-cite, and green CI, and states that any failure routes to the full sweep. |
| The run-343b shape routes to the sweep. | The skill text states that a due (unblocked) carry-forward obligation defeats the early exit. |
| The first-release backlog survives the early exit. | The skill text requires the first-release backlog re-cite as part of condition 3, independent of the range check. |
| The authority boundary is self-contained. | The skill text states, in its own run-class vocabulary, which runs may early-exit, that full-sweep runs always sweep, the re-anchor bound on the baseline chain, and that an unclassifiable run or unresolvable baseline routes to the full sweep. |
| The recording contract supports chaining across both verdict kinds. | The skill's recording section requires every assessment verdict to record the chainable verified-clean state and carry re-cites, with early-exit verdicts additionally recording baseline and range evidence. |
| The skill respects its instruction budget with headroom. | `bun run check` passes on the implementation PR, and the skill file lands at ≤95% of both L5 caps (≤1216 words, ≤182 lines). |
| The implementation diff stays in scope. | The PR diff touches only the `kata-release-cut` skill directory and the spec/design/plan tree under `specs/1800-release-cut-zero-surface-early-exit/`. |
| The cost effect is observable (trailing indicator — not a merge gate on the implementation PR). | The first post-implementation zero-package-surface assessment at which the predicate holds records an early-exit verdict in `wiki/metrics/kata-release-cut/2026.csv`, giving the before/after cost comparison its first data point against the run-352 baseline. |

— Release Engineer 🚀
