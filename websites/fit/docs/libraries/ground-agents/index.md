---
title: Give Agents Typed, Retrievable Knowledge
description: Agents answer relationship questions, look up context, and find related content. Typed knowledge infrastructure backs them, and it needs no external engines.
---

You need agents that answer questions about relationships between entities. You
also need them to look up context by identifier and to find related content by
meaning. Today untyped files hold the knowledge, or retrieval depends on an
external search engine. Four libraries give you a self-contained knowledge
infrastructure that runs locally without external databases:
`@forwardimpact/libresource`, `@forwardimpact/libgraph`,
`@forwardimpact/libindex`, and `@forwardimpact/libvector`.

The pipeline flows in three stages: ingest HTML into typed resources, extract
RDF triples into a graph, and generate vector embeddings for semantic retrieval.
Each stage produces a JSONL-backed index that agents can query directly.

## Prerequisites

- Node.js 22+
- An embedding endpoint (any OpenAI-compatible `/v1/embeddings` API) to index
  vectors
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
`VectorIndex` extend. It persists JSONL, loads on demand, filters by prefix,
and holds results within a token budget. The specialized indexes inherit that
behavior and do not implement it again.

## Where the indexes live: the storage substrate

Every index in this pipeline reads and writes through one backend interface from
`@forwardimpact/libstorage`. The `createStorage(prefix)` factory returns a
storage handle scoped to a named prefix. You construct each index with one:

```js
import { createStorage } from "@forwardimpact/libstorage";

const storage = createStorage("vectors"); // reads/writes data/vectors/
```

The `STORAGE_TYPE` environment variable selects the backend for the same call.
Consumer code does not change:

| `STORAGE_TYPE` | Backend                    | Where data lives           |
| -------------- | -------------------------- | -------------------------- |
| `local`        | Local filesystem (default) | `data/<prefix>/`           |
| `s3`           | Amazon S3 or S3-compatible | `<bucket>/<prefix>/`       |
| `supabase`     | Supabase Storage           | `<bucket>/<prefix>/`       |

Every index shares this interface. You develop against the local filesystem.
You deploy against S3 or Supabase when you set `STORAGE_TYPE`. The graph,
vector, and resource indexes never know which backend they use.

On the local backend, `put(key, data)` replaces the target atomically. It
writes a sibling temp file and then renames it. When the process dies during a
write, the target keeps its prior content or holds the new content. The target
never holds a truncated prefix.

Install it alongside the index libraries:

```sh
npm install @forwardimpact/libstorage
```

## 1. Prepare the knowledge directory

Create `data/knowledge/`. Add HTML files with schema.org microdata. The
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
3. Extracts RDF quads from microdata with the streaming parser
4. Skolemizes blank nodes into content-hashed URIs for cross-document
   deduplication
5. Serializes each entity's triples as Turtle RDF
6. Stores the result in `data/resources/` as a JSON file with a
   content-hashed identifier

When the same entity appears in multiple HTML files, the processor merges
triples with RDF union semantics. It adds new properties. It keeps one copy of
each identical triple.

After the processor finishes, verify the resources exist:

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

The ontology file describes the shape of the data: which types exist, what
properties each type has, and how types relate to each other. Agents read this
file to learn what questions the graph can answer before they write queries.

Verify that the processor built the graph:

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

The output is the resource identifier that contains the matching triple. The
query uses the `subject predicate object` pattern, where `?` is a wildcard.
Prefixed names like `schema:worksFor` expand with the standard prefix map
(`schema:` -> `https://schema.org/`).

## 4. Generate vector embeddings

The vector processor takes each resource's text content. It sends the content
to an embedding endpoint. It stores the vectors that come back:

```sh
npx fit-process vectors
```

This step needs the embedding gRPC service (`@forwardimpact/svcembedding`).
That service proxies to an OpenAI-compatible Text Embeddings Inference (TEI)
backend. Configure it through the `service.embedding` block in
`config/config.json` or with the `SERVICE_EMBEDDING_*` environment variables:

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

After the processor finishes, test a semantic search:

```sh
npx fit-rag search "senior engineering role"
```

```text
common.Message.a1b2c3d4	0.8712
common.Message.e5f6g7h8	0.6543
```

The command ranks results by dot-product score (cosine similarity for
normalized vectors). Higher scores show closer semantic matches.

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

The `createGraphIndex("graphs")` call reads from `data/graphs/`. The
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
`max_tokens`. These fields scope results by identifier prefix, cap the count,
or hold the results within a token budget.

## Verify

After you run all three stages, confirm that the full pipeline produced the
expected artifacts:

```sh
ls data/resources/       # Typed resource JSON files
ls data/graphs/          # index.jsonl + ontology.ttl
ls data/vectors/         # index.jsonl with embeddings

npx fit-rag subjects                           # All subjects and types
npx fit-rag query "?" rdf:type schema:Person   # Graph query
npx fit-rag search "team member"               # Semantic search
```

Each command should return results drawn from the HTML files you ingested. If a
command returns nothing, check that the previous stage completed. Resources must
exist before graphs. Resources must exist before vectors.

## What's next

<div class="grid">

<!-- part:card:query-graph -->
<!-- part:card:lookup-context -->
<!-- part:card:resolve-resource -->
<!-- part:card:search-semantically -->

</div>
