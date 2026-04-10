# Plan: 290 — Foundation (cross-cutting infrastructure)

> **Part 1 of 3.** Read [plan-a.md](plan-a.md) for the overall decomposition.
> This plan has **no dependencies** and unblocks both
> [plan-a-02.md](plan-a-02.md) and [plan-a-03.md](plan-a-03.md).

## Scope

Four small changes shipped as one PR. Only one of them is genuinely
cross-cutting — the rest are operational consolidation:

1. **F1** — Widen `libraries/libresource/parser.js` so it accepts `fit:` typed
   microdata items as main items (not only `https://schema.org/`). _Used by
   Stream A only_ — Stream B's tests parse Turtle directly and never invoke the
   resource processor.
2. **F2** — Register the `fit:` prefix in `libraries/libgraph/index.js`'s
   `RDF_PREFIXES` map so prefixed queries like `fit:Skill` resolve against
   stored named-node terms instead of degrading to literals. _Used by Stream A
   only_ — Stream B does not query the graph at test time.
3. **F3 — IRI module (genuinely cross-cutting).** Create
   `products/map/src/iri.js`, a shared module of IRI helpers for both base and
   derived entities, plus a `DERIVED_ENTITY_TYPES` constant. Export from
   `@forwardimpact/map` as `./iri`. Both Stream A's view-builders and Stream B's
   serializers import from this single source. **This is the only true
   cross-stream contract in the foundation.**
4. **F4** — Add a new `renderWithPartials` method on
   `@forwardimpact/libtemplate`'s `TemplateLoader` so Stream A's
   `capability.html` template can include a `skill-inline.html` Mustache partial
   without breaking the existing `render(name, data, dataDir)` signature. _Used
   by Stream A only._

**Honest framing:** F1, F2, and F4 are logically Stream A prerequisites. They
are bundled into the foundation PR rather than plan-a-02.md for three
operational reasons:

- They are all small, mechanical, and isolated. Shipping them in a separate tiny
  PR avoids interleaving them with the much larger Stream A work, where they
  would be easy to overlook in review.
- F1 and F2 are namespace/config one-liners that are independently reviewable
  and revertable, which is best done as a focused PR.
- F4 is an addition to a shared library that is annoying to discover
  mid-Stream-A — landing it up front means Stream A's templates compile cleanly
  the first time.

F3 is the only step that _must_ be in foundation: both Stream A and Stream B
import from `@forwardimpact/map/iri`, so the module has to exist before either
stream can compile.

## Key decisions

- **Widen the parser's prefix filter, not rebuild the resource processor.** The
  spec's "Not Included" list excludes processor changes. Widening the parser's
  allow-list of `itemtype` prefixes is a namespace config change, not processor
  logic — defensible inside the same exclusion.
- **Add a single `RDF_PREFIXES` entry, not refactor libgraph.** The graph
  processor itself (`libraries/libgraph/processor/*`) is untouched. We only
  declare the namespace alias.
- **`iri.js` lives under `products/map/src/`, not under `view-builders/`.** It
  is consumed by both Stream A and Stream B, so it is promoted to the top of
  `products/map/src/` and exported via `@forwardimpact/map/iri`. This makes the
  shared contract structural rather than enforced by code review.
- **Extend `TemplateLoader` with a new method, do not break the existing
  `render()` signature.** `render(name, data, dataDir)`'s third positional
  argument is already `dataDir`, so Mustache partials cannot piggy-back on it.
  Add `renderWithPartials(name, data, partialNames, dataDir)` instead. Both
  methods coexist.

## Steps

### F1. Widen microdata parser prefix filter

**File:** `libraries/libresource/parser.js`

- In `isMainItem` (line 59), accept both `https://schema.org/` and
  `https://www.forwardimpact.team/schema/rdf/` prefixes.
- In `#groupQuadsByItem` / the matching filter at line 181, apply the same
  widening.
- Extract the allowed prefixes into a single private constant so both sites stay
  in sync.

**Tests:** `libraries/libresource/test/parser.test.js`

- Add a fixture HTML document with a `fit:Skill` microdata main item. Assert the
  parser returns it.
- Run the existing `schema.org` fixtures to confirm no regression.

### F2. Register the `fit:` prefix in libgraph

**File:** `libraries/libgraph/index.js`

`RDF_PREFIXES` (line 8) currently declares only `schema`, `rdf`, `rdfs`, `foaf`,
and `ex`. When `libraries/libgraph/index/graph.js:162-182`
(`#patternTermToN3Term`) resolves a prefixed query like `fit:Skill`, it looks up
`this.#prefixes["fit"]`, finds `undefined`, falls through the
`startsWith("https://")` branch, and returns the input as a **literal** term.
Literal terms never match stored named-node type objects.

