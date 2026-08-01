---
title: Embed a Batch of Strings in One Call
description: Send a batch of input strings to the embedding service and read back vectors in order with one gRPC call and no per-input HTTP overhead.
---

You have a list of strings to embed. They can be documents to index,
queries to compare, or passages to cluster. You want one gRPC call to return
one vector per input, in order. You do not want to write per-string fetch
loops or queue logic. This page walks through the bounded task. You send a
batch and you read the response. Callers can then focus on what to do with
the vectors. They do not need to think about how to fetch them.

For the full setup with architecture and connection details, see
[Embed Text Using a Shared Service](/docs/services/embed-text/).

## Prerequisites

- Complete the
  [Embed Text Using a Shared Service](/docs/services/embed-text/) guide.
  You installed `@forwardimpact/librpc` and `@forwardimpact/libtype`. The
  embedding service runs. `createClient("embedding")` connects
  successfully.

## Connect

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { embedding } from "@forwardimpact/libtype";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");
const embeddingClient = await createClient("embedding", logger, tracer);
```

## Embed a batch

Pass every input in a single `EmbeddingsRequest`:

```js
const inputs = [
  "Reset the database connection pool on each restart.",
  "Pool restarts force every active query to reissue.",
  "Coffee beans roast best at 215 degrees Celsius.",
];

const request = embedding.EmbeddingsRequest.fromObject({ input: inputs });
const result = await embeddingClient.CreateEmbeddings(request);
```

The response preserves order. `result.data[i]` corresponds to `inputs[i]`.
You can zip them back together, and you do not need to track IDs:

```js
const pairs = inputs.map((text, i) => ({
  text,
  vector: result.data[i].values,
}));
```

## Why batch in one call

The service issues one HTTP request to the TEI sidecar per gRPC call,
regardless of input length. One call to `CreateEmbeddings` with 50 strings
is faster than 50 calls with one string each. You avoid the per-call gRPC
round trip and the per-request TEI overhead. The TEI backend also batches
internally on the inference side.

Practical batch-size guidance:

- For typical short text (titles, queries, log lines), batches of 32-128
  strings move smoothly through the default `bge-small-en-v1.5` model on a
  CPU host.
- For long documents, split into smaller batches first. TEI imposes a
  per-request token limit. The default model enforces that limit at 512
  tokens.
- For online queries that need low tail latency, send one input at a time,
  even though a batch would be more throughput-efficient. The round-trip
  cost is small at single-input size.

## Handle a partial failure

The TEI backend either returns all vectors or fails the entire request. If
the call throws, none of the vectors are usable. Retry the request. Split
it if a specific input is the cause.

```js
try {
  const result = await embeddingClient.CreateEmbeddings(request);
  return result.data;
} catch (err) {
  // Whole batch failed. Retry or split inputs to isolate the offending one.
  throw err;
}
```

The service does not try to recover. It does not re-run individual inputs.
That policy belongs in the caller, because it depends on the feature that
uses the embeddings.

## Verify

You have reached the outcome of this guide when:

- A single `CreateEmbeddings` call returns one `EmbeddingVector` per input
  in the request array, in the same order.
- Batches in the 32-128 range complete in a single gRPC round trip and
  need no client-side queue.
- A whole-batch failure surfaces as a thrown error. It does not surface as
  partial data.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
