---
title: Embed a Batch of Strings in One Call
description: Send a batch of input strings to the embedding service and read back vectors in order — one gRPC call, no per-input HTTP overhead.
---

You have a list of strings to embed -- documents to index, queries to compare,
passages to cluster -- and you want one gRPC call to return one vector per
input, in order, without writing per-string fetch loops or queueing logic.
This page walks through the bounded task of sending a batch and reading the
response, so callers can focus on what to do with the vectors instead of how
to fetch them.

For the full setup including architecture and connection details, see
[Embed Text Using a Shared Service](/docs/services/embed-text/).

## Prerequisites

- Completed the
  [Embed Text Using a Shared Service](/docs/services/embed-text/) guide --
  you have `@forwardimpact/librpc` and `@forwardimpact/libtype` installed,
  the embedding service is running, and `createClient("embedding")` connects
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

The response preserves order. `result.data[i]` corresponds to `inputs[i]`,
so you can zip them back together without tracking IDs:

```js
const pairs = inputs.map((text, i) => ({
  text,
  vector: result.data[i].values,
}));
```

## Why batch in one call

The service issues one HTTP request to the TEI sidecar per gRPC call,
regardless of input length. Calling `CreateEmbeddings` once with 50 strings
is faster than calling it 50 times with one string each -- you avoid the
per-call gRPC round trip and the per-request TEI overhead. The TEI backend
batches internally on the inference side as well.

Practical batch-size guidance:

- For typical short text (titles, queries, log lines), batches of 32-128
  strings move smoothly through the default `bge-small-en-v1.5` model on a
  CPU host.
- For long documents, split into smaller batches first; TEI imposes a
  per-request token limit that the default model enforces at 512 tokens.
- For online queries that need low tail latency, send one input at a time
  even though batching would be more throughput-efficient -- the round-trip
  cost is small at single-input size.

## Handle a partial failure

The TEI backend either returns all vectors or fails the entire request. If
the call throws, none of the vectors are usable and the request needs to be
retried (or split if a specific input is the cause).

```js
try {
  const result = await embeddingClient.CreateEmbeddings(request);
  return result.data;
} catch (err) {
  // Whole batch failed. Retry or split inputs to isolate the offending one.
  throw err;
}
```

The service does not attempt to recover by re-running individual inputs;
that policy belongs in the caller because it depends on the feature using
the embeddings.

## Verify

You have reached the outcome of this guide when:

- A single `CreateEmbeddings` call returns one `EmbeddingVector` per input
  in the request array, in the same order.
- Batches in the 32-128 range complete in a single gRPC round trip without
  client-side queuing.
- A whole-batch failure surfaces as a thrown error, not as partial data.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