Edit: add `fit: "https://www.forwardimpact.team/schema/rdf/"` to `RDF_PREFIXES`.
This is a single-line config change — a new map entry, not a refactor.

**Tests:** `libraries/libgraph/test/prefixes.test.js` (new file or extension to
an existing one)

- Construct a `GraphIndex` with a stored quad whose object is
  `https://www.forwardimpact.team/schema/rdf/Skill`. Assert
  `getSubjects("fit:Skill")` returns the subject.
- Run existing `schema:Person` tests to confirm no regression.

### F3. Shared IRI module

**New file:** `products/map/src/iri.js`

```javascript
export const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";

// Base entity IRI helpers — used by Stream A view-builders.
export const skillIri      = (id) => `${VOCAB_BASE}skill/${id}`;
export const capabilityIri = (id) => `${VOCAB_BASE}capability/${id}`;
export const levelIri      = (id) => `${VOCAB_BASE}level/${id}`;
export const behaviourIri  = (id) => `${VOCAB_BASE}behaviour/${id}`;
export const disciplineIri = (id) => `${VOCAB_BASE}discipline/${id}`;
export const trackIri      = (id) => `${VOCAB_BASE}track/${id}`;
export const stageIri      = (id) => `${VOCAB_BASE}stage/${id}`;
export const driverIri     = (id) => `${VOCAB_BASE}driver/${id}`;
export const toolIri       = (id) => `${VOCAB_BASE}tool/${id}`;

// Derived entity IRI helpers — used by Stream B's serialize.js.
// Stream A templates must NEVER emit Job/AgentProfile/Progression
// types — they are derived-only and have no place in the indexed
// graph. The serializer in Stream B is the only emitter.
export const jobIri = (discipline, level, track) =>
  track
    ? `${VOCAB_BASE}job/${discipline}/${level}/${track}`
    : `${VOCAB_BASE}job/${discipline}/${level}`;
export const agentProfileIri = (discipline, track, stage) =>
  stage
    ? `${VOCAB_BASE}agent-profile/${discipline}/${track}/${stage}`
    : `${VOCAB_BASE}agent-profile/${discipline}/${track}`;
export const progressionIri = (discipline, from, to, track) =>
  track
    ? `${VOCAB_BASE}progression/${discipline}/${from}-${to}/${track}`
    : `${VOCAB_BASE}progression/${discipline}/${from}-${to}`;

// Canonical list of derived-entity rdf:type values that ONLY the
// pathway service may emit. Stream A's renderer test imports this
// list and asserts that no template emits any of these as a main
// itemtype — guaranteeing the resource processor never materializes
// derived entities into the graph.
//
// Adding a new derived class? Add it here. Both the Stream A
// negative assertion and any future Stream B serializer code that
// wants to enumerate "what we emit" will pick it up automatically.
// This eliminates the textual coupling between the two streams.
export const DERIVED_ENTITY_TYPES = [
  `${VOCAB_BASE}Job`,
  `${VOCAB_BASE}AgentProfile`,
  `${VOCAB_BASE}Progression`,
  `${VOCAB_BASE}SkillProficiency`,
  `${VOCAB_BASE}SkillChange`,
  `${VOCAB_BASE}BehaviourChange`,
  `${VOCAB_BASE}SkillModifier`,
];
```

**File:** `products/map/package.json`

Add the new export entry:

```json
"./iri": "./src/iri.js"
```

This is **required** so Stream B's `services/pathway/src/serialize.js` can
`import { skillIri, jobIri, ... } from "@forwardimpact/map/iri"`. Without this
entry Stream B would have to duplicate the IRI helpers, reintroducing the drift
risk this module exists to eliminate.

A mismatch in IRI shape silently breaks success criterion 3
(`ARGS="fit:Skill" just cli-subjects` returning all skills) because the graph
would hold two disconnected IRI families.

**Tests:** `products/map/test/iri.test.js`

- Unit tests for each constructor — round-trip stability, the `VOCAB_BASE`
  constant, and the optional-track / optional-stage branches in `jobIri`,
  `agentProfileIri`, `progressionIri`.
- Assertion that `DERIVED_ENTITY_TYPES` contains exactly the seven expected IRIs
  and that every entry begins with `VOCAB_BASE`. This is the canonical "this
  list cannot drift" guard.
- These tests are short but important: both Stream A and Stream B depend on this
  module's output being byte-identical, so any accidental change shows up here
  first.

### F4. Add `renderWithPartials` to `libtemplate`

**File:** `libraries/libtemplate/loader.js`

