# Storyboard — YYYY Month

## Challenge

_The long-term direction that gives meaning to target conditions and
experiments. Changes rarely — only when strategic direction shifts._
_**Budget: ≤100 words.** State, not history._

> [Write the challenge here.]

## Target Condition

_The measurable state the team aims to reach by the end of this month. Not a
task list — a description of how the system will behave differently, expressed
in terms verifiable with data from metrics CSVs._
_**Budget: ≤900 words** (the per-dimension table dominates; prose intro stays
short)._

> [Write the target condition here. Include specific metrics and thresholds.]

**Due:** YYYY-MM-DD (end of month)

## Current Condition

_The measured state as of the last storyboard review. Updated daily using data
from wiki/metrics/. Always numbers, not narratives._
_**Budget: ≤300 words** for the intro / "Last updated" paragraph. Avoid the
single-line mega-paragraph pattern — break centerpiece findings into the
Headlines list below._

**Last updated:** YYYY-MM-DD

### Headlines

_Tight list of metrics whose status changed since the last meeting (new signal,
threshold crossed, classification flip). Empty if nothing changed — write
"None." on a single line._
_**Budget: ≤400 words** total (≈10 bullets × ~40 words). Prior-session
headlines do not carry over — they retire to the weekly log at session end._

- `{agent}` / `{metric}` — {value} {trend/badge} — {one-line reason}

### {agent}

_**Per-agent block budget: ≤200 words** — chart + Signals line + at most one
short `_Note:_` cross-reference when a signal needs anchoring to an event._

#### {metric_name}

<!-- xmr:{metric_name}:wiki/metrics/{skill}/{YYYY}.csv Do not edit. Auto-generated. -->

```text
{14-line Wheeler/Vacanti X+mR chart. The chart labels μ, UPL, LPL, ±1.5σ
zones, URL, R, and the run index — do not restate any of those numbers outside
the chart.}
```

**Signals:** {fired-rule list (`xRule1`, `xRule2`, `xRule3`, `mrRule1`), or `—`
if none}
<!-- /xmr -->

_Note:_ {one line, only when `status` is `signals_present` or a fired rule needs
cross-referencing to a specific event; stable metrics get no prose}.

(Repeat one `#### metric_name` block per metric, grouped under `### {agent}`.
The deterministic `fit-wiki refresh` step regenerates all marker blocks from CSV
data. The chart is the visualization — never duplicate its values in prose.
Agents add the cross-reference layer only where there is something to say.)

### Notes

_Cross-cutting observations that don't belong under any single agent (only when
needed; omit the section entirely otherwise)._
_**Budget: ≤300 words.** Older notes retire to weekly logs each session._

## Obstacles

_What stands between the current condition and the target condition. Discovered
through experiments, not predicted upfront. Each obstacle is a labeled GitHub
issue; the storyboard lists are rendered from GitHub state, not hand-edited._
_**Budget: auto-rendered — no manual prose.** Verdict and rationale live in
the issue's closing comment._

### Active

<!-- obstacles:open Do not edit. Auto-generated. -->
- #NNN [obstacle name]
<!-- /obstacles -->

### Concluded (last 7 days)

<!-- obstacles:closed Do not edit. Auto-generated. -->
- #NNN [obstacle name]
<!-- /obstacles -->

## Experiments

_PDSA cycles run against the current obstacle. Each experiment is a labeled
GitHub issue carrying the full PDSA content; the storyboard lists are rendered
from GitHub state, not hand-edited._
_**Budget: auto-rendered — no manual prose.** Hypothesis, P1/F4 conditions,
and verdict live in the issue body._

### Active

<!-- experiments:open Do not edit. Auto-generated. -->
- #NNN [experiment name]
<!-- /experiments -->

### Concluded (last 7 days)

<!-- experiments:closed Do not edit. Auto-generated. -->
- #NNN [experiment name]
<!-- /experiments -->

### Next review

_Upcoming verdict horizons, coaching queue, and inter-session deliverables._
_**Budget: ≤500 words.** Past dates retire each session — keep only what is
still ahead._

## Retention rule

When concluding an obstacle or experiment, post the verdict as a closing comment
on the issue and close the issue. `npx fit-wiki refresh` rerenders both
`Active` and `Concluded (last 7 days)` from GitHub state, and items aged out of
the 7-day window drop off automatically. The closed issue is the permanent
record.
