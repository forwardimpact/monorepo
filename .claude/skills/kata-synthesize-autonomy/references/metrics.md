# Metrics — Autonomy Synthesis

Record per KATA.md § Metrics. Append one row per run.

| Metric              | Unit  | Description                                          | Data source        |
| ------------------- | ----- | ---------------------------------------------------- | ------------------ |
| changes_coded       | count | Corpus changes coded this run                        | Coding table       |
| human_signal_merges | count | Merges preceded by a stated human approval signal    | Coding table       |
| bypass_merges       | count | Merges landing over or around the gate, no signal    | Coding table       |
| agent_only_merges   | count | Merges authorized and executed entirely by agents    | Coding table       |

The coding table itself is run output, not memory — the wiki keeps the
distribution summary and these counts, so the next run re-derives rows from
the tracker rather than trusting a stale table.
