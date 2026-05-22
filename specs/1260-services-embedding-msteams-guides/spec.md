---
title: Service guides for embedding and msteams
status: draft
---

# Service guides for `embedding` and `msteams`

## Why

Two new gRPC services landed on `main` 2026-05-19 with declared Platform
Builders JTBD entries in their `package.json`, but neither has a guide under
`websites/fit/docs/services/`:

| Service     | Job declared in `package.json`                                | Guide exists? |
| ----------- | ------------------------------------------------------------- | ------------- |
| `embedding` | Embed Text for Retrieval (Big & Little Hire)                   | **no**        |
| `msteams`   | Bridge Conversation Platforms to the Agent Team (Big & Little) | **no**        |

A builder who reads `services/README.md` (which is generated from each
service's `package.json`) sees both jobs in the canonical catalog, but the
website hub at `/docs/services/` shows only four task headings — *Ground
Agents in Context*, *Integrate with the Engineering Standard*, *Keep Service
Contracts Typed*, *Prove Agent Changes*. The two new capabilities are
**undiscoverable through normal navigation** and the hub-vs-catalog asymmetry
is itself a credibility hit: the README advertises jobs the docs site does
not deliver.

The gap is a **publishing lag**, not an open product question — the
services exist, the JTBD entries are written, and the integration patterns
(gRPC for `embedding`, HTTP+`botbuilder` for `msteams`) are already in
production use within the monorepo (`vector` consumes `embedding`;
`facilitator` workflow consumes `msteams`).

## What

Add two new Big Hire / Little Hire guide pairs under
`websites/fit/docs/services/` matching the existing four-pair pattern
(`ground-agents/`, `integrate-standard/`, `typed-contracts/`,
`prove-changes/`):

```
websites/fit/docs/services/
  embed-text/                   # NEW — Big Hire for `embedding`
    index.md
    create-embeddings/          # Little Hire
      index.md
  bridge-conversations/         # NEW — Big Hire for `msteams`
    index.md
    dispatch-from-chat/         # Little Hire
      index.md
```

Hub page (`services/index.md`) gains two new `##` job headings each with
two `<!-- part:card:... -->` partials.

Slug shapes are **task-oriented** (not service-name-shaped) per
`websites/CLAUDE.md` § Guide Pages and the existing precedent (`ground-agents/`
is not `graph-and-vector/`, `prove-changes/` is not `trace/`).

## Page content sourcing

### `embed-text/` (Big Hire — 150–400 lines)

- Situation paragraph framing the embedding-as-shared-utility motivation
  (every product re-implementing HTTP embedding calls with its own retry +
  error handling)
- Architecture diagram showing `Product → embedding → inference backend`
  plus the `vector → embedding` indirect path
- 1-RPC service surface (`CreateEmbeddings`) per
  `services/embedding/proto/embedding.proto`
- Connection pattern (`createClient("embedding", logger, tracer)`)
- Two worked examples: single-input embedding, batch embedding
- Failure modes (inference backend down → gRPC error; empty input)
- Verify section
- *What's next* cards → Little Hire + sibling Big Hire

### `embed-text/create-embeddings/` (Little Hire — 80–200 lines)

- Bounded task: from "I have a string" to "I have a vector"
- Connect → build `EmbeddingsRequest` → call → read `data[].values`
- Batch shape and order-preservation guarantee
- Error handling for the inference-backend-unreachable case

### `bridge-conversations/` (Big Hire — 150–400 lines)

- Situation paragraph framing context-switching cost between chat and
  agent dispatch
- Architecture diagram showing
  `Teams ─ HTTP ─ msteams ─ GitHub Actions ─ agent-react`
- HTTP surface (not gRPC — `msteams` is the second exception to the
  gRPC-everywhere rule per `services/CLAUDE.md` § Architecture)
- Prerequisites pulled from `services/msteams/README.md`
  (Azure Bot resource, MS 365 tenant, GH token with `actions:write`)
- Worked example: dispatch a facilitate session from a Teams message
- Verify section
- *What's next* cards → Little Hire + sibling Big Hire

### `bridge-conversations/dispatch-from-chat/` (Little Hire — 80–200 lines)

- Bounded task: from "I have a Teams message" to "verdict returned to
  the same thread"
- Message → bridge → workflow_dispatch → verdict callback flow
- The HMAC callback contract (removed by `ace77bee` 2026-05-21 — restate
  the current state, not the historical one; verify against
  `services/msteams/index.js` at write time)
- Error handling for the GH-Actions-unreachable case

## Success criteria

1. `websites/fit/docs/services/embed-text/index.md` exists and renders
   under the *Embed Text for Retrieval* `##` heading on the hub page via
   a `<!-- part:card:embed-text -->` partial.
2. `websites/fit/docs/services/embed-text/create-embeddings/index.md`
   exists and renders as a nested card under the same heading.
3. `websites/fit/docs/services/bridge-conversations/index.md` exists
   and renders under the *Bridge Conversation Platforms to the Agent
   Team* `##` heading on the hub page.
4. `websites/fit/docs/services/bridge-conversations/dispatch-from-chat/index.md`
   exists and renders as a nested card under the same heading.
5. Every code example in the four new pages executes against a running
   service stack — verified by the author running each example before
   merge.
6. `bunx fit-doc build --src=websites/fit --out=dist` completes with
   no new broken-partial errors and no new warnings (baseline 100 MSGs).
7. The 8-service catalog in `services/README.md` (generated) and the
   four-pair task list in `websites/fit/docs/services/index.md`
   (hand-authored) are coherent — every service with a published JTBD
   entry maps to a guide pair through one of the task headings.
8. Audience purity preserved — no `src/` paths, no class names, no
   import statements that internal contributors would write but external
   builders would not.

## Out of scope

- **Backfilling per-service-name folders** (e.g. `embedding/`,
  `msteams/`) — the existing tier is task-oriented per
  `websites/CLAUDE.md`. The two new guides extend that pattern; they
  do not switch to service-name folders.
- **The `references/standards.md` stale claim** that services
  subsections are "One per service (`graph/`, `vector/`, `pathway/`,
  `mcp/`, `trace/`)" — that claim was already stale before these new
  services landed and is tracked separately as a cross-skill drift
  item in the technical-writer carry-forward queue.
- **MCP coverage of `embedding`** — `embedding` is not currently in
  the default MCP tool set (`products/guide/starter/config.json`
  lists 15 tools across graph/vector/pathway/map). Adding it to MCP
  is a product decision, not a docs decision.
- **`map` service does not get its own guide** — `map` capabilities
  reach builders through the MCP tool set described in
  `typed-contracts/index.md` (the *Default tool set* table includes
  the four `map` tools). If the team later decides `map` warrants its
  own task heading, that is a separate spec.

## Verification

- Manual: open the four URLs in `bunx fit-doc serve --src=websites/fit
  --watch` and confirm each page renders, the hub-page partials resolve,
  and *What's next* card targets exist.
- Build: `bunx fit-doc build --src=websites/fit --out=dist` exits 0 with
  no new warnings vs. the pre-merge baseline.
- Discoverability: `services/README.md` catalog count (8) matches the
  count of services reachable via the hub page's task headings (8 — graph
  + vector through `ground-agents/`; pathway through `integrate-standard/`;
  mcp + map through `typed-contracts/`; trace through `prove-changes/`;
  embedding through new `embed-text/`; msteams through new
  `bridge-conversations/`).
