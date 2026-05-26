# Metrics — Product Triage

Record per KATA.md § Metrics.

| Metric         | Unit  | Description             | Data source |
| -------------- | ----- | ----------------------- | ----------- |
| issues_triaged | count | Issues triaged this run | Run actions |

## Recording rule — uniform per-activation

Append exactly one row per `kata-product-issue` activation. The `### Decision`
block the agent appends to its weekly log is the activation marker: every
Decision block contributes one CSV row, regardless of whether the run produced
any triage actions. A clean assess (no issues classified, or a closure-only
run, or a re-assess with no inflow) emits `value=0`. A run that triages N
issues emits `value=N`.

This is the **utilization** framing: every PM-autonomous wakeup is a triage
opportunity-window, so each activation is one observation of the process.
Suppressing zero-rows on clean assesses contaminates the XmR signal with
selection bias — runs get dropped precisely when no work happened, which is
the data point.

Backlog (`gh issue list`) is queried, not recorded — it's a stock, not process
data.

## Prospective tagging

Rows emitted under this rule during the verification window for the
uniform-cadence experiment carry the note tag
`kata-pm-issue-uniform-cadence`. After the verdict horizon the tag is no
longer required; the recording rule remains.
