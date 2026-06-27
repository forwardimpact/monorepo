---
title: Resolve a Resource
description: Give agents rich, typed context from a resource identifier — provenance, access control, and RDF content instead of raw files.
---

You have a resource identifier -- returned by `fit-query`, `fit-search`, or an
index lookup -- and you need to retrieve the actual content behind it. Passing
a raw file path to an agent loses provenance, ignores access control, and
leaves the consumer guessing the content type. `@forwardimpact/libresource`
resolves identifiers into typed resources with structured content, stable
identifiers, and policy-controlled access.

For the full workflow of ingesting knowledge sources and building the resource
index, see [Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 22+
- `@forwardimpact/libresource` installed:

```sh
npm install @forwardimpact/libresource
```

- A populated resource index under `data/resources/` (produced by
  `fit-process-resources` during the ingestion pipeline)

## Create a resource index

The `createResourceIndex` factory builds an index backed by local storage:

```js
import { createResourceIndex } from "@forwardimpact/libresource";

const resourceIndex = createResourceIndex("resources");
```

The string argument is the storage prefix -- it maps to the `data/resources/`
directory by default. An optional second argument accepts a custom policy
instance; when omitted, a permissive default policy is used.

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

Missing identifiers are silently skipped -- the result array may be shorter
than the input.

## Enforce access control

Pass an actor identifier as the second argument to `get`. The resource index
evaluates the configured policy before returning results:

```js
const resources = await resourceIndex.get(ids, "agent:technical-writer");
```

If the policy denies access, the call throws an `"Access denied"` error. When
no actor is provided, the policy check is skipped entirely.

## Discover and check resources

Three methods help you navigate the index without loading full content:

```js
// Check whether a specific resource exists
const exists = await resourceIndex.has("common.Message.a1b2c3");

// Find all resources whose ID starts with a prefix
const messageIds = await resourceIndex.findByPrefix("common.Message");

// List every resource in the index
const allIds = await resourceIndex.findAll();
```

Both `findByPrefix` and `findAll` return `Identifier` objects, not full
resources. Pass them to `get` to load content.

## Write resources into the index

Beyond the read path, the index can store resources directly. Use this when you
build resources in code -- from a non-HTML source, or as the output of your own
processing -- instead of running the ingestion pipeline:

```js
import { common } from "@forwardimpact/libtype";

const message = common.Message.fromObject({
  id: { name: "jane-doe" },
  role: "system",
  content: "<https://acme.example/people/jane-doe> a schema:Person .",
});

await resourceIndex.put(message);
```

`put` generates the resource's identifier if one is not already set, then
writes a single JSON file under the index's storage prefix. `add` is an alias
for `put` -- both store one resource and overwrite any existing file with the
same identifier, so re-writing the same resource is idempotent.

## Process HTML into resources

The ingestion pipeline converts HTML knowledge sources into typed `Message`
resources using `fit-process-resources`:

```sh
npx fit-process-resources --base https://acme.example/
```

The command reads HTML files from the `data/knowledge/` directory, extracts
schema.org microdata as RDF triples, groups them by entity, and stores each
entity as a `common.Message` resource in `data/resources/`.

When the same entity appears in multiple HTML files, the processor merges
triples using RDF union semantics -- no duplicates, no data loss. The merged
resource carries the union of all triples observed across files.

### How identifiers are generated

Each resource identifier is deterministic. The processor hashes the entity's
IRI to produce the `name` component:

```text
Entity IRI: https://acme.example/people/jane-doe
Identifier: common.Message.a1b2c3
Storage:    data/resources/common.Message.a1b2c3.json
```

Re-processing the same HTML files produces the same identifiers, so the
pipeline is idempotent.

### Content format

The `content` field of each stored resource is a Turtle-format RDF
serialization of the entity's triples. Type assertions (`rdf:type`) are
sorted first for consistent downstream processing:

```turtle
<https://acme.example/people/jane-doe> a schema:Person ;
    schema:name "Jane Doe" ;
    schema:worksFor <https://acme.example/orgs/acme-hq> .
```

This content is what the graph processor reads when building the graph index,
and what the vector processor reads when generating embeddings.

## Customize HTML processing

`fit-process-resources` covers the common path. When you need to drive the
extraction yourself -- ingesting from a different source, applying custom
grouping, or skolemizing on your own schedule -- two classes are exported as
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

`parseHTML` returns one entry per main schema.org entity, each carrying its
`iri` and deduplicated `quads`. `quadsToRdf` serializes quads to Turtle (type
assertions first); `rdfToQuads` parses Turtle back into quads; `unionQuads`
merges two quad arrays with RDF union semantics.

The `Skolemizer` replaces blank nodes with content-hashed `urn:skolem:` URIs so
the same entity gets the same identifier across documents:

```js
const skolemizer = new Skolemizer();
const stableQuads = skolemizer.skolemize(quadsWithBlankNodes);
```

Because the hash is derived from each blank node's own triples, re-running the
skolemizer on the same content produces the same URIs -- the property that makes
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

The graph answers "which entities match?" and the resource index answers "what
do those entities contain?" -- each library owns one step.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../query-graph -->

</div>
