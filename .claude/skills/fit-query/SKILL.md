---
name: fit-query
description: >
  Query an RDF graph index with a triple pattern to answer relationship
  questions — which people belong to an organization, which projects reference a
  capability. Use when you need graph relationships without writing join logic or
  standing up a SPARQL endpoint.
---

# Query a Knowledge Graph

`fit-query` matches a triple pattern (`<subject> <predicate> <object>`) against
a graph index built from RDF knowledge sources and prints the matching
identifiers, one per line. Use `?` as a wildcard for the position you want to
resolve. It is the relationship companion to `fit-subjects`, which enumerates
subjects by type.

## When to Use

- Find subjects of a type — `npx fit-query "?" rdf:type schema:Person`
- Resolve any one position of a triple by placing `?` there
- Answer "which X relates to Y" without writing join logic

## Usage

```sh
# Every subject whose type is schema:Person
npx fit-query "?" rdf:type schema:Person
```

The query takes exactly three arguments: subject, predicate, and object. Put `?`
in the position you want to resolve; the other two anchor the pattern. Output is
one matching identifier per line.

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
