---
name: fit-process
description: >
  Build the knowledge indexes from HTML sources: process resources, then graphs
  and vectors. Use when populating the retrieval indexes an agent queries, as a
  build-pipeline step run in order before search or graph queries work.
---

# Build the Knowledge Indexes

`fit-process` is the write surface that turns HTML knowledge sources into the
indexes `fit-rag` queries. One binary, three subcommands run in order:
`resources` parses HTML into typed resources, `graphs` derives an RDF graph from
them, and `vectors` embeds them into a vector index.

## When to Use

- Ingest HTML sources into typed resources — `fit-process resources`
- Derive the graph index from resources — `fit-process graphs`
- Embed resources into the vector index — `fit-process vectors`

## Usage

```sh
# Run the stages in order — each reads what the previous produced.
fit-process resources --base https://example.invalid/
fit-process graphs
fit-process vectors
```

`resources` accepts `--base` (`-b`) to set the base URI for generated
identifiers (default `https://example.invalid/`). `resources` and `graphs` run
offline; `vectors` calls the embedding service. Run `resources` before `graphs`
and `vectors`, which both read the resource index it writes. Once the indexes
are built, query them with `fit-rag`.
