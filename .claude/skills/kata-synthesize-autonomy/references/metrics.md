# Metrics — Autonomy Synthesis

Record per KATA.md § Metrics. Append one row per run.

| Metric              | Unit  | Description                                         | Data source  |
| ------------------- | ----- | --------------------------------------------------- | ------------ |
| changes_coded       | count | Corpus changes coded this run                       | Coding table |
| human_signal_merges | count | Merges preceded by a stated human approval signal   | Coding table |
| bypass_merges       | count | Merges that land over or around the gate, no signal | Coding table |
| agent_only_merges   | count | Merges that agents authorized and executed alone    | Coding table |

The coding table is run output. It is not memory. The wiki keeps the
distribution summary and these counts. So the next run re-derives rows from
the tracker. It does not trust a stale table.
