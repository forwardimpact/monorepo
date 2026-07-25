# Metrics — Backlog Synthesis

Record per KATA.md § Metrics. Append one row per run.

| Metric             | Unit  | Description                                     | Data source  |
| ------------------ | ----- | ----------------------------------------------- | ------------ |
| clusters_processed | count | Clusters taken through the method this run      | Corpus map   |
| items_coded        | count | Corpus items memoed and coded this run          | Coding table |
| issues_closed      | count | Addressed issues closed as duplicate            | Corpus map   |
| prs_superseded     | count | Open PRs closed as superseded by the spec       | Corpus map   |

The coding table itself is run output, not memory — the wiki keeps the corpus
map and these counts, so the next sweep re-derives rows from the tracker
rather than trusting a stale table.
