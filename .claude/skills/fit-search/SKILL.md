---
name: fit-search
description: >
  Find content related to a query by meaning, not keywords, from a vector index.
  Use when you need ranked semantic results over a few hundred to a few thousand
  embeddings without standing up a vector database.
---

# Search Semantically

`fit-search` embeds a query string, scores it against a JSONL-backed vector
index with dot-product similarity, and prints the top matches as
`identifier<TAB>score`. The index loads into memory on first access, so there is
no database to provision for a modest corpus.

## When to Use

- Find resources related to a phrase by meaning — `npx fit-search 'career progression'`
- Retrieve ranked candidates to feed an agent's context window
- Search a corpus too small to justify a hosted vector database

## Usage

```sh
npx fit-search 'career progression'
```

Output is one result per line, `identifier<TAB>score`, ordered by descending
similarity (top 10). The score is a normalized dot product in the range 0–1.

`fit-search` calls the embedding service to vectorize the query, then reads the
index from the `vectors` storage location. Build the embedding pipeline first —
see the guide below.

## Documentation

- [Search Semantically](https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md)
  — Find related content by meaning with ranked results from a vector index, no
  vector database required.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — The full workflow for building an embedding pipeline from knowledge sources.
