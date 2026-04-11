---
name: libs-data-persistence
description: >
  Data persistence and retrieval. libstorage provides multi-backend file storage
  (local, S3, Supabase). libindex provides JSONL-backed indexes. libresource
  adds typed resources with authorization. libpolicy evaluates access control.
  libgraph stores RDF triples. libvector stores embeddings for similarity
  search. Use when persisting, querying, or securing data.
---

# Data Persistence

## When to Use

- Storing files or structured data to filesystem or cloud storage
- Building searchable collections with filtering and JSONL indexes
- Managing typed resources with access control policies
- Querying knowledge graphs with RDF triple patterns
- Implementing semantic search with vector embeddings

## Libraries

| Library     | Main API                                     | Purpose                                          |
| ----------- | -------------------------------------------- | ------------------------------------------------ |
| libstorage  | `createStorage`, `parseJsonl`                | Multi-backend file storage (local, S3, Supabase) |
| libindex    | `Index`, `BufferedIndex`                     | JSONL storage with filtering                     |
| libresource | `ResourceIndex`, `createResourceIndex`       | Typed resources with authorization               |
| libpolicy   | `PolicyIndex`, `createPolicyIndex`           | Access control policy evaluation                 |
| libgraph    | `GraphIndex`, `createGraphIndex`, `PREFIXES` | RDF triple storage and pattern queries           |
| libvector   | `VectorIndex`, `VectorProcessor`             | Embedding storage and cosine similarity search   |

## Decision Guide

- **libstorage vs libindex** — `createStorage` for raw file operations
  (get/put/list/delete). `Index` for structured records stored as JSONL with
  filtering logic.
- **libindex vs libresource** — `Index` for simple JSONL collections where you
  control the schema. `ResourceIndex` for typed entities that need access
  control and policy evaluation.
- **libgraph vs libvector** — `GraphIndex` for relationship queries (who reports
  to whom, what skills belong to a capability). `VectorIndex` for semantic
  similarity (find documents matching a query by embedding distance).
- **libpolicy** — always used through `ResourceIndex`, rarely accessed directly.
  Only use `PolicyIndex` directly when building custom authorization flows
  outside the resource system.
- **BufferedIndex** — use instead of `Index` for high-volume write workloads
  that benefit from periodic flushing.

## Composition Recipes

### Recipe 1: Store and retrieve typed resources

```javascript
import { createStorage } from "@forwardimpact/libstorage";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createPolicyIndex } from "@forwardimpact/libpolicy";

const storage = createStorage(config);
const policyIndex = await createPolicyIndex(storage);
const resourceIndex = await createResourceIndex(storage, policyIndex);

await resourceIndex.save(resource);
const result = await resourceIndex.get("conversation:abc123", actor);
```

### Recipe 2: Build a knowledge graph

```javascript
import { createStorage } from "@forwardimpact/libstorage";
import { createGraphIndex, PREFIXES } from "@forwardimpact/libgraph";

const storage = createStorage(config);
const graphIndex = await createGraphIndex(storage, "knowledge");

await graphIndex.addTriple(subject, predicate, object);
const results = await graphIndex.query(
  `${PREFIXES.schema}Person`,
  `${PREFIXES.schema}name`,
  "?",
);
```

### Recipe 3: Semantic search pipeline

```javascript
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex, VectorProcessor } from "@forwardimpact/libvector";
import { createResourceIndex } from "@forwardimpact/libresource";

const storage = createStorage(config);
const vectorIndex = new VectorIndex(storage, "content");
const resourceIndex = await createResourceIndex(storage, policyIndex);
const processor = new VectorProcessor(vectorIndex, resourceIndex, llmClient, logger);

await processor.index(documents);
const results = await vectorIndex.search(queryVector, {
  limit: 10,
  threshold: 0.7,
  filter: { type: "document" },
});
```

## DI Wiring

### libstorage

```javascript
// createStorage — factory, returns backend based on config
const storage = createStorage(config);

// JSONL utilities — pure functions, no DI
import { parseJsonl, serializeJsonl } from "@forwardimpact/libstorage";
```

### libindex

```javascript
// Index — accepts storage and prefix
class UserIndex extends Index {
  constructor(storage) {
    super(storage, "users");
  }
}

// BufferedIndex — accepts storage, prefix, and options
const index = new BufferedIndex(storage, "logs", { flushInterval: 5000 });
```

### libresource

```javascript
// ResourceIndex — factory accepts storage and policyIndex
const index = await createResourceIndex(storage, policyIndex);

// toResourceId — pure function
import { toResourceId } from "@forwardimpact/libresource";
const id = toResourceId("conversation:abc123");
```

### libpolicy

```javascript
// PolicyIndex — factory accepts storage
const index = await createPolicyIndex(storage);
```

### libgraph

```javascript
// GraphIndex — factory accepts storage and prefix
const index = await createGraphIndex(storage, "knowledge");
```

### libvector

```javascript
// VectorIndex — accepts storage and prefix
const index = new VectorIndex(storage, "content");

// VectorProcessor — accepts vectorIndex, resourceIndex, llmClient, logger
const processor = new VectorProcessor(vectorIndex, resourceIndex, llmClient, logger);
```
