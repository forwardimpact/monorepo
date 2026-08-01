# librag

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Consolidated retrieval CLIs — build the knowledge indexes, then query them by
meaning or relationship.

<!-- END:description -->

## Getting Started

`librag` aggregates the retrieval-augmented-generation CLI surface into two
binaries. It holds no processing or query logic of its own. Each subcommand
constructs the same index and processor its predecessor did. Each subcommand
delegates to `libresource`, `libgraph`, and `libvector`.

- **`fit-process`** — build the indexes. `resources` turns HTML into the
  `resources` index. `graphs` turns resources into the `graphs` index.
  `vectors` turns resources into the `vectors` index.
- **`fit-rag`** — query the indexes. `search` ranks the `vectors` index by
  meaning. `query` answers triple patterns over the `graphs` index.
  `subjects` lists graph subjects by type.

```sh
# Build, then query
fit-process resources --base https://example.invalid/
fit-process graphs
fit-process vectors
fit-rag query "?" rdf:type schema:Person
```

Only `fit-process vectors` and `fit-rag search` need the embedding service.
The other subcommands run offline.

## Documentation

- [Search Semantically](https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md)
  — find related content by meaning with ranked results from a vector index
  (`fit-rag search`). You need no vector database.
- [Query a Knowledge Graph](https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md)
  — answer relationship questions from an RDF graph index with triple-pattern
  queries (`fit-rag query`) and type-filtered subject lists
  (`fit-rag subjects`).
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — the full workflow to build the graph and vector indexes from HTML
  knowledge sources, then query them.
