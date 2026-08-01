---
title: Vector Processing Internals
description: "Embedding pipeline — TEI installation, native and supervised operation, batch processing, index format, and query-time architecture."
---

## Pipeline

The vector pipeline converts knowledge resources into embeddings for semantic
search. Guide's `SearchContent` tool queries these embeddings at runtime.

```text
data/resources/*.json  ──>  TEI (BAAI/bge-small-en-v1.5)  ──>  data/vectors/index.jsonl
                                                                       │
                                                            services/vector (gRPC)
                                                                       │
                                                              Guide SearchContent
```

Two separate concerns use TEI:

| Concern             | When                  | Who calls TEI                                  |
| ------------------- | --------------------- | ---------------------------------------------- |
| **Batch indexing**  | `fit-process vectors` | CLI → embedding service (gRPC) → TEI           |
| **Query embedding** | Runtime search        | vector service → embedding service (gRPC) → TEI |

Both go through the embedding service (`SERVICE_EMBEDDING_URL`), which proxies
to TEI internally. The gRPC framework handles authentication.

---

## TEI (Text Embeddings Inference)

TEI is a Rust binary from HuggingFace that serves embedding models over HTTP.
TEI must run before batch processing or query-time search works.

### Installation

Install it once with Cargo:

```sh
just tei-install
```

Or manually:

```sh
cargo install --git https://github.com/huggingface/text-embeddings-inference \
  --features candle text-embeddings-router
```

The first startup downloads the `BAAI/bge-small-en-v1.5` model (~130 MB) to
`~/.cache/huggingface/`.

### Running Under fit-rc

The embedding service wraps TEI. It starts a gRPC server and spawns
`text-embeddings-router` as a managed child process. Add the service entry to
`config/config.json` under `init.services`:

```json
{
  "name": "embedding",
  "command": "node -e \"import('@forwardimpact/svcembedding/server.js')\"",
  "optional": true
}
```

Then start it with fit-rc:

```sh
just tei-start                     # or: bunx fit-rc start embedding
bunx fit-rc status embedding       # Check status
bunx fit-rc stop embedding         # Stop
```

The config marks the service `optional`. So fit-rc skips it with a warning when
`text-embeddings-router` is not installed.

The gRPC server listens on `SERVICE_EMBEDDING_URL` (default
`grpc://localhost:3015`). TEI runs on an internal backend port (default 8090).
Set that port with `SERVICE_EMBEDDING_BACKEND_PORT`.

### Docker

`docker-compose.yml` defines a `tei` container that uses the HuggingFace CPU
image. It listens on port 8080 inside the Docker network (`tei.local:8080`).
Only other containers can reach it. Use this for containerized deployments. Do
not use it for local development.

### Health Check

```sh
curl http://localhost:8090/health
```

The endpoint returns 200 when TEI is ready to serve requests.

---

## Batch Processing

Resources must exist before `fit-process` can generate vectors. The full
processing chain is:

```sh
just process                   # export-standard → process-resources → process-graphs → process-vectors
```

To process only vectors (when resources already exist):

```sh
just process-vectors
# or directly:
bunx fit-process vectors
```

Without TEI, use `just process-fast` to skip the vector step.

### Processing Steps

1. Load all resource identifiers from `data/resources/`.
2. Filter out conversations (`common.Conversation.*`) and tool functions
   (`tool.ToolFunction.*`).
3. Skip resources already present in the vector index (incremental).
4. Batch remaining resources and POST to TEI `/v1/embeddings`.
5. Write each embedding to `data/vectors/index.jsonl`.

---

## Index Format

Each line in `data/vectors/index.jsonl` is a self-contained JSON record:

```json
{
  "id": "common.Message.a4663ad1",
  "identifier": {
    "type": "common.Message",
    "name": "a4663ad1",
    "parent": "",
    "subjects": ["https://example.com/id/person/alice"],
    "tokens": 120
  },
  "vector": [-0.048, -0.039, ...]
}
```

- **Dimensions:** 384 (bge-small-en-v1.5)
- **Normalization:** Pre-normalized, so cosine similarity reduces to dot product
- **Search:** `VectorIndex.queryItems()` computes dot products with SIMD-style
  loop unrolling, filters by prefix and token budget, and returns ranked
  identifiers

---

## Components

| Component             | Location                             | Role                                                 |
| --------------------- | ------------------------------------ | ---------------------------------------------------- |
| `VectorProcessor`     | `libraries/libvector/src/processor/` | Batch embedding pipeline (extends `ProcessorBase`)   |
| `VectorIndex`         | `libraries/libvector/src/index/`     | JSONL-backed index with dot-product search           |
| `fit-process vectors` | `libraries/librag/src/commands/`           | CLI for batch processing                             |
| `fit-rag search`          | `libraries/librag/src/commands/`           | CLI for ad-hoc similarity search                     |
| vector service        | `services/vector/`                   | gRPC service that loads the index and serves queries |

---

## Troubleshooting

**TEI not reachable** — Check `curl http://localhost:8090/health`. Verify that
the embedding service runs (`bunx fit-rc status embedding`).

**No resources to process** — Run `just process-resources` first. The vector
processor reads from `data/resources/`.

**Empty vector index** — The processor skips resources with empty or null
content. Verify `data/resources/` contains files with non-empty content fields.

**Model download stalls** — The first TEI startup downloads the model from
HuggingFace. Check network access and `~/.cache/huggingface/` for partial
downloads.

## What's next

<div class="grid">

<!-- part:card:../../libraries/ground-agents -->

</div>
