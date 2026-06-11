---
title: Traverse Knowledge and Search Semantically
description: Products that query relationships and search content without per-product stores — shared graph and vector gRPC services.
---

You are building a product feature that needs relationship traversal or semantic
search, and you do not want each product to stand up its own graph database or
vector store. Two gRPC services -- `graph` and `vector` -- provide those
capabilities to any product through a shared backend. Connect once with the
generated client code from `npx fit-codegen --all`, and every product in the
monorepo can query relationships and search content through the same typed
interface.

This guide walks through connecting to both services, running a representative
call against each, and verifying the responses match what the underlying indexes
contain. By the end, your product will have a working connection to both
services, and you will understand the request/response shape well enough to
build features on top of them.

## Prerequisites

- Node.js 18+
- Generated client code available (run `npx fit-codegen --all` if not)
- Services running (`npx fit-rc start`)
- A populated knowledge base: `data/graphs/index.jsonl` for the graph service,
  `data/vectors/index.jsonl` for the vector service. If you have not built these
  yet, see the
  [Ground Agents in Context](/docs/libraries/ground-agents/) library guide for
  the ingestion pipeline.

Install the transport and type packages:

```sh
npm install @forwardimpact/librpc @forwardimpact/libtype
```

## Architecture overview

Both services sit behind gRPC and expose typed RPC methods. Products never read
the JSONL index files directly -- they call the service, which holds the index
in memory and handles query execution. This separation means a single index
load serves all connected products, and individual products carry no index
management code.

```text
Product A ──┐                   ┌── data/graphs/index.jsonl
            ├── gRPC ── graph ──┤
Product B ──┘                   └── data/graphs/ontology.ttl

Product A ──┐                    ┌── data/vectors/index.jsonl
            ├── gRPC ── vector ──┤
Product B ──┘                    └── gRPC ── embedding ── inference backend
```

The graph service owns three RPCs:

| RPC              | Purpose                                         | Request type             |
| ---------------- | ----------------------------------------------- | ------------------------ |
| `QueryByPattern` | Match triples by subject, predicate, and object  | `graph.PatternQuery`     |
| `GetSubjects`    | List all entity URIs, optionally filtered by type| `graph.SubjectsQuery`    |
| `GetOntology`    | Return the SHACL ontology as Turtle RDF          | `common.Empty`           |

The vector service owns one RPC:

| RPC              | Purpose                                          | Request type          |
| ---------------- | ------------------------------------------------ | --------------------- |
| `SearchContent`  | Semantic similarity search over indexed content   | `vector.TextQuery`    |

Both return `tool.ToolCallResult`, which carries either a `content` string or
an `identifiers` array of resource identifiers.

## Connect to the graph service

Create a graph client using the generated `GraphClient` class. The client reads
its connection details from `config/config.json` automatically:

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");

const graphClient = await createClient("graph", logger, tracer);
```

`createClient("graph")` resolves the host and port from the service
configuration, creates a `GraphClient` instance, and establishes the gRPC
channel with automatic retry (up to 10 retries on transient errors, exponential
backoff starting at 1 second with jitter).

## Query the graph

Run a triple-pattern query to find all resources that contain a
`schema:worksFor` relationship:

```js
import { graph } from "@forwardimpact/libtype";

const query = graph.PatternQuery.fromObject({
  subject: "?",
  predicate: "schema:worksFor",
  object: "?",
});

const result = await graphClient.QueryByPattern(query);
console.log("Matched identifiers:", result.identifiers?.length ?? 0);
```

Expected output (numbers depend on your knowledge base):

```text
Matched identifiers: 3
```

The `?` wildcard matches any value in that position. To constrain a position,
pass a full URI or a prefixed name:

```js
const specific = graph.PatternQuery.fromObject({
  subject: "?",
  predicate: "schema:worksFor",
  object: "https://acme.example/org/engineering",
});

const result = await graphClient.QueryByPattern(specific);
```

### List subjects by type

To see every entity of a given RDF type:

```js
const subjectsQuery = graph.SubjectsQuery.fromObject({
  type: "schema:Person",
});

const result = await graphClient.GetSubjects(subjectsQuery);
console.log(result.content);
```

Expected output:

```text
https://acme.example/people/alice	https://schema.org/Person
https://acme.example/people/bob	https://schema.org/Person
```

### Read the ontology

The ontology describes all types and predicates observed in the graph. Agents
typically read this before writing queries to understand what relationships
exist:

```js
import { common } from "@forwardimpact/libtype";

const ontology = await graphClient.GetOntology(common.Empty.fromObject({}));
console.log(ontology.content.substring(0, 200));
```

The response is a Turtle RDF string containing SHACL shape definitions.

## Connect to the vector service

The vector service follows the same client pattern:

```js
const vectorClient = await createClient("vector", logger, tracer);
```

## Search for related content

Pass natural-language text to `SearchContent`. The service embeds the text
using its configured embedding endpoint, scores the vectors against the index,
and returns the ranked resource identifiers:

```js
import { vector } from "@forwardimpact/libtype";

const searchQuery = vector.TextQuery.fromObject({
  input: ["career progression for senior engineers"],
});

const result = await vectorClient.SearchContent(searchQuery);
console.log("Matched identifiers:", result.identifiers?.length ?? 0);

for (const id of result.identifiers ?? []) {
  console.log(String(id));
}
```

Expected output (identifiers depend on your knowledge base):

```text
Matched identifiers: 5
common.Message.a1b2c3d4
common.Message.e5f6g7h8
common.Message.i9j0k1l2
common.Message.m3n4o5p6
common.Message.q7r8s9t0
```

### Apply filters

Both services accept a `QueryFilter` on applicable RPCs. The filter constrains
results by prefix, count limit, or token budget:

```js
import { tool } from "@forwardimpact/libtype";

const filtered = vector.TextQuery.fromObject({
  input: ["incident management procedures"],
  filter: { limit: "3", prefix: "common.Message" },
});

const result = await vectorClient.SearchContent(filtered);
```

Available filter fields:

| Field        | Type   | Effect                                              |
| ------------ | ------ | --------------------------------------------------- |
| `prefix`     | string | Only return identifiers starting with this string   |
| `limit`      | string | Cap the number of results                           |
| `threshold`  | string | Minimum similarity score (vector only)              |
| `max_tokens` | string | Stop when cumulative token count exceeds this budget |

Filter values are strings in the protobuf definition. The service parses them
internally.

## Resolve identifiers to content

Both services return resource identifiers, not the content itself. To retrieve
the actual content chunks, resolve identifiers through `libresource`:

```js
import { createResourceIndex } from "@forwardimpact/libresource";

const resources = createResourceIndex("resources");
const ids = result.identifiers.map((id) => String(id));
const items = await resources.get(ids);

for (const item of items) {
  console.log(`--- ${item.id.type}.${item.id.name} ---`);
  console.log(item.content.substring(0, 100));
}
```

This two-step pattern (query the service, resolve the identifiers) keeps the
services stateless and the resource resolution local to the calling product.

## Verify

You have reached the outcome of this guide when:

- `createClient("graph")` connects without error and
  `graphClient.GetSubjects(...)` returns a content string with subject URIs.
- `createClient("vector")` connects without error and
  `vectorClient.SearchContent(...)` returns an identifiers array.
- You can apply a `QueryFilter` to constrain results by limit or prefix.
- You can resolve returned identifiers to content through `libresource`.

If any connection fails, confirm the services are running with
`npx fit-rc status` and check that `config/config.json` lists the correct host
and port for each service.

## What's next

<div class="grid">

<!-- part:card:query-graph -->
<!-- part:card:search-content -->

</div>
