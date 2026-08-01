# Storyboard — YYYY Month

## Challenge

_The long-term direction that gives meaning to target conditions and
experiments. It changes rarely, only when strategic direction shifts._
_**Budget: ≤100 words.** Write the state. Omit the history._

> [product-manager writes the challenge here.]

## Target Condition

_The measurable state the team aims to reach by the end of this month. It is
not a task list. It describes how the system will behave differently. Express
it in terms you can verify with data from metrics CSVs._
_**Budget: ≤900 words.** The per-dimension table dominates. Keep the prose
intro short._

> [product-manager writes the target condition, with metrics and thresholds.]

**Due:** YYYY-MM-DD (end of month)

## Current Condition

_The measured state as of the last storyboard review. Update it daily with data
from wiki/metrics/. Always write numbers. Do not write narratives._
_**Budget: ≤300 words** for the intro / "Last updated" paragraph. Avoid the
single-line mega-paragraph pattern. Break centerpiece findings into the
Headlines list below._

**Last updated:** YYYY-MM-DD

### Headlines

_Tight list of metrics whose status changed since the last meeting (new signal,
threshold crossed, classification flip). If nothing changed, the list is empty.
Write "None." on a single line._
_**Budget: ≤400 words** total (≈10 bullets × ~40 words). Prior-session
headlines do not carry over. They retire to the weekly log at session end._

- `{agent}` / `{metric}` — {value} {trend/badge} — {one-line reason}

### {agent}

_**Per-agent block budget: ≤200 words** — chart + Signals line + at most one
short `_Note:_` cross-reference when a signal must anchor to an event._

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

_Note:_ {one line, only when `status` is `signals_present` or a fired rule must
cross-reference a specific event. Stable metrics get no prose}.

(Repeat one `#### metric_name` block per metric, grouped under `### {agent}`.
The deterministic `gemba-wiki refresh` step regenerates all marker blocks from
CSV data. The chart is the visualization. Never duplicate its values in prose.
Agents add the cross-reference layer only where there is something to say.)

### Notes

_Cross-cutting observations that do not belong under any single agent. Add the
section only when needed. Omit it otherwise._
_**Budget: ≤300 words.** Older notes retire to weekly logs each session._

## Obstacles

_What stands between the current condition and the target condition.
Experiments discover obstacles. Nobody predicts them upfront. Each obstacle is
a labeled GitHub issue. The storyboard lists render from GitHub state. Nobody
hand-edits them._
_**Budget: auto-rendered, no manual prose.** Verdict and rationale live in
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
GitHub issue that carries the full PDSA content. The storyboard lists render
from GitHub state. Nobody hand-edits them._
_**Budget: auto-rendered, no manual prose.** Hypothesis, P1/F4 conditions,
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

_Future verdict horizons, coaching queue, and inter-session deliverables._
_**Budget: ≤500 words.** Past dates retire each session. Keep only what is
still ahead._

## Retention rule

When you conclude an obstacle or experiment, post the verdict as a closing
comment on the issue. Then close the issue. `gemba-wiki refresh` rerenders both
`Active` and `Concluded (last 7 days)` from GitHub state. Items aged out of the
7-day window drop off automatically. The closed issue is the permanent record.
