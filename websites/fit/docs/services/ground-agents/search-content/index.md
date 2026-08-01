---
title: Search for Related Content from a Product
description: Find semantically related content from any product — shared vector service, no embeddings storage to manage.
---

You need to find content related to a natural-language query from within a
product. The search works on meaning. It does not work on keywords. The vector
service holds the embedding index in memory. It manages the embedding endpoint
connection. It exposes a single RPC: `SearchContent`. Your product sends text.
The service returns ranked resource identifiers. The product makes no embedding
API calls. It stores no vectors. It does not score results.

For the full setup, see
[Ground Agents in Context](/docs/services/ground-agents/). That guide shows how
to connect to both the graph and vector services.

## Prerequisites

- You completed the
  [Ground Agents in Context](/docs/services/ground-agents/) guide. You
  installed `@forwardimpact/librpc` and `@forwardimpact/libtype`. The vector
  service runs. `createClient("vector")` connects successfully.
- A populated vector index at `data/vectors/index.jsonl`.

## Connect

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { vector } from "@forwardimpact/libtype";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");
const vectorClient = await createClient("vector", logger, tracer);
```

## Search with a single query

Pass one or more text strings to `SearchContent`. The service embeds each
string. It scores those vectors against the index with dot-product similarity.
It then returns the ranked resource identifiers:

```js
const query = vector.TextQuery.fromObject({
  input: ["career progression for senior engineers"],
});

const result = await vectorClient.SearchContent(query);
console.log("Results:", result.identifiers?.length ?? 0);

for (const id of result.identifiers ?? []) {
  console.log(String(id));
}
```

Expected output (identifiers depend on your knowledge base):

```text
Results: 5
common.Message.a1b2c3d4
common.Message.e5f6g7h8
common.Message.i9j0k1l2
common.Message.m3n4o5p6
common.Message.q7r8s9t0
```

The service sorts identifiers by similarity score descending. The default limit
returns all matches above the threshold.

## Search with multiple queries

Pass several strings to score against the index in a single call. The service
embeds each string and keeps the highest score per item across all queries:

```js
const query = vector.TextQuery.fromObject({
  input: [
    "incident management",
    "on-call rotation",
  ],
});

const result = await vectorClient.SearchContent(query);
console.log("Results:", result.identifiers?.length ?? 0);
```

This avoids multiple round trips when the search intent spans several phrasings.

## Apply filters

Constrain results with the optional `filter` field:

```js
const query = vector.TextQuery.fromObject({
  input: ["architecture design patterns"],
  filter: {
    limit: "3",
    threshold: "0.6",
    prefix: "common.Message",
  },
});

const result = await vectorClient.SearchContent(query);
console.log("Top 3 results above 0.6 threshold:");

for (const id of result.identifiers ?? []) {
  console.log(String(id));
}
```

Expected output:

```text
Top 3 results above 0.6 threshold:
common.Message.a1b2c3d4
common.Message.e5f6g7h8
common.Message.i9j0k1l2
```

Available filter fields:

| Field        | Effect                                                      |
| ------------ | ----------------------------------------------------------- |
| `prefix`     | Only return identifiers starting with this string           |
| `limit`      | Cap the number of results                                   |
| `threshold`  | Minimum similarity score to include                         |
| `max_tokens` | Stop results when they exceed the token budget              |

All filter values are strings in the protobuf definition. The service parses
them internally. The service applies filters in this order: prefix, then score
and threshold, then limit, then token budget.

## Resolve identifiers to content

The service returns identifiers. It does not return content. Resolve them
through `libresource`:

```js
import { createResourceIndex } from "@forwardimpact/libresource";

const resources = createResourceIndex("resources");
const ids = result.identifiers.map((id) => String(id));
const items = await resources.get(ids);

for (const item of items) {
  console.log(`--- ${item.id.type}.${item.id.name} ---`);
  console.log(item.content.substring(0, 150));
  console.log();
}
```

This two-step pattern keeps the vector service stateless. The service scores
and ranks. The product that calls it resolves as much content as it needs.

## Verify

You reach the outcome of this guide when:

- `SearchContent` with a single input string returns ranked resource
  identifiers.
- Multiple input strings return results that the service scores against all
  queries.
- A `filter` with `limit` and `threshold` constrains the result set.
- `libresource` resolves the returned identifiers to the expected content.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../query-graph -->

</div>
