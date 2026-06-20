# Metrics — Design

Record per KATA.md § Metrics. Append one row per run.

| Metric          | Unit  | Description                          | Data source |
| --------------- | ----- | ------------------------------------ | ----------- |
| designs_drafted | count | Design PRs opened or merged this run | `list` changes ([work-trackers.md](../../../agents/references/work-trackers.md)) |

Design backlog (`specs/` with `spec.md` but no `design-a.md`) is queried,
not recorded.
