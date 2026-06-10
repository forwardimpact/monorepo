# Spec 1680 — libxmr classification taxonomy admits degenerate-zero

## Persona and job

**Teams Using Agents — Run a Continuously Improving Agent Team.** The
storyboard is the closed-loop instrument that tells the team whether it is
getting better. When the classifier returns a verdict that mechanically
satisfies a target predicate but does not represent process control, the loop
silently certifies a non-improvement as an improvement. The job hires this
spec to keep the storyboard's verdicts trustworthy as the agent team scales
across more metrics.

## Problem

`bunx fit-xmr analyze` classifies a metric series of length at or above the
library's minimum classification window in which every observation equals
zero as `status: "predictable"`, `classification: "stable"`. Issue
[#1540](https://github.com/forwardimpact/monorepo/issues/1540) records the
first observation: TW's `docs_pages_over_ceiling` reached the threshold on
2026-06-10 with every row equal to zero, and the storyboard target TW-2
(`docs_pages_over_ceiling` reaches `predictable` by 6/30) became
mechanically MET against an all-zero series.

The verdict conflates two qualitatively different process-behavior shapes
under one label:

| Shape | Mean | Variation | Signals | Today's classification | Substantive meaning |
| --- | --- | --- | --- | --- | --- |
| Substantive predictable | > 0 | > 0 | none | `stable` | Process produces variance within stable limits — the working definition of "under control" |
| Degenerate-zero | 0 | 0 | none | `stable` | Process produces no signal at all — predictability is trivial |

Five lanes (PM, RE, SE, TW, Staff) converged in the 2026-06-04 storyboard's
Cross-lane preconditions section on a parallel concern for primary canonicals:
a single anchor combined with the absence of below-LPL signals can certify a
chaos → predictable flip without substantive process control. That concern
was addressed at the storyboard layer for primary metrics through Family-A
sub-(b) anchor-exclusion and sub-(c) population-definition refinements
(`wiki/storyboard-2026-M06.md` § Cross-lane preconditions, lines 59-62,
with the 5/5-lane convergence headline at line 86). This spec generalises
the same shape concern to secondary metrics that are structurally bounded
at zero — `docs_pages_over_ceiling` is the first observation; lanes have
illustratively flagged `findings_count`, `prs_merged`, and `errors_found`
under quiet, gate-bound, or post-rule-removal stretches as plausible
future candidates — by moving the discrimination into the classifier where
every downstream reader sees the same verdict.

## Scope

In scope:

- `libraries/libxmr` classification taxonomy admits a new value
  `degenerate-zero` for the no-variation-around-zero process-behavior
  shape: a series of at least the library's minimum classification window
  in which every observation equals zero and no rules fire. The existing
  four values (`insufficient`, `stable`, `signals`, `chaos`) remain. The
  `status` field is unchanged: a degenerate-zero series still reports
  `status: "predictable"` because no rule fires; only `classification`
  distinguishes the shape.
- The new value is documented alongside the existing four in the libxmr
  README's classification table (`libraries/libxmr/README.md`) and in the
  user-facing guide at
  [`websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`](https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md).

Excluded:

- Stuck-at-K series where the mean equals a positive constant and variation
  is zero. No open obstacle today requires this and Issue #1540 does not;
  the naming of any such future class is also out of scope for this spec.
- Auto-rendering storyboard target-row cells. Target rows are hand-typed
  today; introducing a renderer for them is out of scope.
- Re-classifying historical data or back-filling past storyboard summaries.
- Changing the minimum classification window or any other Wheeler/Vacanti
  constant.
- Changing `analyze`'s `status` field or any signal-detection logic.
- The follow-on storyboard wording changes (TW-2 row predicate, Family-A
  precondition note) — these are downstream Technical Writer follow-ups
  that consume this spec; tracked under § Downstream below.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | `fit-xmr analyze` of an all-zero series at or above the minimum classification window returns `classification: "degenerate-zero"` and `status: "predictable"`. | New libxmr test fixture covering the all-zero case asserts both fields; `bun test libraries/libxmr` passes. |
| 2 | `fit-xmr analyze` of a series with positive mean, positive variation, and no signals continues to return `classification: "stable"` and `status: "predictable"`. | Existing libxmr stable-case tests continue to pass; one test explicitly distinguishes the two predictable shapes. |
| 3 | A series below the minimum classification window with all values equal to zero returns `classification: "insufficient"` — the boundary is unchanged. | New test fixture covers the sub-window boundary against the existing constant. |
| 4 | The classification value is documented in the libxmr README classification table and in the user-facing xmr-analysis guide. | `rg degenerate-zero libraries/libxmr/README.md websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md` returns at least one match in each file. |
| 5 | Adding the enum value does not break any existing libxmr golden output (chart, summarize, analyze) or any libwiki storyboard refresh integration test. | `bun test libraries/libxmr libraries/libwiki` passes, including the `libraries/libxmr/test/golden/fit-xmr/` golden snapshots for `chart`, `summarize`, and `analyze`. |

## Downstream

These follow-ups consume this spec but are owned and shipped separately:

- **Technical Writer** — once the classifier emits the new value, update
  the TW-2 target row in `wiki/storyboard-2026-M06.md` so its predicate
  requires `classification=stable` (substantive predictable), and extend
  the Cross-lane preconditions note to name `degenerate-zero` as the
  formal mechanism behind the 5/5-lane refusal of chaos → predictable on
  flat secondaries. Interim carry label
  ("MET-deferred (degenerate-zero pending convention)") ships now and
  retires when the wording change lands.
- **Staff Engineer** — designs the WHICH/WHERE for the libxmr surface
  change and documentation updates per the kata pipeline.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Storyboard renderer schema extension — emit `predictable (degenerate-zero)` at the cell. | Duplicates detection logic at every consumer; the shape is a property of the series, not the cell; agent summaries, STATUS predicates, and future alerting surfaces would each redefine the rule independently and drift. |
| Add a parallel `mode` field to the metric record without touching `classification`. | Doubles the surface for downstream readers — every consumer that switches on `classification` would also have to switch on `mode`. The classification axis already encodes process-behavior shape; extending its enum is the lower-surface change. |
| Treat degenerate-zero as a signal under a new rule. | Misframes the shape — signals are rule violations on a series with variation; degenerate-zero is the absence of variation. A signal would cascade into `status: "signals_present"` and produce false alerts. |
| Defer until a second output-side obstacle of the same shape lands by 7/02 (the W23-day7 pattern-synthesis trigger). | The TW-2 predicate is mechanically MET today; without a convention the storyboard summary will certify a non-improvement as an improvement, polluting the team's own feedback loop. The 7/02 trigger is for cohort synthesis, not for blocking single-obstacle fixes. |

— Product Manager 🌱
