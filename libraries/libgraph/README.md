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

- [Query a Knowledge Graph](https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md) — answer relationship questions from an RDF graph index with triple-pattern queries (`fit-query`) and type-filtered subject listings (`fit-subjects`).
- [Give Agents Typed, Retrievable Knowledge](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md) — the full workflow for building and populating the graph index from HTML knowledge sources.

## Internal CLIs

`fit-process-graphs` is an internal build-pipeline step (it turns resources into
RDF graphs as part of populating the index). It is not an agent-facing tool and
intentionally ships no skill or user guide.
