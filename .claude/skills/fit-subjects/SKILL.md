---
name: fit-subjects
description: >
  List the subjects in an RDF graph index, optionally filtered by type. Use when
  you need to enumerate which entities of a given type exist in a knowledge graph
  — people, organizations, capabilities — without writing a SPARQL query or
  loading the whole graph into your application.
---

# List Graph Subjects

`fit-subjects` reads a graph index built from RDF knowledge sources and prints
its subjects, one per line, as `subject<TAB>type`. Pass a type to list only the
subjects of that type. It is the enumeration companion to `fit-query`, which
answers relationship questions with triple patterns.

## When to Use

- List every subject in the graph — `npx fit-subjects`
- List only subjects of one type — `npx fit-subjects schema:Person`
- Discover the entities available before forming a `fit-query` triple pattern

## Usage

```sh
# Every subject and its type
npx fit-subjects

# Only subjects of a given type
npx fit-subjects schema:Person
```

Each line is `subject<TAB>type`. Pipe to `cut -f1` to keep only identifiers.

The graph index is read from the `graphs` storage location. Build and populate
it first — see the guide below for the full pipeline from HTML knowledge sources
to a queryable index.

## Documentation

- [Query a Knowledge Graph](https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md)
  — Answer relationship questions from an RDF graph index with triple-pattern
  queries and type-filtered subject listings.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — The full workflow for building and populating the graph index from HTML
  knowledge sources.