`TemplateLoader.render()` is currently `render(name, data, dataDir)` (see line
54 and the existing usage in `libraries/libtemplate/test/loader.test.js:139` —
`loader.render("page.html", { v: "!" }, dataDir)`). The third positional
argument is already `dataDir`, so we **cannot** add partials as a third
positional argument without a breaking change.

Add a new method on the same class:

```javascript
renderWithPartials(name, data, partialNames, dataDir) {
  // 1. Use existing load() to fetch the main template
  //    (preserves the two-tier user-override fallback).
  // 2. Loop partialNames, calling load() for each — same fallback.
  // 3. Build a { [partialName]: partialBody } map.
  // 4. Forward to Mustache.render(template, data, partials).
  //    See node_modules/mustache/mustache.js:751 —
  //    mustache.render(template, view, partials, config).
}
```

The existing `render()` method is **unchanged** and stays backward compatible.

**Tests:** `libraries/libtemplate/test/loader.test.js`

Add a companion test for the `renderWithPartials` path that asserts:

- A partial referenced via `{{> partial}}` is resolved.
- A partial under `{dataDir}/templates/` overrides the package default.
- Missing partials raise the same `Template '...' not found` error that `load()`
  does.

## Verification

This plan ships independently, but on its own it does not satisfy any spec
success criterion end-to-end. It enables them by making the infrastructure work.
After this plan lands:

| Check                                                                 | How verified                     |
| --------------------------------------------------------------------- | -------------------------------- |
| `fit:` typed microdata items pass libresource's main-item filter      | F1 parser unit test              |
| `getSubjects("fit:Skill")` resolves against stored named-node terms   | F2 graph prefix unit test        |
| `import { skillIri } from "@forwardimpact/map/iri"` works             | F3 iri unit test + manual import |
| `DERIVED_ENTITY_TYPES` exports the seven canonical IRIs               | F3 iri unit test                 |
| `TemplateLoader.renderWithPartials("a.html", view, ["b.html"])` works | F4 partials unit test            |

**Sequencing:** All four steps land in **one PR**. They are tightly coupled —
splitting them across PRs would leave the repository in states where (a) `fit:`
items parse but do not query, or (b) the shared module exists but is not
exported. Both are confusing for any follow-up work.

### Intermediate-state audit

After this PR merges but **before** either Stream A or Stream B has landed, the
repository is in the following state. This is the intentional, expected
intermediate state — reviewers should not be alarmed by unused exports.

| Change                                                  | Live consumers? | Risk                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libresource/parser.js` accepts `fit:` prefixed items   | None yet        | Harmless. No fixtures use `fit:`; existing schema.org tests still pass.                                                                                                                   |
| `libgraph/index.js` has `fit:` in `RDF_PREFIXES`        | None yet        | Harmless. Unused prefix entries cost nothing at lookup time.                                                                                                                              |
| `products/map/src/iri.js` + `./iri` package export      | None at runtime | The module ships in `@forwardimpact/map`'s tarball. F3 unit tests catch any rot. External consumers technically gain access to the helpers, but the module is stable and self-consistent. |
| `DERIVED_ENTITY_TYPES` constant                         | None at runtime | Same as above. The constant is the contract that Stream A's renderer test will later import.                                                                                              |
| `libtemplate/loader.js` has `renderWithPartials` method | None at runtime | Covered by F4's unit test so it does not silently rot. The existing `render()` method is unchanged; backward-compatible.                                                                  |

**No existing tests fail. No existing behaviour changes.** Anyone running
`bun run check` or `bun run test` against this PR alone sees only additions to
test files and unchanged green output for everything else.

**Why ship dead-on-arrival code?** Foundation is structural. The exports exist
so Stream A and Stream B can be implemented in parallel against a stable shared
contract. The alternative — landing F3 inline with Stream A and forcing Stream B
to wait or duplicate the IRI helpers — defeats the whole point of the
decomposition.

## File summary

**Created:**

- `products/map/src/iri.js`
- `products/map/test/iri.test.js`
- `libraries/libgraph/test/prefixes.test.js` (or extension to an existing
  fixture file)

**Modified:**

- `libraries/libresource/parser.js` (F1 — prefix filter widening)
- `libraries/libresource/test/parser.test.js` (F1 — `fit:Skill` fixture)
- `libraries/libgraph/index.js` (F2 — add `fit:` to `RDF_PREFIXES`)
- `libraries/libtemplate/loader.js` (F4 — add `renderWithPartials`)
- `libraries/libtemplate/test/loader.test.js` (F4 — partials test)
- `products/map/package.json` (F3 — add `./iri` export)

**Deleted:** none.
