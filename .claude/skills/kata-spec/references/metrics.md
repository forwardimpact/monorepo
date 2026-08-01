# Metrics — Specification

Record per KATA.md § Metrics. Append
one row per run.

| Metric        | Unit  | Description                        | Data source |
| ------------- | ----- | ---------------------------------- | ----------- |
| specs_drafted | count | Spec PRs opened or pushed this run | `list` changes |

Query open spec PRs and draft age with `list` changes
([work-trackers.md](../../../agents/x-work-trackers.md)) plus `git log`. Do not
record them.
