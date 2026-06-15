# Spec 1950 — Bounded-window XmR chart rendering for storyboard payloads

## Personas and Jobs

| Persona            | Job                                                                                                                 | How the gap blocks progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The storyboard is the team's PDSA surface; its auto-generated XmR blocks render **one column per CSV observation, forever**. The canonical metrics append rows daily, so storyboard token weight grows monotonically and re-breaches the wiki word budget after every narrative trim. While breached, the `wiki` CI check is red **repo-wide** — every PR's gate inherits an environmental failure unrelated to its diff. The team currently pays a ~daily trim-and-repair cost that buys days at a time. |
| Platform Builders  | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems)                          | `fit-xmr chart` exposes no way to bound rendered output, and `fit-wiki refresh` exposes no chart-shaping option (an output-format flag and a path positional only), so any consumer embedding charts in a budgeted surface inherits unbounded growth with no lever. A chart primitive whose output size is a function of dataset age is not safely composable into any size-limited artifact.                                                                                                             |

## Problem

The XmR chart renderer emits one column per observation with no bound, and the
storyboard refresh pipeline embeds that output verbatim inside a word- and
line-budgeted file. Obstacle #1691 documents the structural conflict; its
evidence series (all 2026-06-12, measured first-hand):

| Datum                 | Measurement                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breach at filing      | storyboard at 6977/6400 words, 517/496 lines; the 12 auto-generated XmR blocks alone ~3,530 words / 233 lines; narrative outside blocks ~2,870 words                                                     |
| Chart width           | PM `issues_triaged` rendered 147 columns at filing, **151 by the same afternoon** — one column per CSV row, no bound                                                                                     |
| Recurrence after trim | three same-day breaches: 6296→6450 within ~3h (+21 lines pure auto-gen growth), 6094→6453 same afternoon, 6435 at next session open                                                                      |
| Trim exhaustion       | final repair landed 6373/6400 (**27 words headroom**) by compressing live verdict-registry prose; Headlines current-session, Concluded sections already pointer-retired — no retirable narrative remains |
| Section weights       | per-section token weight is dominated by auto-gen blocks: RE 1192, Experiments 1034, Obstacles 921, PM 876 — vs 290 for the lightest narrative lane                                                      |
| No render lever       | `fit-xmr chart --help` exposes no window/limit flag; `fit-wiki refresh --help` exposes no chart-shaping option — chart width is structurally unbounded at every layer                                    |
| Gate consequence      | while breached, the `wiki` check fails on every PR run repo-wide (blocked PR #1673 at the merge gate, run 27409239073, before a concurrent repair cleared it)                                            |

The audit prescription ("retire prior-session narrative") is unreachable
arithmetic: recoverable narrative is ≲150 words against a payload that regrows
without bound. The system is producing exactly this outcome by design; per-trim
repairs are tampering with a common cause.

## What

Bounded-window rendering for XmR charts, threaded through the storyboard refresh
pipeline:

1. **`fit-xmr chart` accepts a window option** bounding the number of most
   recent observations rendered. Default behaviour without the option is
   unchanged (full series) so existing direct consumers are unaffected.
2. **A truncated chart discloses its truncation in the rendered output** — the
   reader must see that the chart shows the last N of M total observations. When
   the series fits inside the window, the chart renders complete with no
   truncation disclosure. A windowed instrument that looks complete is a
   measurement-trust defect (the #1692 family), not a feature.
3. **Windowing bounds the render only, never the analysis.** Limits,
   centerlines, and signal detection continue to be computed from the same
   observation set as today; the window selects which columns are drawn. The
   signals shown for a bounded chart are the subset of full-series signals whose
   observations fall in the visible region — not a re-run of the analysis on the
   windowed subset. Window-boundary semantics (how the first visible
   observation's moving-range column is drawn given an out-of-window
   predecessor; whether the axis numbers observations locally or globally) are
   design-phase decisions, constrained only by the disclosure requirement above
   remaining unambiguous.
4. **`fit-wiki refresh` renders storyboard XmR blocks with a bounded window**,
   so total auto-generated chart payload is bounded — independent of dataset age
   (signal annotations and label widths may still vary by a few words between
   refreshes; the chart-column payload may not grow). The default storyboard
   window is a design-phase decision, sized with a stated numeric headroom
   figure so that the current 12 blocks plus filing-composition narrative
   (~2,870 words) land under the 6400-word / 496-line budgets.
5. **An installation can size the storyboard window without code changes.**
   Where the lever lives is a design decision.

## Out of scope

| Excluded                                                              | Why                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-generated obstacle/experiment marker blocks                      | Their size tracks **open-issue count**, which the team bounds operationally, not dataset age; they share no growth law with charts. If they later breach on their own, that is a separate spec |
| Auditing auto-gen spans separately from narrative (#1691 direction 2) | Audit-rule change in libwiki, orthogonal to the unbounded-render defect; may be specced separately if bounding proves insufficient                                                             |
| Moving charts off the storyboard (#1691 direction 3)                  | Weakens the at-a-glance storyboard; only warranted if bounded rendering cannot fit the budget                                                                                                  |
| Changing limit/σ̂ computation, baselines, or any analyze semantics     | The instrument's statistics are fixed (2026-06-07 note: redefinition subsystem removed); this spec touches rendering only                                                                      |
| Metric CSV retention or compaction                                    | Observation history is the system of record and stays complete                                                                                                                                 |
| Storyboard word/line budget values                                    | Budgets are the constraint being satisfied, not the variable                                                                                                                                   |

## Success criteria

| #   | Claim                                                                                                                                                                   | Verify                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fit-xmr chart` with the window option renders at most N observation columns on a series longer than N                                                                  | run against a committed test fixture CSV with more rows than the window; count columns (smoke-check on a live metrics CSV is supplementary, not the gate)                                                                    |
| 2   | A truncated chart states the visible/total observation counts; an untruncated windowed chart carries no truncation disclosure                                           | inspect chart output for both fixture cases (series > window, series ≤ window)                                                                                                                                               |
| 3   | Default (no option) `fit-xmr chart` output is unchanged for existing consumers                                                                                          | diff output against pre-change rendering on the same fixture                                                                                                                                                                 |
| 4   | Signals shown on a bounded chart are the visible-region subset of full-series `fit-xmr analyze` signals                                                                 | compare the bounded chart's signal list to the full-series analyze output filtered to in-window observations                                                                                                                 |
| 5   | `fit-wiki refresh` produces storyboard XmR blocks at the bounded width                                                                                                  | refresh a storyboard fixture; count columns in each regenerated block                                                                                                                                                        |
| 6   | Auto-generated XmR chart payload does not grow when the series grows past the window                                                                                    | refresh a storyboard fixture, append a CSV row, refresh again; chart-column count and chart-block payload width are unchanged (signal-annotation wording may vary)                                                           |
| 7   | After the first post-merge refresh, the live storyboard's total XmR block payload is at or under the design's stated sizing figure, and the storyboard audit rules pass | measure the auto-generated XmR span payload against the design-phase headroom figure (requirement 4); `fit-wiki audit` shows no `storyboard.word-budget` / `storyboard.line-budget` error                                    |
| 8   | _(observational, non-gating)_ The merge produces a step change on the `storyboard_autogen_words` series                                                                 | read the series across the merge point; if the merge lands inside Exp #1706's 6/13–6/14 window, it registers as the pre-named interferer per the #1706 amendment — otherwise record the step as a post-window datum on #1706 |
| 9   | Changing the configured window value changes rendered storyboard chart width without code changes                                                                       | set a different window value via the design's lever; refresh; column counts follow the configured value                                                                                                                      |

## Measurement

Exp #1706 already instruments `storyboard_autogen_words` (decomposed from
whole-file words by obstacle #1704's correction) with a re-keyed baseline and a
6/13–6/14 observation window, and pre-registers a merged #1691 fix as a named
interferer. Criterion 8 closes that loop **without gating on schedule**: the
countermeasure's effect arrives as a step change on an instrument armed before
the change existed, and is recorded on #1706 whether the merge lands inside or
after the pre-registered window. Pass or fail of this spec rests on criteria 1–7
and 9, which the change alone controls.
