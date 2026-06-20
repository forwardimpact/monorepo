# Metrics — Implementation

Record per KATA.md § Metrics. Append
one row per run.

| Metric                  | Unit  | Description                                  | Data source |
| ----------------------- | ----- | -------------------------------------------- | ----------- |
| implementations_shipped | count | Implementation PRs opened or merged this run | `list` changes ([work-trackers.md](../../../agents/references/work-trackers.md)) |

`implementations_shipped` is route-bearing: every row records which route
the activation took and which were eligible-but-not-taken. See
[route-decision.md](route-decision.md) for the route set and the recording
rule.
