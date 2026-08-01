---
title: Answer Relationship Questions from a Product
description: Answer relationship questions from any product — triple patterns against the shared graph service, no join logic.
---

You need to answer a relationship question from within a product. Examples are
which people belong to an organization, which projects reference a capability,
and which resources share a type. The graph service holds the RDF index in
memory and exposes three RPCs: `QueryByPattern`, `GetSubjects`, and
`GetOntology`. This page walks through each RPC with copy-pasteable examples.

For the full setup, see
[Ground Agents in Context](/docs/services/ground-agents/). That guide shows how
to connect to both the graph and vector services.

## Prerequisites

- You completed the
  [Ground Agents in Context](/docs/services/ground-agents/) guide. You
  installed `@forwardimpact/librpc` and `@forwardimpact/libtype`. The graph
  service runs. `createClient("graph")` connects successfully.
- A populated graph index at `data/graphs/index.jsonl`.

## Connect

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { graph, common } from "@forwardimpact/libtype";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");
const graphClient = await createClient("graph", logger, tracer);
```

## Query by triple pattern

`QueryByPattern` takes a subject, predicate, and object. Use `?` as a wildcard
in any position. The service returns resource identifiers whose triples match
the pattern.

### Find all entities with a given relationship

```js
const query = graph.PatternQuery.fromObject({
  subject: "?",
  predicate: "schema:worksFor",
  object: "?",
});

const result = await graphClient.QueryByPattern(query);
console.log("Matches:", result.identifiers?.length ?? 0);

for (const id of result.identifiers ?? []) {
  console.log(String(id));
}
```

Expected output:

```text
Matches: 3
common.Message.a1b2c3
common.Message.d4e5f6
common.Message.g7h8i9
```

### Constrain to a specific object

```js
const query = graph.PatternQuery.fromObject({
  subject: "?",
  predicate: "schema:worksFor",
  object: "https://acme.example/org/engineering",
});

const result = await graphClient.QueryByPattern(query);
console.log("People in engineering:", result.identifiers?.length ?? 0);
```

### Find all properties of a subject

```js
const query = graph.PatternQuery.fromObject({
  subject: "https://acme.example/people/alice",
  predicate: "?",
  object: "?",
});

const result = await graphClient.QueryByPattern(query);
```

This returns every resource that contributed triples about Alice.

### Apply a result filter

Pass a `filter` object to limit results:

```js
const query = graph.PatternQuery.fromObject({
  subject: "?",
  predicate: "rdf:type",
  object: "schema:Person",
  filter: { limit: "5", prefix: "common.Message" },
});

const result = await graphClient.QueryByPattern(query);
```

## List subjects

`GetSubjects` returns all entity URIs in the graph. You can filter the result
by RDF type. Each line in the response is a tab-separated subject URI and its
type.

### All subjects

```js
const allSubjects = graph.SubjectsQuery.fromObject({});
const result = await graphClient.GetSubjects(allSubjects);
console.log(result.content);
```

Expected output:

```text
https://acme.example/org/engineering	https://schema.org/Organization
https://acme.example/people/alice	https://schema.org/Person
https://acme.example/people/bob	https://schema.org/Person
```

### Filtered by type

```js
const personSubjects = graph.SubjectsQuery.fromObject({
  type: "schema:Person",
});

const result = await graphClient.GetSubjects(personSubjects);
console.log(result.content);
```

Expected output:

```text
https://acme.example/people/alice	https://schema.org/Person
https://acme.example/people/bob	https://schema.org/Person
```

The service resolves type synonyms automatically. The ontology defines these
synonyms with `skos:altLabel`. A query for `schema:Person` also returns
entities with the type `schema:Individual` if the ontology maps them.

## Read the ontology

The ontology is a SHACL description of all types and predicates observed in the
graph. It tells you what questions the graph can answer before you write
queries:

```js
const ontology = await graphClient.GetOntology(common.Empty.fromObject({}));
console.log(ontology.content.substring(0, 300));
```

The response is a Turtle RDF string that contains SHACL shape definitions for
every observed type and predicate.

## Verify

You reach the outcome of this guide when:

- `QueryByPattern` with a subject/predicate/object pattern returns matching
  resource identifiers.
- `GetSubjects` with a type filter returns only entities of that type.
- `GetOntology` returns Turtle RDF that describes the available types and
  predicates.
- A `filter` with `limit` constrains the result count.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../search-content -->

</div>
