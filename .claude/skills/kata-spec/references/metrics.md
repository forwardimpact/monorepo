# Metrics — Specification

Record per KATA.md § Metrics. Append
one row per run.

| Metric        | Unit  | Description                        | Data source |
| ------------- | ----- | ---------------------------------- | ----------- |
| specs_drafted | count | Spec PRs opened or pushed this run | `list` changes |

Open spec PRs and draft age (`list` changes —
[work-trackers.md](../../../agents/references/work-trackers.md) — plus
`git log`) are queried, not recorded.
