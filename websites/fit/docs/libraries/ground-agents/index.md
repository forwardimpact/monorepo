---
title: Give Agents Typed, Retrievable Knowledge
description: Agents that can answer relationship questions, look up context, and find related content — backed by typed knowledge infrastructure with no external engines.
---

You need agents that can answer questions about relationships between entities,
look up context by identifier, and find semantically related content. Right now,
the knowledge is either trapped in untyped files or requires an external search
engine to retrieve. Four libraries -- `@forwardimpact/libresource`,
`@forwardimpact/libgraph`, `@forwardimpact/libindex`, and
`@forwardimpact/libvector` -- give you a self-contained knowledge infrastructure
that runs locally without external databases.

The pipeline flows in three stages: ingest HTML into typed resources, extract
RDF triples into a graph, and generate vector embeddings for semantic retrieval.
Each stage produces a JSONL-backed index that agents can query directly.

## Prerequisites

- Node.js 22+
- An embedding endpoint (any OpenAI-compatible `/v1/embeddings` API) for
  vector indexing
- HTML files with [schema.org](https://schema.org/) microdata markup in a
  `data/knowledge/` directory

Install all four libraries:

```sh
npm install @forwardimpact/libresource @forwardimpact/libgraph @forwardimpact/libindex @forwardimpact/libvector
```

## How the pipeline fits together

Each library owns one stage. The output of one stage feeds the next:

```text
data/knowledge/*.html
        |
        v
  libresource          -->  data/resources/*.json     (typed resources)
        |
        +-------+
        |       |
        v       v
  libgraph    libvector
        |       |
        v       v
  data/graphs/  data/vectors/
  index.jsonl   index.jsonl
  ontology.ttl
```

`libindex` provides the `IndexBase` class that both `GraphIndex` and
`VectorIndex` extend. It handles JSONL persistence, lazy loading, prefix
filtering, and token budgeting so the specialized indexes inherit that
behavior without reimplementing it.

## Where the indexes live: the storage substrate

Every index in this pipeline reads and writes through one backend interface from
`@forwardimpact/libstorage`. The `createStorage(prefix)` factory returns a
storage handle scoped to a named prefix, and each index is constructed with one:

```js
import { createStorage } from "@forwardimpact/libstorage";

const storage = createStorage("vectors"); // reads/writes data/vectors/
```

The same call resolves to a different backend depending on the `STORAGE_TYPE`
environment variable, with no change to consumer code:

| `STORAGE_TYPE` | Backend                    | Where data lives           |
| -------------- | -------------------------- | -------------------------- |
| `local`        | Local filesystem (default) | `data/<prefix>/`           |
| `s3`           | Amazon S3 or S3-compatible | `<bucket>/<prefix>/`       |
| `supabase`     | Supabase Storage           | `<bucket>/<prefix>/`       |

Because every index shares this interface, you develop against the local
filesystem and deploy against S3 or Supabase by setting `STORAGE_TYPE` — the
graph, vector, and resource indexes never know which backend they are talking
to. On the local backend, `put(key, data)` is a same-target atomic replace
(write a sibling temp file, then `rename`), so a process killed mid-write leaves
the target at either its prior content or the new content, never a truncated
prefix.

Install it alongside the index libraries:

```sh
npm install @forwardimpact/libstorage
```

## 1. Prepare the knowledge directory

Create `data/knowledge/` and add HTML files with schema.org microdata. The
resource processor extracts typed entities from `itemscope` / `itemtype` /
`itemprop` attributes:

```html
<!-- data/knowledge/team.html -->
<!DOCTYPE html>
<html>
<head><base href="https://example.com/team" /></head>
<body>
  <div itemscope itemtype="https://schema.org/Person">
    <span itemprop="name">Alice Chen</span>
    <span itemprop="jobTitle">Senior Engineer</span>
    <link itemprop="worksFor" href="https://example.com/org/acme" />
  </div>
  <div itemscope itemtype="https://schema.org/Organization">
    <meta itemprop="url" content="https://example.com/org/acme" />
    <span itemprop="name">Acme Corp</span>
  </div>
</body>
</html>
```

The `<base href>` element sets the IRI for all relative references in the
document. Without it, the processor falls back to the `--base` flag or a
default URI.

## 2. Ingest HTML into typed resources

Run the resource processor to parse every HTML file in `data/knowledge/` and
store each entity as a typed `Message` resource:

```sh
npx fit-process resources --base=https://example.com/
```

The processor:

1. Finds all `.html` files in `data/knowledge/`
2. Sanitizes the DOM (normalizes whitespace, encodes stray characters)
3. Extracts RDF quads from microdata using the streaming parser
4. Skolemizes blank nodes into content-hashed URIs for cross-document
   deduplication
5. Serializes each entity's triples as Turtle RDF
6. Stores the result in `data/resources/` as a JSON file with a
   content-hashed identifier

When the same entity appears in multiple HTML files, the processor merges
triples using RDF union semantics -- new properties are added, existing
identical triples are deduplicated.

After processing, verify the resources exist:

```sh
ls data/resources/
```

```text
common.Message.a1b2c3d4.json
common.Message.e5f6g7h8.json
```

Each file contains the entity's typed identifier, its role (`system`), and the
RDF content as a Turtle string.

## 3. Build the RDF graph

With resources in place, extract their RDF content into a graph index and
generate the ontology:

```sh
npx fit-process graphs
```

The graph processor:

1. Reads all resource identifiers from `data/resources/`
2. Filters to `common.Message` resources (which contain RDF content)
3. Parses each resource's Turtle content back into quads
4. Adds quads to the in-memory N3 triple store, keyed by resource identifier
5. Writes the graph index to `data/graphs/index.jsonl`
6. Builds a SHACL ontology from all observed types and predicates
7. Writes the ontology to `data/graphs/ontology.ttl`

The ontology file describes the shape of the data -- which types exist, what
properties each type has, and how types relate to each other. Agents read this
file to understand what questions the graph can answer before writing queries.

Verify the graph was built:

```sh
npx fit-rag subjects
```

```text
https://example.com/team#alice	https://schema.org/Person
https://example.com/org/acme	https://schema.org/Organization
```

Each line shows a subject URI and its type. Run a triple-pattern query to test
a relationship:

```sh
npx fit-rag query "?" schema:worksFor "?"
```

```text
common.Message.a1b2c3d4
```

The output is the resource identifier containing the matching triple. The
query uses the `subject predicate object` pattern where `?` is a wildcard.
Prefixed names like `schema:worksFor` expand using the standard prefix map
(`schema:` -> `https://schema.org/`).

## 4. Generate vector embeddings

The vector processor takes each resource's text content, sends it to an
embedding endpoint, and stores the resulting vectors:

```sh
npx fit-process vectors
```

This requires the embedding gRPC service (`@forwardimpact/svcembedding`),
which proxies to an OpenAI-compatible Text Embeddings Inference (TEI) backend.
Configure it through the `service.embedding` block in `config/config.json` or
the `SERVICE_EMBEDDING_*` environment variables:

```json
{
  "service": {
    "embedding": {
      "backend_port": 8090,
      "model": "BAAI/bge-small-en-v1.5"
    }
  }
}
```

The processor:

1. Reads all resource identifiers from `data/resources/`
2. Filters out conversations and tool functions
3. Batches resource content for efficient embedding API calls
4. Stores each vector alongside its resource identifier in
   `data/vectors/index.jsonl`

After processing, test a semantic search:

```sh
npx fit-rag search "senior engineering role"
```

```text
common.Message.a1b2c3d4	0.8712
common.Message.e5f6g7h8	0.6543
```

Results are ranked by dot-product score (cosine similarity for normalized
vectors). Higher scores indicate closer semantic matches.

## 5. Query from code

The CLIs are thin wrappers around the library APIs. For programmatic access,
use the libraries directly:

```js
import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";
import { createResourceIndex } from "@forwardimpact/libresource";

// Query the graph for all Person entities
const graph = createGraphIndex("graphs");
const pattern = parseGraphQuery("? rdf:type schema:Person");
const identifiers = await graph.queryItems(pattern);

// Resolve matched identifiers to full resources
const resources = createResourceIndex("resources");
const items = await resources.get(identifiers.map(String));

for (const item of items) {
  console.log(item.id.type, item.id.name);
  console.log(item.content);   // Turtle RDF string
}
```

The `createGraphIndex("graphs")` call reads from `data/graphs/`; the
`createResourceIndex("resources")` call reads from `data/resources/`. Both use
the `data/<prefix>/` convention. Pass a different prefix to point at a
different directory.

For vector search from code:

```js
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { createStorage } from "@forwardimpact/libstorage";

const storage = createStorage("vectors");
const vectorIndex = new VectorIndex(storage);

// Assume you have a query vector from your embedding API
const queryVector = [0.12, -0.34, 0.56, /* ... */];
const results = await vectorIndex.queryItems([queryVector], {
  limit: 5,
  threshold: 0.5,
});

for (const id of results) {
  console.log(String(id), id.score?.toFixed(4));
}
```

Both `queryItems` methods accept a filter object with `prefix`, `limit`, and
`max_tokens` to scope results by identifier prefix, cap the count, or stay
within a token budget.

## Verify

After running all three stages, confirm the full pipeline produced the expected
artifacts:

```sh
ls data/resources/       # Typed resource JSON files
ls data/graphs/          # index.jsonl + ontology.ttl
ls data/vectors/         # index.jsonl with embeddings

npx fit-rag subjects                           # All subjects and types
npx fit-rag query "?" rdf:type schema:Person   # Graph query
npx fit-rag search "team member"               # Semantic search
```

Each command should return results drawn from the HTML files you ingested. If a
command returns nothing, check that the previous stage completed: resources must
exist before graphs, and resources must exist before vectors.

## What's next

<div class="grid">

<!-- part:card:query-graph -->
<!-- part:card:lookup-context -->
<!-- part:card:resolve-resource -->
<!-- part:card:search-semantically -->

</div>
