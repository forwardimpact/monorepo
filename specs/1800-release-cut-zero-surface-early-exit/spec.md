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
| Recurrence n≥5: runs 303, 323, 333, 352, 354 are all zero-package-surface full sweeps | `wiki/metrics/kata-release-cut/2026.csv`; coach-verified on Issue #1623 |
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
| 1 | **Verified-clean baseline.** A prior run record establishes a baseline commit `B` at which a full sweep (or an early-exit verdict chained to one) found zero unreleased commits across all publishable packages. | Anchors the range to a state the procedure actually verified, not to the merged PR's diff. |
| 2 | **Zero publishable paths in range.** The changed paths from `B` to current `HEAD` include nothing under any publishable-package directory. The publishable-path set is derived from the workspace manifest (currently `libraries/*`, `products/*`, `services/*`), not hardcoded. | Sound over-approximation: the sweep's own per-package check is path-scoped, so if no path under any workspace directory changed since a verified-clean baseline, every per-tagged-package comparison is provably empty. |
| 3 | **Carry-forward state re-cited.** Every standing obligation — first-release backlog, held/deferred cuts, pending publish-failure retries from prior runs — is either empty or explicitly re-cited as still blocked, with its blocking reference. Any obligation that is *due* (no longer blocked) defeats the early exit. | Covers what the range check structurally cannot see (run-343b's carried cut; the untagged-package class above). |
| 4 | **Main CI green.** The existing pre-flight checklist passed unchanged. | The never-release-from-broken-main rule applies to the verdict, not just to cutting. |

### Authority boundary — scheduled runs always sweep

The early exit applies to **event-driven post-merge assessments** only. The
scheduled weekly run always performs the full per-package sweep. This
bounds the blast radius of a wrong or corrupted baseline record to one
cadence interval: even if condition 1's record were false, the next
scheduled sweep re-verifies every package from its tags, so unreleased
changes cannot silently accumulate past it. The never-accumulate invariant
is preserved by construction, not by record fidelity alone.

### Recording contract

An early-exit verdict records, in the same per-run metrics/memory surfaces
the skill already mandates: the baseline commit cited, the range-check
evidence (path summary), and each carry re-cite. This is what lets the
*next* post-merge assessment chain to this verdict as its condition-1
baseline (the chain re-anchors to a real sweep at least weekly per the
authority boundary).

### Instruction-budget headroom

The skill file currently sits at 768/1280 words and 172/192 lines of its L5
budget, but spec 1500 (PR #1384, in flight) will land eight hazard
codifications on the **same file**
([Issue #1613](https://github.com/forwardimpact/monorepo/issues/1613):
budgets across kata skills are structurally at ceiling, and trim-to-green
repairs conserve the treadmill). The headroom decision for this spec:

- The new step's normative content (predicate, authority boundary,
  recording contract) lives in the skill file — verdict authority must be
  in the canonical procedure, not a reference.
- Worked examples and predicate walkthrough detail go to the skill's
  `references/` tier (the designed relief valve), not the skill file.
- If fitting the compact step would push the file past 95% of either L5
  cap, existing worked-example detail is displaced to `references/` rather
  than trimming the new step's normative content — restore headroom, do not
  repair to green.

## Scope

### In scope

- The `kata-release-cut` skill gains the early-exit step defined in § What:
  discriminator predicate, authority boundary, and recording contract.
- A `references/` file for worked detail, if needed under the headroom
  rules above.
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
  concern in an in-flight PR; this spec is assessment-time cost. Whichever
  lands second rebases over the other's skill-file changes; the headroom
  rules above exist so both fit.
- **Tooling.** No new scripts, CLI flags, or CI gates; the predicate runs
  with the git/gh invocations the skill already uses.
- **`kata-release-merge` changes.** The merge gate is a separate procedure.
- **Scheduled-sweep cadence or metrics-schema changes.** The weekly full
  sweep and the per-run CSV format stay as they are.
- **Assessment-cost enforcement.** The cost reduction is observed via the
  existing metric home (`wiki/metrics/kata-release-cut/2026.csv` plus
  dispatch traces), not gated.

### Design-phase carry-forwards

1. **Baseline-record shape.** The design picks how condition 1's
   verified-clean baseline is identified in run records (commit citation
   format, where it lives in the recording surfaces) such that a fresh
   session can resolve it without ambiguity — and what the agent does when
   no unambiguous baseline resolves (the answer must be "full sweep").
2. **Publishable-path derivation.** The design picks the exact derivation
   of the path set from the workspace manifest, including how a brand-new
   package directory appearing in the range is caught (it must defeat the
   early exit via condition 2).
3. **Step placement and numbering.** The design picks where the step sits
   relative to the existing pre-flight and enumeration steps and how
   existing step references are kept consistent.

## Success criteria

| Claim | Verifies via |
| --- | --- |
| The skill carries an early-exit step with explicit verdict authority. | Reading the skill file alone shows a step stating that when the predicate holds, NO CUT OWED is the codified verdict and the sweep is not required. |
| All four predicate conditions are present and conjunctive. | The skill text names baseline, zero-publishable-paths range, carry-forward re-cite, and green CI, and states that any failure routes to the full sweep. |
| The run-343b shape routes to the sweep. | The skill text makes a due (unblocked) carry-forward obligation defeat the early exit; a reader applying the step to run-343b's facts reaches "sweep", not "exit". |
| The first-release backlog survives the early exit. | The skill text requires the first-release backlog re-cite as part of condition 3, independent of the range check. |
| Scheduled runs are exempt from the early exit. | The skill text states the authority boundary: scheduled runs always perform the full sweep. |
| The recording contract supports chaining. | The skill's memory/metrics recording section requires baseline, range evidence, and carry re-cites on every early-exit verdict. |
| The skill respects its instruction budget with headroom. | `bun run check` passes on the implementation PR, and the skill file lands at ≤95% of both L5 caps (≤1216 words, ≤182 lines). |
| The implementation diff stays in scope. | The PR diff touches only the `kata-release-cut` skill directory and the spec/design/plan tree under `specs/1800-release-cut-zero-surface-early-exit/`. |
| The cost effect is observable. | The first post-implementation zero-package-surface post-merge assessment records an early-exit verdict in `wiki/metrics/kata-release-cut/2026.csv`, giving the before/after cost comparison its first data point against the run-352 baseline. |

— Release Engineer 🚀
