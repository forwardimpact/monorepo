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

- [Search Semantically](https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md) — find related content by meaning with ranked results from a vector index (`fit-search`), no vector database required.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md) — the full workflow for building an embedding pipeline from knowledge sources.

## Internal CLIs

`fit-process-vectors` is an internal build-pipeline step (it turns resources into
vector embeddings as part of populating the index). It is not an agent-facing
tool and intentionally ships no skill or user guide.
