---
title: Search Semantically
description: Find related content by meaning instead of by keyword. A vector index returns ranked results, and you deploy no vector database.
---

You need to find resources related to a query by meaning. An exact keyword
match does not do this. You do not need the overhead of a vector database for a
few hundred embeddings. `@forwardimpact/libvector` keeps the index in a JSONL
file. It loads the index into memory on first access. It scores queries with
dot-product similarity. `fit-rag search` wraps this into a single CLI command.

For the full workflow that builds an embedding pipeline from knowledge sources,
see [Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 22+
- `@forwardimpact/libvector` installed:

```sh
npm install @forwardimpact/libvector
```

- A populated vector index under `data/vectors/` (`fit-process vectors`
  produces it during the ingestion pipeline)
- For the CLI: an embedding endpoint reachable at the configured base URL, and
  a valid API token

## Search from the command line

`fit-rag search` embeds your query string, scores it against the index, and
prints ranked results:

```sh
npx fit-rag search "career progression for senior engineers"
```

```text
common.Message.a1b2c3	0.8742
common.Message.d4e5f6	0.8301
common.Message.g7h8i9	0.7856
common.Message.j0k1l2	0.7203
common.Message.m3n4o5	0.6991
```

Each line is a tab-separated pair: the resource identifier and its similarity
score. The command sorts results by score, highest first. The default limit is
10.

You can resolve the returned identifiers to full context chunks through
`@forwardimpact/libresource`. See
[Resolve a Resource](/docs/libraries/ground-agents/resolve-resource/).

## Search programmatically

For finer control over thresholds and filters, use `VectorIndex` directly:

```js
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";

const storage = createStorage("vectors");
const vectorIndex = new VectorIndex(storage);
```

### Embed the query

`VectorIndex` works with pre-computed embedding vectors. It does not accept raw
text. Embed your query with whatever embedding client your pipeline uses:

```js
async function embed(texts, client) {
  const response = await client.createEmbeddings(texts);
  return response.data.map((d) => d.embedding);
}

const queryVectors = await embed(["career progression"], embeddingClient);
```

### Score against the index

Pass the query vectors and an optional filter to `queryItems`:

```js
const results = await vectorIndex.queryItems(queryVectors, {
  threshold: 0.5,
  limit: 10,
});

for (const id of results) {
  console.log(`${String(id)}\t${id.score.toFixed(4)}`);
}
```

```text
common.Message.a1b2c3	0.8742
common.Message.d4e5f6	0.8301
common.Message.g7h8i9	0.7856
```

### Filter options

| Filter       | Default | Effect                                                      |
| ------------ | ------- | ----------------------------------------------------------- |
| `threshold`  | 0       | Minimum similarity score to include in results              |
| `limit`      | 0 (all) | Maximum number of results                                   |
| `prefix`     | none    | Only include identifiers that start with this string        |
| `max_tokens` | none    | Stop once the cumulative token count exceeds the budget     |

Filters apply in order: prefix, then score and threshold, then limit, then
token budget.

#### Choose a threshold

The score is a dot product. Standard embedding APIs produce normalized vectors.
For those vectors, the dot product is cosine similarity, so the score lands on
a **0-to-1 scale**. `1.0` is an identical direction (a near-perfect match).
`0.0` is orthogonal (unrelated). A `threshold` of `0` is the default, and it
returns every item the limit allows. Raise it toward `0.5`-`0.7` to drop weak
matches. A higher threshold keeps only results that mean roughly the same thing
as the query. The code enforces no upper bound. For normalized vectors, values
above `1.0` exclude everything.

### Multiple query vectors

Pass several query vectors at once to broaden a search across phrasings or
related concepts. The index scores each stored item against **every** query
vector. It keeps only that item's **highest** score. An item that matches any
one of your phrasings ranks by its best match. It does not rank by its average:

```js
const vectors = await embed(
  ["career progression", "senior engineer expectations"],
  embeddingClient,
);
const results = await vectorIndex.queryItems(vectors, { limit: 5 });
```

Each item still appears at most once in the results. Its rank comes from its
best score across the query set. This keep-highest pass means one call covers
several related queries. You do not de-duplicate or merge result lists
yourself. The index compares the `threshold` against each item's best score, so
an item survives if any one query vector clears the bar.

## Add embeddings to the index

Add a single embedding with `VectorIndex.add`:

```js
import { resource } from "@forwardimpact/libtype";

const identifier = new resource.Identifier({
  type: "common.Message",
  name: "x1y2z3",
  parent: "",
});
identifier.tokens = 35;

const vector = [0.012, -0.034, 0.056, /* ... 1536 dimensions ... */];
await vectorIndex.add(identifier, vector);
```

For bulk ingestion, use `fit-process vectors` instead. The processor reads all
resources from `data/resources/`. It skips entries already present in the
index. It embeds the rest in batches and appends the results:

```sh
npx fit-process vectors
```

## How the index scores

`VectorIndex` computes the dot product of the query vector and each stored
vector. For normalized vectors (which standard embedding APIs produce), the dot
product equals cosine similarity. A score of 1.0 means identical direction. A
score of 0.0 means orthogonal. The implementation unrolls loops for
performance. A score pass over 1000 items with 1536-dimension embeddings takes
under 10 milliseconds.

The library exports the `calculateDotProduct` function separately for direct
use:

```js
import { calculateDotProduct } from "@forwardimpact/libvector";

const score = calculateDotProduct([0.1, 0.2, 0.3], [0.4, 0.5, 0.6], 3);
console.log(score.toFixed(4));  // 0.3200
```

## Typical retrieval flow

Embed the query. Score the index. Then resolve the top results through the
resource index:

```js
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { createResourceIndex } from "@forwardimpact/libresource";

const vectorIndex = new VectorIndex(createStorage("vectors"));
const resources = createResourceIndex("resources");

const queryVectors = await embed(["incident management"], client);
const ranked = await vectorIndex.queryItems(queryVectors, {
  threshold: 0.6, limit: 5,
});
const chunks = await resources.get(ranked.map(String));
```

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../query-graph -->

</div>
