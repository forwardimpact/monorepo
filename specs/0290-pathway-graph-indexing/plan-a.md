# Plan: 290 — Pathway Graph Indexing

This plan is split into three independent documents to keep each one
implementable in a single context without degradation. Read this file first for
the overall shape, then read whichever sub-plan you are implementing in full.

## Decomposition

| #   | Document                     | Scope                                                                                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [plan-a-01.md](plan-a-01.md) | Cross-cutting infrastructure: parser widening, graph prefix, shared IRI module, libtemplate partials                            |
| 2   | [plan-a-02.md](plan-a-02.md) | Stream A — Mustache templates, view builders, renderer, exporter, `fit-map export` CLI, justfile, end-to-end pipeline test      |
| 3   | [plan-a-03.md](plan-a-03.md) | Stream B — `services/pathway/` gRPC service, proto, libskill-backed RPCs, Turtle serializer, fit-guide wiring, integration test |

## Dependency order

```
plan-a-01.md  (no dependencies — must merge first)
        │
        ├──────────────────────┐
        ▼                      ▼
plan-a-02.md     plan-a-03.md
   (Stream A)               (Stream B)
```

- **plan-a-01.md** has no dependencies. It introduces the parser widening, the
  `fit:` prefix in libgraph, the shared `@forwardimpact/map/iri` module, and the
  `renderWithPartials` method on libtemplate's loader. None of those four
  changes are independently useful; they ship as one PR.
- **plan-a-02.md** depends on the foundation: it imports
  `@forwardimpact/map/iri` from view-builders, and the `capability.html`
  template uses `renderWithPartials`. Its end-to-end pipeline test relies on the
  parser widening and graph prefix from foundation to make `fit:` queries
  resolve.
- **plan-a-03.md** depends on the foundation only — its Turtle serializer
  imports IRI helpers from `@forwardimpact/map/iri`. It does **not** depend on
  Stream A: the pathway service does not flow data through the resource/graph
  pipeline, so it can be implemented and tested independently.

After foundation merges, plans 2 and 3 are independent and can be implemented in
either order or in parallel.

### Why Stream B is genuinely parallelizable with Stream A

The key fact that makes the parallel structure work: **Stream B's tests never
invoke libresource or libgraph.** Stream B's serialization tests call the N3
`Parser` directly on the Turtle strings emitted by
`services/pathway/src/serialize.js` and assert quad-level shape; the Stream B
integration test runs `PathwayService` in-process and parses its
`ToolCallResult.content` field the same way. None of this exercises the HTML →
microdata → resource → graph pipeline that Stream A is responsible for.

This is why Stream B does not need the parser-widening (F1) or graph-prefix (F2)
changes from foundation to be testable, and why it does not need any of Stream
A's templates, exporter, or `just process` wiring. The only thing it inherits
from foundation is the shared `@forwardimpact/map/iri` module — that one
structural contract is enough to guarantee the IRIs in Stream B's Turtle output
match the IRIs in Stream A's HTML microdata once both streams are deployed
together.

## Why three documents instead of one

The original combined plan exceeded the size where a single implementation
context could hold the whole spec without losing detail. The natural seams are:

1. **Cross-cutting infrastructure** — small, mechanical, prerequisite for
   everything else. Lives across libresource, libgraph, libtemplate, and a new
   shared module in `products/map/src/`.
2. **The HTML export pipeline** — concentrated in `products/map/`. Templates,
   view-builders, renderer, exporter, CLI, justfile, plus the end-to-end test
   that validates the full YAML → HTML → resource → graph flow.
3. **The gRPC service** — concentrated in `services/pathway/` plus config
   wiring. Its only contact with `products/map/` is through the IRI helpers
   exported by the foundation plan.

The shared IRI module in foundation is what makes Stream A and Stream B
genuinely independent: both sides import the same constructors, so
derived-entity IRIs cannot drift from base-entity IRIs even though the two
streams are written and tested separately.

## Verification matrix

| #   | Spec success criterion                                   | Plan                             |
| --- | -------------------------------------------------------- | -------------------------------- |
| 1   | `fit-map export` produces HTML in `data/knowledge/`      | plan-a-02.md (A3, A4)            |
| 2   | `just cli-subjects` lists `fit:*` types                  | plan-a-01.md + plan-a-02.md (A6) |
| 3   | `ARGS="fit:Skill" just cli-subjects` returns all skills  | plan-a-01.md + plan-a-02.md (A6) |
| 4   | `npx fit-guide --init` emits pathway endpoints           | plan-a-03.md (B5)                |
| 5   | `npx fit-rc status` shows pathway running, tools resolve | plan-a-03.md (B1–B5)             |
| 6   | Guide answers "what skills…" via graph path              | plan-a-02.md                     |
| 7   | Guide answers L3 FDE question matching `fit-pathway`     | plan-a-03.md (B7)                |
| 8   | Guide answers progression delta matching `fit-pathway`   | plan-a-03.md (B7)                |
| 9   | Adversarial terminology probes pass                      | plan-a-03.md (B6)                |

## Out of scope reminders (from spec)

- No new derivation logic — Stream B is pure transport.
- No interview question tool.
- No agent prompt changes beyond advertising the new tools.
- No materialization of derived entities into the graph.
- No web UI for the pathway service.
