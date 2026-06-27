---
title: Search Semantically
description: Find related content by meaning, not keywords — ranked results from a vector index without standing up a vector database.
---

You need to find resources related to a query by meaning, not by exact keyword
match. Standing up a vector database for a few hundred embeddings is overhead
you do not need. `@forwardimpact/libvector` keeps the index in a JSONL file,
loads it into memory on first access, and scores queries using dot-product
similarity. `fit-search` wraps this into a single CLI command.

For the full workflow of building an embedding pipeline from knowledge sources,
see [Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 18+
- `@forwardimpact/libvector` installed:

```sh
npm install @forwardimpact/libvector
```

- A populated vector index under `data/vectors/` (produced by
  `fit-process-vectors` during the ingestion pipeline)
- For the CLI: an embedding endpoint reachable at the configured base URL, and
  a valid API token

## Search from the command line

`fit-search` embeds your query string, scores it against the index, and prints
ranked results:

```sh
npx fit-search "career progression for senior engineers"
```

```text
common.Message.a1b2c3	0.8742
common.Message.d4e5f6	0.8301
common.Message.g7h8i9	0.7856
common.Message.j0k1l2	0.7203
common.Message.m3n4o5	0.6991
```

Each line is a tab-separated pair: the resource identifier and its similarity
score. Results are sorted by score descending. The default limit is 10.

The returned identifiers can be resolved to full context chunks through
`@forwardimpact/libresource` -- see
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

`VectorIndex` works with pre-computed embedding vectors, not raw text. Embed
your query using whatever embedding client your pipeline uses:

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
| `prefix`     | none    | Only include identifiers starting with this string          |
| `max_tokens` | none    | Stop accumulating results when the token budget is exceeded |

Filters apply in order: prefix, then scoring and threshold, then limit, then
token budget.

#### Choosing a threshold

The score is a dot product. For the normalized vectors that standard embedding
APIs produce, that dot product is cosine similarity, so the score lands on a
**0-to-1 scale**: `1.0` is an identical direction (a near-perfect match) and
`0.0` is orthogonal (unrelated). A `threshold` of `0` -- the default -- returns
every item the limit allows; raise it toward `0.5`-`0.7` to drop weak matches
and keep only results that mean roughly the same thing as the query. There is no
upper bound enforced, but values above `1.0` will exclude everything for
normalized vectors.

### Multiple query vectors

Pass several query vectors at once to broaden a search across phrasings or
related concepts. The index scores each stored item against **every** query
vector and keeps only that item's **highest** score -- so an item that matches
any one of your phrasings ranks by its best match, not its average:

```js
const vectors = await embed(
  ["career progression", "senior engineer expectations"],
  embeddingClient,
);
const results = await vectorIndex.queryItems(vectors, { limit: 5 });
```

Each item still appears at most once in the results, ranked by its best score
across the query set. This keep-highest pass means one call covers several
related queries without de-duplicating or merging result lists yourself. The
`threshold` is compared against each item's best score, so an item survives if
any one query vector clears the bar.

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

For bulk ingestion, use `fit-process-vectors` instead. The processor reads all
resources from `data/resources/`, skips entries already present in the index,
embeds the rest in batches, and appends the results:

```sh
npx fit-process-vectors
```

## How scoring works

`VectorIndex` computes the dot product of the query vector and each stored
vector. For normalized vectors (which standard embedding APIs produce), the dot
product equals cosine similarity -- 1.0 means identical direction, 0.0 means
orthogonal. The implementation uses loop unrolling for performance; scoring
1000 items with 1536-dimension embeddings takes under 10 milliseconds.

The `calculateDotProduct` function is exported separately for direct use:

```js
import { calculateDotProduct } from "@forwardimpact/libvector";

const score = calculateDotProduct([0.1, 0.2, 0.3], [0.4, 0.5, 0.6], 3);
console.log(score.toFixed(4));  // 0.3200
```

## Typical retrieval flow

Embed the query, score the index, then resolve the top results through the
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
