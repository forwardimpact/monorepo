---
title: Resolve a Resource
description: Give agents rich, typed context from a resource identifier. They get provenance, access control, and RDF content instead of raw files.
---

You have a resource identifier from `fit-rag query`, `fit-rag search`, or an
index lookup. You need to retrieve the actual content behind it. When you pass
a raw file path to an agent, the path loses provenance. It ignores access
control. It leaves the consumer to guess the content type.
`@forwardimpact/libresource` resolves identifiers into typed resources with
structured content, stable identifiers, and policy-controlled access.

For the full workflow that ingests knowledge sources and builds the resource
index, see [Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 22+
- `@forwardimpact/libresource` installed:

```sh
npm install @forwardimpact/libresource
```

- A populated resource index under `data/resources/` (`fit-process resources`
  produces it during the ingestion pipeline)

## Create a resource index

The `createResourceIndex` factory builds an index backed by local storage:

```js
import { createResourceIndex } from "@forwardimpact/libresource";

const resourceIndex = createResourceIndex("resources");
```

The string argument is the storage prefix. It maps to the `data/resources/`
directory by default. An optional second argument accepts a custom policy
instance. When you omit it, the index uses a permissive default policy.

## Resolve identifiers to resources

The `get` method accepts an array of identifier strings and returns typed
resource objects:

```js
const ids = ["common.Message.a1b2c3", "common.Message.d4e5f6"];
const resources = await resourceIndex.get(ids);

for (const res of resources) {
  console.log(`${res.id} (${res.role}): ${res.content.slice(0, 80)}...`);
}
```

```text
common.Message.a1b2c3 (system): <https://acme.example/people/jane-doe> a schema:...
common.Message.d4e5f6 (system): <https://acme.example/orgs/acme-hq> a schema:Org...
```

Each returned resource carries:

| Field     | Type   | Description                                                |
| --------- | ------ | ---------------------------------------------------------- |
| `id`      | `Identifier` | Typed identifier with `type`, `name`, and optional `parent` |
| `role`    | string | Message role (`system`, `user`, `assistant`)                |
| `content` | string | RDF serialization (Turtle format) of the entity's triples  |

The index silently skips missing identifiers. The result array can be shorter
than the input.

## Enforce access control

Pass an actor identifier as the second argument to `get`. The resource index
evaluates the configured policy before it returns results:

```js
const resources = await resourceIndex.get(ids, "agent:technical-writer");
```

If the policy denies access, the call throws an `"Access denied"` error. When
you provide no actor, the index skips the policy check entirely.

## Discover and check resources

Three methods help you navigate the index. They do not load the full content:

```js
// Check whether a specific resource exists
const exists = await resourceIndex.has("common.Message.a1b2c3");

// Find all resources whose ID starts with a prefix
const messageIds = await resourceIndex.findByPrefix("common.Message");

// List every resource in the index
const allIds = await resourceIndex.findAll();
```

Both `findByPrefix` and `findAll` return `Identifier` objects. They do not
return full resources. Pass them to `get` to load content.

## Write resources into the index

Beyond the read path, the index can store resources directly. Use this when you
build resources in code and do not run the ingestion pipeline. The resource can
come from a non-HTML source. It can also be the output of a step you write:

```js
import { common } from "@forwardimpact/libtype";

const message = common.Message.fromObject({
  id: { name: "jane-doe" },
  role: "system",
  content: "<https://acme.example/people/jane-doe> a schema:Person .",
});

await resourceIndex.put(message);
```

`put` generates the resource's identifier when the resource does not carry
one. It then
writes a single JSON file under the index's storage prefix. `add` is an alias
for `put`. Both store one resource. Both overwrite any existing file with the
same identifier, so a second write of the same resource is idempotent.

## Process HTML into resources

The ingestion pipeline converts HTML knowledge sources into typed `Message`
resources with `fit-process resources`:

```sh
npx fit-process resources --base https://acme.example/
```

The command reads HTML files from the `data/knowledge/` directory. It extracts
schema.org microdata as RDF triples and groups them by entity. It stores each
entity as a `common.Message` resource in `data/resources/`.

When the same entity appears in multiple HTML files, the processor merges
triples with RDF union semantics. The merge creates no duplicates and loses no
data. The merged resource carries the union of all triples observed across
files.

### How the processor generates identifiers

Each resource identifier is deterministic. The processor hashes the entity's
IRI to produce the `name` component:

```text
Entity IRI: https://acme.example/people/jane-doe
Identifier: common.Message.a1b2c3
Storage:    data/resources/common.Message.a1b2c3.json
```

A second run over the same HTML files produces the same identifiers, so the
pipeline is idempotent.

### Content format

The `content` field of each stored resource is a Turtle-format RDF
serialization of the entity's triples. The serializer sorts type assertions
(`rdf:type`) first, so downstream steps stay consistent:

```turtle
<https://acme.example/people/jane-doe> a schema:Person ;
    schema:name "Jane Doe" ;
    schema:worksFor <https://acme.example/orgs/acme-hq> .
```

The graph processor reads this content when it builds the graph index. The
vector processor reads it when it generates embeddings.

## Customize HTML extraction

`fit-process resources` covers the common path. Sometimes you need to drive the
extraction yourself. You may ingest from a different source, group the entities
yourself, or skolemize on your own schedule. The library exports two classes as
subpath imports.

The `Parser` extracts schema.org microdata from a parsed document into grouped
RDF items, and converts between quads and Turtle:

```js
import { Parser } from "@forwardimpact/libresource/parser.js";
import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js";

const parser = new Parser(new Skolemizer());

const items = await parser.parseHTML(document, "https://acme.example/");
for (const item of items) {
  const turtle = await parser.quadsToRdf(item.quads);  // RDF serialization
}
```

`parseHTML` returns one entry per main schema.org entity. Each entry carries
its `iri` and deduplicated `quads`. `quadsToRdf` serializes quads to Turtle,
with type assertions first. `rdfToQuads` parses Turtle back into quads.
`unionQuads` merges two quad arrays with RDF union semantics.

The `Skolemizer` replaces blank nodes with content-hashed `urn:skolem:` URIs so
the same entity gets the same identifier across documents:

```js
const skolemizer = new Skolemizer();
const stableQuads = skolemizer.skolemize(quadsWithBlankNodes);
```

The hash comes from each blank node's own triples. A second run of the
skolemizer on the same content produces the same URIs. That property makes
cross-document deduplication deterministic. Pass a custom base URI to the
constructor to namespace the skolem identifiers.

## Typical retrieval flow

A common pattern chains index lookup, resolution, and consumption:

```js
import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";
import { createResourceIndex } from "@forwardimpact/libresource";

const graph = createGraphIndex("graphs");
const resources = createResourceIndex("resources");

// 1. Query the graph for matching identifiers
const pattern = parseGraphQuery("? schema:worksFor ?");
const ids = await graph.queryItems(pattern, { limit: 5 });

// 2. Resolve identifiers to full resources
const chunks = await resources.get(ids.map(String), "agent:outpost");

// 3. Use the content
for (const chunk of chunks) {
  console.log(chunk.content);
}
```

The graph finds the identifiers that match a pattern. The resource index
returns the content behind them. Each library owns one step.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../query-graph -->

</div>
