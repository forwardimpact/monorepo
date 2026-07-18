# libresource

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Typed resources with identifiers and rich context chunks — trustworthy,
retrievable knowledge for agent grounding.

<!-- END:description -->

## Getting Started

```js
import { createResourceIndex } from '@forwardimpact/libresource';

const index = createResourceIndex('resources');
```

## Documentation

- [Resolve a Resource](https://www.forwardimpact.team/docs/libraries/ground-agents/resolve-resource/index.md)
  — turn a resource identifier into rich, typed context with provenance and
  access control.
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — the full workflow for ingesting knowledge sources and building the resource
  index.

## Internal CLIs

The `fit-process resources` build step (in [`librag`](../librag/README.md))
ingests source documents into typed resources as part of populating the index.
It is not an agent-facing tool. The agent-facing path is the programmatic
resolver documented in the guides above.
