# Metrics — Backlog Synthesis

Record per KATA.md § Metrics. Append one row per run.

| Metric             | Unit  | Description                                     | Data source  |
| ------------------ | ----- | ----------------------------------------------- | ------------ |
| clusters_processed | count | Clusters taken through the method this run      | Corpus map   |
| items_coded        | count | Corpus items memoed and coded this run          | Coding table |
| issues_closed      | count | Addressed issues closed as duplicate            | Corpus map   |
| prs_superseded     | count | Open PRs closed as superseded by the spec       | Corpus map   |

The coding table is run output. It is not memory. The wiki keeps the corpus
map and these counts. The next sweep then re-derives rows from the tracker. It
does not trust a stale table.
