---
name: libs-storage
description: >
  Use when persisting files or structured records to local, S3, or Supabase
  storage; reading or writing JSONL collections with filtering; storing typed
  resources behind access control; evaluating access policies; querying
  knowledge graphs with RDF triple patterns; indexing embeddings for semantic
  similarity search; parsing or serializing JSON and JSON Lines; locating
  resources by URI prefix or identifier.
---

# Storage

## When to Use

- Storing files or structured data to filesystem or cloud storage
- Building searchable collections with filtering and JSONL indexes
- Managing typed resources with access control policies
- Querying knowledge graphs with RDF triple patterns
- Implementing semantic search with vector embeddings

## Libraries

| Library     | Capabilities                                                                                           | Key Exports                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| libstorage  | Read or write files to local, S3, or Supabase backends; parse or serialize JSON and JSON Lines content | `createStorage`, `LocalStorage`, `S3Storage`, `fromJsonLines`, `toJsonLines`           |
| libindex    | Build JSONL-backed indexes with filtering, buffered writes, and prefix scans                           | `IndexBase`, `BufferedIndex`                                                           |
| libresource | Store and retrieve typed resources with identifier handling and access control via a policy engine     | `ResourceIndex`, `createResourceIndex`, `toType`, `toIdentifier`                       |
| libpolicy   | Evaluate access control policies against actor/resource tuples                                         | `Policy`, `createPolicy`                                                               |
| libgraph    | Store RDF triples and query knowledge graphs with subject/predicate/object patterns                    | `createGraphIndex`, `parseGraphQuery`, `isWildcard`, `RDF_PREFIXES`, `ShaclSerializer` |
| libvector   | Compute vector similarity; index embeddings for cosine similarity search via subpath entry points      | `calculateDotProduct`                                                                  |

## Decision Guide

- **libstorage vs libindex** — `createStorage` for raw file operations
  (get/put/list/delete). `IndexBase` for structured records stored as JSONL with
  filtering logic.
- **libindex vs libresource** — `IndexBase` for simple JSONL collections where
  you control the schema. `ResourceIndex` for typed entities that need access
  control and policy evaluation.
- **libgraph vs libvector** — `createGraphIndex` for relationship queries (who
  reports to whom, what skills belong to a capability). `VectorIndex` (imported
  from `@forwardimpact/libvector/index/vector.js`) for semantic similarity (find
  documents matching a query by embedding distance).
- **libpolicy** — usually used through `ResourceIndex`, rarely accessed
  directly. Only use `Policy`/`createPolicy` directly when building custom
  authorization flows outside the resource system.
- **BufferedIndex** — use instead of `IndexBase` for high-volume write workloads
  that benefit from periodic flushing.

## Composition Recipes

### Recipe 1: Store and retrieve typed resources

```javascript
import { createStorage } from "@forwardimpact/libstorage";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createPolicy } from "@forwardimpact/libpolicy";

const policy = createPolicy();
const resourceIndex = createResourceIndex("conversations", policy);

await resourceIndex.put(resource);
const results = await resourceIndex.get(["conversation:abc123"], actor);
```

### Recipe 2: Build a knowledge graph

```javascript
import { createGraphIndex, RDF_PREFIXES } from "@forwardimpact/libgraph";

const graphIndex = createGraphIndex("knowledge");

await graphIndex.addTriple(subject, predicate, object);
const results = await graphIndex.query(
  `${RDF_PREFIXES.schema}Person`,
  `${RDF_PREFIXES.schema}name`,
  "?",
);
```

### Recipe 3: Semantic search pipeline

```javascript
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { VectorProcessor } from "@forwardimpact/libvector/processor/vector.js";
import { createResourceIndex } from "@forwardimpact/libresource";

const storage = createStorage("content");
const vectorIndex = new VectorIndex(storage, "content");
const resourceIndex = createResourceIndex("content");
const processor = new VectorProcessor(
  vectorIndex,
  resourceIndex,
  llmClient,
  logger,
);

await processor.index(documents);
```

## DI Wiring

### libstorage

```javascript
// createStorage — factory, returns backend based on config and env
const storage = createStorage("bucket-name", "local");

// JSONL utilities — pure functions, no DI
import { fromJsonLines, toJsonLines } from "@forwardimpact/libstorage";
```

### libindex

```javascript
// IndexBase — accepts storage
class UserIndex extends IndexBase {
  constructor(storage) {
    super(storage, "users");
  }
}

// BufferedIndex — accepts storage and options
const index = new BufferedIndex(storage, "logs", { flushInterval: 5000 });
```

### libresource

```javascript
// ResourceIndex — factory accepts prefix and optional policy
const index = createResourceIndex("conversations");

// toIdentifier / toType — pure functions
import { toIdentifier, toType } from "@forwardimpact/libresource";
const id = toIdentifier("conversation/common.Message.abc123");
```

### libpolicy

```javascript
// createPolicy — factory, optional storage backend
const policy = createPolicy();
```

### libgraph

```javascript
// createGraphIndex — factory accepts prefix
const index = createGraphIndex("knowledge");
```

### libvector

```javascript
// VectorIndex lives at subpath to avoid circular dependency on libindex
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { VectorProcessor } from "@forwardimpact/libvector/processor/vector.js";

const index = new VectorIndex(storage, "content");
const processor = new VectorProcessor(index, resourceIndex, llmClient, logger);
```
