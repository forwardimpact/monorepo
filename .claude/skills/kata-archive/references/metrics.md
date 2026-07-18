# Metrics — Archive Retention

Record per KATA.md § Metrics. Append
one row per run.

| Metric         | Unit  | Description                        | Data source   |
| -------------- | ----- | --------------------------------- | ------------- |
| retired_count  | count | Artifacts retired this run        | Archive ledger |
| deferred_count | count | Candidates deferred this run      | Archive ledger |

Artifacts still inside their retention window are not counted — they are a
stock, not a per-run flow.
