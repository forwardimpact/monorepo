---
name: fit-rag
description: >
  Query the knowledge indexes: search by meaning, answer relationship questions
  with triple patterns, or list graph subjects by type. Use when you need
  ranked semantic results or graph relationships without standing up a vector
  database or SPARQL endpoint.
---

# Query the Knowledge Indexes

`fit-rag` is the read surface over the indexes the build pipeline produces. One
binary, three subcommands: `search` ranks a vector index by meaning, `query`
matches a triple pattern against a graph index, and `subjects` enumerates graph
subjects by type. Build the indexes first; this queries them.

## When to Use

- Find content related to a phrase by meaning —
  `fit-rag search 'career progression'`
- Answer "which X relates to Y" without join logic —
  `fit-rag query "?" rdf:type schema:Person`
- Enumerate the entities of a type before forming a query —
  `fit-rag subjects schema:Person`

## Usage

```sh
# Semantic search — one result per line, identifier<TAB>score, top 10 by
# descending similarity. Calls the embedding service to vectorize the query.
fit-rag search 'career progression'

# Triple-pattern query — exactly three arguments (subject predicate object).
# Put `?` in the position to resolve; prints one matching identifier per line.
fit-rag query "?" rdf:type schema:Person

# Subject listing — one subject<TAB>type per line; pass a type to filter.
fit-rag subjects
fit-rag subjects schema:Person
```

`search` reads the vector index and needs the embedding service; `query` and
`subjects` read the graph index and run offline. Build and populate the indexes
first — see the guides below.

## Documentation

- [Search Semantically](https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md)
  — Find related content by meaning with ranked results from a vector index, no
  vector database required.
- [Query a Knowledge Graph](https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md)
  — Answer relationship questions from an RDF graph index with triple-pattern
  queries and type-filtered subject listings.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — The full workflow for building the graph and vector indexes from HTML
  knowledge sources, then querying them.
