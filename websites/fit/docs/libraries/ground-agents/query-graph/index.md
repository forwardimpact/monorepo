---
title: Query a Knowledge Graph
description: Answer relationship questions from an RDF graph index with triple patterns and type-filtered subject lists. You need no join logic and no SPARQL endpoint.
---

You need to find how two concepts relate: which people belong to an
organization, which projects reference a capability, which resources share a
type. The relationships exist as RDF triples in a graph index. You do not want
to write join logic to answer the question. You do not want to stand up a
SPARQL endpoint either. `fit-rag query` and `fit-rag subjects` give you
triple-pattern queries and type-filtered subject lists from the command line.

For the full workflow that builds and populates the graph index from HTML
knowledge sources, see
[Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 22+
- `@forwardimpact/libgraph` installed:

```sh
npm install -g @forwardimpact/libgraph
```

- A populated graph index under `data/graphs/` (`fit-process graphs` produces
  it during the ingestion pipeline)

## List all subjects by type

When you need to see every entity of a given type in the graph, use
`fit-rag subjects` with a prefixed type:

```sh
npx fit-rag subjects schema:Person
```

```text
https://acme.example/people/jane-doe	https://schema.org/Person
https://acme.example/people/john-smith	https://schema.org/Person
```

Each line is a tab-separated pair: the subject URI and its `rdf:type`. To list
all subjects regardless of type, omit the argument:

```sh
npx fit-rag subjects
```

```text
https://acme.example/people/jane-doe	https://schema.org/Person
https://acme.example/orgs/acme-hq	https://schema.org/Organization
https://acme.example/projects/ledger	https://schema.org/Project
```

Wildcards (`?`, `*`, `_`) work the same way as an omitted argument. The command
returns all subjects.

### Type synonyms

The graph index resolves type synonyms that the ontology defines with
`skos:altLabel`. If the ontology declares `Individual` as an alternate label
for `Person`, a query for `schema:Person` also returns entities typed as
`schema:Individual`. You need no extra flags. The index resolves synonyms
automatically.

## Query with a triple pattern

`fit-rag query` takes exactly three positional arguments: subject, predicate,
and object. It returns the resource identifiers whose triples match the
pattern. Use `?` for any position you want to leave open:

```sh
npx fit-rag query "?" schema:worksFor "https://acme.example/orgs/acme-hq"
```

```text
common.Message.a1b2c3
common.Message.d4e5f6
```

The output is one resource identifier per line. You can pass each identifier to
`fit-process resources`. You can also resolve it through `libresource` to
retrieve the full context chunk.

### Find all properties of a subject

```sh
npx fit-rag query "https://acme.example/people/jane-doe" "?" "?"
```

```text
common.Message.a1b2c3
```

This returns every resource that contributed triples about that subject. To
see the actual triples, resolve the identifier through the resource index.

### Find entities by predicate

```sh
npx fit-rag query "?" schema:name "?"
```

```text
common.Message.a1b2c3
common.Message.d4e5f6
common.Message.g7h8i9
```

This lists every resource that contains a `schema:name` predicate, regardless
of subject or value.

### Quoted literal values

When the object is a literal string rather than a URI, wrap it in double
quotes:

```sh
npx fit-rag query "?" schema:name "\"Jane Doe\""
```

```text
common.Message.a1b2c3
```

The outer shell quotes protect the inner double quotes that mark the value as
an RDF literal.

## Supported prefixes

The graph index recognizes these namespace prefixes out of the box:

| Prefix   | Namespace                                       |
| -------- | ----------------------------------------------- |
| `schema` | `https://schema.org/`                           |
| `rdf`    | `http://www.w3.org/1999/02/22-rdf-syntax-ns#`   |
| `rdfs`   | `http://www.w3.org/2000/01/rdf-schema#`         |
| `foaf`   | `http://xmlns.com/foaf/0.1/`                    |
| `fit`    | `https://www.forwardimpact.team/schema/rdf/`    |
| `ex`     | `https://example.invalid/`                      |

Use prefixed form (`schema:Person`) or full URIs
(`https://schema.org/Person`) interchangeably in any position.

## Filter results

Both commands accept optional filters that constrain the returned identifiers:

| Filter       | Effect                                                   |
| ------------ | -------------------------------------------------------- |
| `prefix`     | Only return identifiers that start with the given string |
| `limit`      | Cap the number of results                                |
| `max_tokens` | Stop once the cumulative token count exceeds the budget  |

When you call `GraphIndex.queryItems(pattern, filter)` from code, pass the
filter as the second argument:

```js
import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";

const graph = createGraphIndex("graphs");
const pattern = parseGraphQuery("? schema:worksFor ?");
const results = await graph.queryItems(pattern, { limit: 5 });

for (const id of results) {
  console.log(String(id));
}
```

```text
common.Message.a1b2c3
common.Message.d4e5f6
common.Message.g7h8i9
common.Message.j0k1l2
common.Message.m3n4o5
```

## How the graph index is structured

The graph index stores triples in an N3 in-memory store backed by a JSONL file
at `data/graphs/index.jsonl`. On first access, the index loads the JSONL into
memory and populates the N3 store. Later queries run entirely in memory.

An `ontology.ttl` file alongside the index captures SHACL shapes inferred from
the data. `fit-process graphs` regenerates the ontology every time it runs.

## List subjects from code

`fit-rag subjects` is a thin wrapper around `GraphIndex.getSubjects(type)`. Call
the method directly when you want the subject-to-type map in your own code
rather than tab-separated lines:

```js
import { createGraphIndex } from "@forwardimpact/libgraph";

const graph = createGraphIndex("graphs");

// Every subject of a given type (including ontology synonyms)
const people = await graph.getSubjects("schema:Person");
for (const [subjectUri, typeUri] of people) {
  console.log(subjectUri, typeUri);
}

// Omit the argument (or pass a wildcard) to list every typed subject
const everyone = await graph.getSubjects();
```

`getSubjects` returns a `Map` keyed by subject URI. The subject's `rdf:type`
URI is the value. When you pass a type, the method applies the same automatic
synonym resolution as the CLI. If the ontology declares an alternate label for
the type, the result includes instances of the synonym.

## Read every triple

Sometimes you need the raw triples instead of matched identifiers. You may want
to re-export the graph, count predicates, or feed another tool. `getAllQuads()`
returns every quad in the store:

```js
const quads = await graph.getAllQuads();
for (const quad of quads) {
  console.log(quad.subject.value, quad.predicate.value, quad.object.value);
}
```

Each quad exposes `subject`, `predicate`, and `object` terms with a `.value`
that holds the URI or literal string.

## Inspect the ontology

The ontology describes the shape of the data: which types exist, which
properties each type carries, and how types relate. The generated
`ontology.ttl` is a SHACL document. It holds one `NodeShape` per observed type.
It records a `PropertyShape` for each predicate, instance counts, the dominant
object class for object-valued predicates, and inferred inverse relationships.

To build a SHACL ontology document from collected shape data in your own
pipeline, use the exported `ShaclSerializer`:

```js
import { ShaclSerializer } from "@forwardimpact/libgraph";

const serializer = new ShaclSerializer();
const turtle = serializer.serialize(ontologyData);
```

`serialize` takes a shape-data object and returns the Turtle string. That
object holds the per-class subject sets, predicate maps, predicate counts,
object-type counts, and the inverse-predicate map. The scan of the graph
collects them. An agent reads those shapes to learn what questions the graph
can answer before it writes a single query.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../lookup-context -->

</div>
