# libvector

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Vector dot-product scoring — find semantically related content without a
dedicated database.

<!-- END:description -->

## Getting Started

```js
import { calculateDotProduct } from '@forwardimpact/libvector';
```

## Documentation

- [Search Semantically](https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md)
  — find related content by meaning with ranked results from a vector index
  (`fit-rag search`). You need no vector database.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — the full workflow to build an embedding pipeline from knowledge sources.

## Internal CLIs

The `fit-process vectors` build step (in [`librag`](../librag/README.md)) turns
resources into vector embeddings as one step that populates the index. It is
not an agent-facing tool.
