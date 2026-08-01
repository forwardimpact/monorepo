---
name: fit-process
description: >
  Build the knowledge indexes from HTML sources: process resources, then graphs
  and vectors. Use when you populate the retrieval indexes an agent queries. It
  is a build-pipeline step. Run the stages in order before search or graph
  queries work.
---

# Build the Knowledge Indexes

`fit-process` is the write surface. It turns HTML knowledge sources into the
indexes `fit-rag` queries. One binary holds three subcommands that run in
order. `resources` parses HTML into typed resources. `graphs` derives an RDF
graph from them. `vectors` embeds them into a vector index.

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
offline. `vectors` needs the embedding service to be up. When the service is
unreachable, the command fails fast within the RPC deadline (60s by default).
It names the embedding host and port. It does not hang. Run `resources` before
`graphs` and `vectors`. Both read the resource index that `resources` writes.
Build the indexes first, then query them with `fit-rag`.
