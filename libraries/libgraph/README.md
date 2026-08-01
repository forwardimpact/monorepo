# libgraph

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

RDF triple store with named ontologies — answer relationship questions without
writing join logic.

<!-- END:description -->

## Getting Started

```js
import { createGraphIndex, parseGraphQuery, ShaclSerializer } from '@forwardimpact/libgraph';

const index = createGraphIndex('mygraph');
```

## Documentation

- [Query a Knowledge Graph](https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md)
  — answer relationship questions from an RDF graph index with triple-pattern
  queries (`fit-rag query`) and type-filtered subject lists
  (`fit-rag subjects`).
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
  — the full workflow to build and populate the graph index from HTML
  knowledge sources.

## Internal CLIs

The `fit-process graphs` build step (in [`librag`](../librag/README.md)) turns
resources into RDF graphs. The step does this as it populates the index. It is
not an agent-facing tool.
