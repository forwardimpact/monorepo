---
title: Embed Text Using a Shared Service
description: Products that fetch embeddings without managing inference infrastructure — shared embedding gRPC service backed by Text Embeddings Inference.
---

You are building a product feature that needs semantic vectors -- search,
deduplication, clustering, retrieval-augmented generation -- and you do not
want each product running its own inference backend. The embedding gRPC
service exposes one method: pass an array of strings, receive an array of
dense vectors, in order. The inference model runs in a sidecar process the
service starts on boot; products see only the typed gRPC surface.

This guide walks through connecting to the embedding service, calling its one
RPC with a batch of inputs, and verifying the response shape matches what your
feature expects.

## Prerequisites

- Node.js 18+
- Generated client code available (run `npx fit-codegen --all` if not)
- Services running (`npx fit-rc start`)

Install the transport and type packages:

```sh
npm install @forwardimpact/librpc @forwardimpact/libtype
```

## Architecture overview

The embedding service is a thin gRPC adapter over a
[Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference)
(TEI) backend that runs as a sidecar process. On boot, the service spawns
`text-embeddings-router` with a configured model (default
`BAAI/bge-small-en-v1.5`) listening on a local port; the service translates
each gRPC request into a single HTTP call to TEI's OpenAI-compatible
`/v1/embeddings` endpoint and translates the response back into the proto
shape.

```text
Product A ──┐                                    ┌── BAAI/bge-small-en-v1.5
            ├── gRPC ── embedding ── HTTP/JSON ──┤
Product B ──┘                                    └── (or other TEI model)
```

The service exposes one RPC:

| RPC                | Purpose                                       | Request type                     |
| ------------------ | --------------------------------------------- | -------------------------------- |
| `CreateEmbeddings` | Embed one or more strings in a single call    | `embedding.EmbeddingsRequest`    |

The response is `embedding.EmbeddingsResponse` with one `EmbeddingVector` per
input string, in the same order.

## Connect to the embedding service

Create an embedding client using the generated `EmbeddingClient` class:

```js
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("my-product");
const tracer = await createTracer("my-product");

const embeddingClient = await createClient("embedding", logger, tracer);
```

`createClient("embedding")` resolves the host and port from
`config/config.json`, creates an `EmbeddingClient` instance, and establishes
the gRPC channel with automatic retry.

## Embed one or more strings

Call `CreateEmbeddings` with an array of input strings:

```js
import { embedding } from "@forwardimpact/libtype";

const request = embedding.EmbeddingsRequest.fromObject({
  input: [
    "the quick brown fox jumps over the lazy dog",
    "a fast auburn vulpine vaults a sluggish canine",
  ],
});

const result = await embeddingClient.CreateEmbeddings(request);
console.log(result.data.length); // 2
console.log(result.data[0].values.length); // depends on model
```

`result.data` is an array of `EmbeddingVector` objects in the same order as
the input. Each `EmbeddingVector` has a `values` field containing the dense
embedding as a `Float32`-compatible array of numbers.

The vector dimensionality depends on the model the service was configured
with. The default model (`BAAI/bge-small-en-v1.5`) emits 384-dimensional
vectors; check the model card for the configured model if you need a fixed
shape.

## Compare two strings

Embedding vectors are usually consumed by computing cosine similarity against
other embeddings:

```js
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const [a, b] = result.data.map((v) => v.values);
console.log(cosineSimilarity(a, b)); // ~0.7 for paraphrases, ~0.1 for unrelated
```

For storage and similarity search at scale, hand the vectors to the
[vector service](/docs/services/ground-agents/) rather than computing
cosine similarity in-process.

## Handle backend failures

If the TEI sidecar process is unhealthy or unreachable, `CreateEmbeddings`
throws an error whose message includes the HTTP status code from the
backend:

```js
try {
  await embeddingClient.CreateEmbeddings(request);
} catch (err) {
  console.error(err.message);
  // "TEI request failed: 503"
}
```

When the service starts but the sidecar fails, the service process exits.
Restart with `npx fit-rc restart embedding` to relaunch both.

## Verify

You have reached the outcome of this guide when:

- `createClient("embedding")` connects without error.
- `CreateEmbeddings` returns one `EmbeddingVector` per input string, in
  order.
- Each `values` array has the expected dimensionality for the configured
  model.
- Errors from the TEI sidecar surface as exceptions on the client, not
  silent empty responses.

If the connection fails, confirm the service is running with
`npx fit-rc status` and check that `config/config.json` lists the correct
host and port for the embedding service.

## What's next

<div class="grid">

<!-- part:card:embed-batch -->

</div>
