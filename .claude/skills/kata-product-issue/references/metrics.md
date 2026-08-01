# Metrics — Product Triage

Record per KATA.md § Metrics.

| Metric         | Unit  | Description             | Data source |
| -------------- | ----- | ----------------------- | ----------- |
| issues_triaged | count | Issues triaged this run | Run actions |

## Recording Rule — Uniform Per-Activation

Append exactly one row per `kata-product-issue` activation. The `### Decision`
block the agent appends to its weekly log is the activation marker. Every
Decision block contributes one CSV row, even when the run produced no triage
actions. A clean assess (no issues classified, or a closure-only run, or a
re-assess with no inflow) emits `value=0`. A run that triages N issues emits
`value=N`.

This is the **utilization** frame. Every PM-autonomous wakeup is a triage
opportunity-window, so each activation is one observation of the process. If
you suppress zero-rows on clean assesses, you contaminate the XmR signal
with selection bias. The runs drop out precisely when no work happened, and
that is the data point.

You query the backlog (`list` issues —
[work-trackers.md](../../../agents/x-work-trackers.md)). Do not record it.
The backlog is a stock. It is not process data.
