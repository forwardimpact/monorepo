# Metrics — Archive Retention

Record per KATA.md § Metrics. Append
one row per run.

| Metric         | Unit  | Description                        | Data source   |
| -------------- | ----- | --------------------------------- | ------------- |
| retired_count  | count | Artifacts retired this run        | Archive ledger |
| deferred_count | count | Candidates deferred this run      | Archive ledger |

Do not count artifacts still inside their retention window. They are a stock.
They are not a per-run flow.
