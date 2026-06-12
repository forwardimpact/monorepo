# Spec 1680 — libxmr classification taxonomy admits degenerate-zero

## Persona and job

**Teams Using Agents — Run a Continuously Improving Agent Team.** The storyboard
is the closed-loop instrument that tells the team whether it is getting better.
When the classifier returns a verdict that mechanically satisfies a target
predicate but does not represent process control, the loop silently certifies a
non-improvement as an improvement. The job hires this spec to keep the
storyboard's verdicts trustworthy as the agent team scales across more metrics.
Secondarily, **Platform Builders** consume the same verdict through `fit-xmr`'s
published report shape; the classification vocabulary is part of that shared
surface, so the new value must appear wherever the existing four are documented.

## Problem

`bunx fit-xmr analyze` classifies a metric series of length at or above the
library's minimum classification window in which every observation equals zero
as `status: "predictable"`, `classification: "stable"`. Issue
[#1540](https://github.com/forwardimpact/monorepo/issues/1540) records the first
observation: TW's `docs_pages_over_ceiling` reached the threshold on 2026-06-10
with every row equal to zero, and the storyboard target TW-2
(`docs_pages_over_ceiling` reaches `predictable` by 6/30) became mechanically
MET against an all-zero series. As of 2026-06-12 the series remains all-zero at
n = 17 with μ = 0, σ̂ = 0, and zero-width limits.

A second independent specimen was pre-flagged at the 2026-06-12 storyboard
REVIEW (Q3) by the improvement coach on its own facilitation metric series:
`facilitation_tool_errors` in `wiki/metrics/improvement-coach/2026.csv` is
all-zero at n = 8 as of 2026-06-12 and, on its current one-row-per-run cadence,
crosses the library's minimum classification window around 2026-06-19 — at
which point it flips `insufficient_data` → `predictable` with the identical
degenerate shape (μ = 0, σ̂ = 0, zero-width limits). The Technical Writer
corroborated the specimen on Issue #1540 (comment, 2026-06-12). Two independent
lanes — a TW documentation secondary and the coach's facilitation series —
producing the same shape confirms the obstacle is a system-level storyboard
convention gap, not a single-lane artifact.

The verdict conflates two qualitatively different process-behavior shapes under
one label:

| Shape                   | Mean | Variation | Signals | Today's classification | Substantive meaning                                                                        |
| ----------------------- | ---- | --------- | ------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| Substantive predictable | > 0  | > 0       | none    | `stable`               | Process produces variance within stable limits — the working definition of "under control" |
| Degenerate-zero         | 0    | 0         | none    | `stable`               | Process produces no signal at all — predictability is trivial                              |

Five lanes (PM, RE, SE, TW, Staff) converged in the 2026-06-04 storyboard's
Cross-lane preconditions section on a parallel concern for primary canonicals: a
single anchor combined with the absence of below-LPL signals can certify a chaos
→ predictable flip without substantive process control. For primary metrics that
concern is registered at the storyboard layer as the Family-A sub-(b)
anchor-exclusion and sub-(c) population-definition preconditions
(`wiki/storyboard-2026-M06.md` § Cross-lane preconditions, sub-(b) bullet, which
also records the 5/5-lane convergence) — adjudication of those preconditions
remains open, routed to Discussion. This spec generalises the same shape concern
to secondary metrics that are structurally bounded at zero —
`docs_pages_over_ceiling` and the coach's `facilitation_tool_errors` are the
two observed specimens; Issue #1540 names `findings_count` and `prs_merged` as
illustrative future candidates under quiet or gate-bound stretches — by moving
the discrimination into the classifier where every downstream reader sees the
same verdict.

## Scope

In scope:

- `libraries/libxmr` classification taxonomy admits a new value
  `degenerate-zero` for the no-variation-around-zero process-behavior shape: a
  series of at least the library's minimum classification window in which every
  observation equals zero and no rules fire. The existing four values
  (`insufficient`, `stable`, `signals`, `chaos`) remain. The `status` field is
  unchanged: a degenerate-zero series still reports `status: "predictable"`
  because no rule fires; only `classification` distinguishes the shape. The
  discrimination is a property of the series, not the consuming lane: both
  observed specimens — TW's `docs_pages_over_ceiling` and the coach's
  `facilitation_tool_errors` — receive the new verdict from this one change,
  with no per-lane patches (the lane-local alternative is rejected in
  § Alternatives considered).
- The new value is documented at every site that enumerates the existing four,
  plus the library's own README. The user-facing guide at
  [`websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`](https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md)
  enumerates the values in two places — the `classification` JSON-field bullet
  and the § Classifications table — and its adjacent guidance prose ("Read
  `classification` first…", "Do not react to individual data points when the
  classification is `stable`") currently treats `stable` as the only quiet
  verdict; both enumeration sites and that guidance must stay accurate with five
  values. The other surfaces are the published `fit-xmr` skill's report-shape
  roll-up (`.claude/skills/fit-xmr/SKILL.md` § Report Shape) and
  `libraries/libxmr/README.md` — which today carries no classification
  documentation at all, so the README gains a classification table rather than
  extending one.

Excluded:

- Stuck-at-K series where the mean equals a positive constant and variation is
  zero. No open obstacle today requires this and Issue #1540 does not; the
  naming of any such future class is also out of scope for this spec. Known
  consequence, verified on current libxmr (PR #1541, comments
  [4691064843](https://github.com/forwardimpact/monorepo/pull/1541#issuecomment-4691064843)
  and
  [4691374219](https://github.com/forwardimpact/monorepo/pull/1541#issuecomment-4691374219)):
  a stuck-at-K series at or above the minimum classification window classifies
  `stable` / `predictable` with zero-width limits (μ=K, σ̂=0, UPL=LPL=K), so a
  bare `classification=stable` predicate does not exclude this informationless
  shape. Until a future spec names the class, consumers of the predicate pair it
  with a zero-variation guard (σ̂ > 0). First observed specimen:
  `facilitation_asks_routed` (structural constant K=5 — five kata questions per
  session), which crosses the window ~2026-06-19.
- Auto-rendering storyboard target-row cells. Target rows are hand-typed today;
  introducing a renderer for them is out of scope.
- Re-classifying historical data or back-filling past storyboard summaries.
- Changing the minimum classification window or any other Wheeler/Vacanti
  constant.
- Changing `analyze`'s `status` field or any signal-detection logic.
- The follow-on storyboard wording changes (TW-2 row predicate, Family-A
  precondition note) — these are downstream Technical Writer follow-ups that
  consume this spec; tracked as Issue #1656 under § Downstream below.

## Success criteria

| #   | Claim                                                                                                                                                                                            | Verification                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fit-xmr analyze` of an all-zero series at or above the minimum classification window returns `classification: "degenerate-zero"` and `status: "predictable"`.                                   | New libxmr test fixture covering the all-zero case asserts both fields; `bun test libraries/libxmr` passes.                                                                                 |
| 2   | `fit-xmr analyze` of a series with positive mean, positive variation, and no signals continues to return `classification: "stable"` and `status: "predictable"`.                                 | Existing libxmr stable-case tests continue to pass; one test explicitly distinguishes the two predictable shapes.                                                                           |
| 3   | A series below the minimum classification window with all values equal to zero returns `classification: "insufficient"` — the boundary is unchanged.                                             | New test fixture covers the sub-window boundary against the existing constant.                                                                                                              |
| 4   | The classification value is documented at every site that enumerates the existing four: the libxmr README's new classification table, the xmr-analysis guide's `classification` JSON-field bullet and its § Classifications table, and the fit-xmr skill's § Report Shape roll-up — and the guide's adjacent guidance prose remains accurate for a five-value taxonomy. | `rg -c degenerate-zero` returns ≥ 1 for `libraries/libxmr/README.md` and `.claude/skills/fit-xmr/SKILL.md` and ≥ 2 for `websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`; review confirms the guide's "Read `classification` first…" and "Do not react…" guidance correctly accounts for the new value. |
| 5   | Adding the enum value does not break any existing libxmr golden output (chart, summarize, analyze) or any libwiki storyboard refresh integration test.                                           | `bun test libraries/libxmr libraries/libwiki` passes, including the `libraries/libxmr/test/golden/fit-xmr/` golden snapshots for `chart`, `summarize`, and `analyze`.                       |

## Downstream

This follow-up consumes this spec but is owned and shipped separately:

- **Technical Writer** — tracked as Issue
  [#1656](https://github.com/forwardimpact/monorepo/issues/1656): once the
  classifier emits the new value, update the TW-2 target row in
  `wiki/storyboard-2026-M06.md` so its predicate requires
  `classification=stable` with σ̂ > 0 (substantive predictable), and extend the
  Cross-lane
  preconditions note to name `degenerate-zero` as the formal mechanism behind
  the 5/5-lane refusal of chaos → predictable on flat secondaries, naming both
  observed specimens (`docs_pages_over_ceiling` and `facilitation_tool_errors`)
  per the scoping adjudication on PR #1541. The convention question the note
  answers — a degenerate-zero verdict satisfies no lane's predictability
  target; predictability targets mean `classification=stable` with σ̂ > 0 —
  applies to the coach's series exactly as to TW-2. The interim
  carry label ("MET-deferred (degenerate-zero pending convention)") is routed on
  Issue #1540 independently of this spec and retires when the wording change
  lands.

## Alternatives considered

| Option                                                                                                              | Why not                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storyboard renderer schema extension — emit `predictable (degenerate-zero)` at the cell.                            | Duplicates detection logic at every consumer; the shape is a property of the series, not the cell; agent summaries, STATUS predicates, and future alerting surfaces would each redefine the rule independently and drift.                                             |
| Add a parallel `mode` field to the metric record without touching `classification`.                                 | Doubles the surface for downstream readers — every consumer that switches on `classification` would also have to switch on `mode`. The classification axis already encodes process-behavior shape; extending its enum is the lower-surface change.                    |
| Treat degenerate-zero as a signal under a new rule.                                                                 | Misframes the shape — signals are rule violations on a series with variation; degenerate-zero is the absence of variation. A signal would cascade into `status: "signals_present"` and produce false alerts.                                                          |
| Defer until a second output-side obstacle of the same shape lands by 7/02 (the W23-day7 pattern-synthesis trigger). | The TW-2 predicate is mechanically MET today; without a convention the storyboard summary will certify a non-improvement as an improvement, polluting the team's own feedback loop. The 7/02 trigger is for cohort synthesis, not for blocking single-obstacle fixes. |

— Product Manager 🌱
