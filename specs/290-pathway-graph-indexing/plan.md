# Plan: 290 — Pathway Graph Indexing

## Approach

Two independent work streams share a directory but can land in either order.
Stream A (Map export) produces HTML microdata from pathway YAML so the existing
resource/graph pipeline picks up base entities. Stream B (Pathway service) wraps
libskill derivation as a gRPC service and wires it into fit-guide. Two small
shared changes connect them, and both are cross-cutting one-liners: (1) widening
the libresource parser filter so `fit:` typed microdata items are accepted as
main items, and (2) registering the `fit:` prefix in libgraph's `RDF_PREFIXES`
so queries like `fit:Skill` resolve against stored quads.

Order: land A1 + A1b (parser widening + graph prefix) first in the same PR —
they are the only cross-cutting edits and neither one is independently useful.
Then Stream A and Stream B can proceed independently. Integration and the `just`
wiring land last.

### Key decisions

- **Render HTML via Mustache templates loaded through
  `@forwardimpact/libtemplate`**, not by promoting the existing JavaScript
  microdata formatters. `libraries/libsyntheticrender/` is the existing
  precedent: it owns a `templates/` directory of Mustache `.html` files, wraps
  them in a single `page.html` shell, and renders through
  `TemplateLoader.render(name, view)` from `@forwardimpact/libtemplate/loader`
  (see `libraries/libsyntheticrender/render/html.js:17-24` for the `page()`
  shell helper and `libraries/libsyntheticrender/render/renderer.js:118-122` for
  the `createRenderer()` wiring). The same shape is applied to Map: one Mustache
  template per base entity type under `products/map/templates/`, a thin
  `Renderer` class in `products/map/src/renderer.js` that holds a
  `TemplateLoader` and exposes one method per entity (`renderSkill(view)`,
  `renderCapability(view)`, etc.), and small pure **view-builder** functions
  that transform raw YAML entities into the flat data shape the templates
  consume. Do **not** reuse `libsyntheticrender/templates/` — its templates bind
  to `schema.org/*` classes and entity shapes specific to synthetic organization
  data, which are wrong for pathway framework entities. We reuse the _pattern_
  (templates + `TemplateLoader` + `page.html` shell), not the template bodies.

  The existing `products/pathway/src/formatters/*/microdata.js` files and
  `microdata-shared.js` are **deleted** in this spec. They are dead code at the
  pathway product's boundary — they are re-exported from
  `products/pathway/src/formatters/index.js` but no pathway runtime importer
  consumes them (verified with
  `grep -rn "ToMicrodata\|microdata-shared" products/pathway/src` outside the
  `formatters/` directory returns zero hits). Removing them leaves only the
  `dom.js`, `markdown.js`, and `shared.js` siblings, which continue to power the
  pathway CLI's human-facing output.

  The `prepareSkillsList` / `prepareSkillDetail` helpers under
  `products/pathway/src/formatters/skill/shared.js` (and equivalents for other
  entities) are data-shape transforms that do not depend on any HTML helpers.
  The new view-builders in Map draw inspiration from these — they perform the
  same "raw YAML entity → flat view model" flattening — but live in
  `products/map/src/view-builders/` and are written fresh against the template
  placeholders each template expects. They are not lifted wholesale; pathway
  keeps its own view-builders for the CLI's markdown/DOM paths.

- **One HTML file per entity** written to
  `data/knowledge/pathway/<type>/<id>.html`. The subdirectory isolates generated
  files from hand-authored knowledge and makes `data-clean`-then-regenerate
  idempotent. The exporter deletes the `data/knowledge/pathway/` tree at the
  start of each run so stale entries left over from deleted YAML entries do not
  leak into the resource processor.
- **Widen the microdata parser's prefix filter and register the `fit:` graph
  prefix**, not rebuild the resource processor or graph processor. The spec's
  "Not Included" list excludes processor changes, but there are two thin
  one-liners that any rendering approach would require:
  - `libraries/libresource/parser.js` currently rejects any typed item that does
    not start with `https://schema.org/` (see `isMainItem`, parser.js:59). Widen
    to accept the `fit:` namespace too.
  - `libraries/libgraph/index.js`'s `RDF_PREFIXES` constant (line 8) declares
    only `schema`, `rdf`, `rdfs`, `foaf`, `ex`. Prefixed queries like
    `fit:Skill` degrade to literal terms via
    `libraries/libgraph/index/graph.js:162-182` and never match stored named
    nodes. Add a single map entry:
    `fit: "https://www.forwardimpact.team/schema/rdf/"`.

  Without both, success criteria 2 and 3 cannot be satisfied regardless of
  template quality — quads get stored but queries return nothing. Neither edit
  touches the processors themselves; they are namespace config changes. Both are
  called out explicitly below in A1 and A1b.

- **Pathway service mirrors `services/graph/` exactly** — same class layout,
  same composition-root shape, same ToolCallResult return pattern. No new
  service framework primitives.
- **Service is a thin transport** — each RPC method delegates directly to
  libskill exports. No new derivation logic. The composition root uses the same
  three-call load sequence as `products/pathway/src/commands/agent.js`:
  `loadAllData` + `loadAgentData` + `loadSkillsWithAgentData`. `loadAllData`
  produces a destructured per-skill shape that drops `human` (see
  `products/map/src/loader.js:102-127`), while `loadSkillsWithAgentData` spreads
  the full raw skill — which is the shape `generateStageAgentProfile` walks.
  Both are required.
- **RPCs return Turtle RDF in the `content` field**, not markdown. This matches
  the existing `GetOntology` pattern and gives Guide graph-compatible vocabulary
  in every derived response, so it can chain into `query_by_pattern` calls
  against the base entities Stream A indexes. See B3 for the rationale in
  detail.
- **No new SHACL vocabulary file in this spec.** An earlier revision of this
  plan proposed `products/map/schema/rdf/derivations.ttl` so `get_ontology`
  would describe `fit:Job`, `fit:AgentProfile`, etc. That is built on a false
  premise: `libraries/libgraph/processor/ontology.js` derives `ontology.ttl`
  statistically from observed quads at processing time — nothing reads TTL files
  from `products/map/schema/rdf/`, and the spec explicitly forbids materializing
  derived entities into the graph. Adding a TTL file would be invisible to
  `get_ontology`. The pathway service will therefore emit `fit:Job` /
  `fit:AgentProfile` / `fit:Progression` IRIs in its Turtle responses using an
  ad-hoc but documented vocabulary, and Guide will learn those types from the
  tool descriptions in `tools.yml` rather than from `get_ontology`. A proper fix
  (merging hand-authored TTLs into `ontology.ttl`) is deferred to a follow-up
  spec.
- **Tool names are frozen by the spec's terminology section.** Do not
  re-abbreviate or shorten in implementation: `pathway_list_jobs`,
  `pathway_describe_job`, `pathway_list_agent_profiles`,
  `pathway_describe_agent_profile`, `pathway_describe_progression`,
  `pathway_list_job_software`.
- **Codegen prerequisite for Stream B.** All gRPC service packages in this
  monorepo depend on generated bases produced by `bunx fit-codegen --all`
  (a.k.a. `just codegen`). Running `bun run test` in `services/pathway/` before
  codegen will fail with `PathwayBase is undefined` because
  `services.PathwayBase` does not exist yet. The implementation sequence is
  therefore: `bun install` → `just codegen` → tests. This is already true for
  `services/graph/` etc.; it is called out here because `services/pathway/` is
  new and first-time contributors commonly miss it.

## Stream A — Map HTML export

### A1. Widen microdata parser prefix filter (shared)

**File:** `libraries/libresource/parser.js`

- In `isMainItem` (line 59), accept both `https://schema.org/` and
  `https://www.forwardimpact.team/schema/rdf/` prefixes.
- In `#groupQuadsByItem` / the matching filter at line 181, apply the same
  widening.
- Extract the allowed prefixes into a single private constant so both sites stay
  in sync.

**Tests:** `libraries/libresource/test/parser.test.js` — add a fixture with a
`fit:Skill` microdata item and assert it is returned by the parser. Run the
existing schema.org fixtures to confirm no regression.

### A1b. Register the `fit:` prefix in libgraph

**File:** `libraries/libgraph/index.js`

`RDF_PREFIXES` (line 8) currently declares only `schema`, `rdf`, `rdfs`, `foaf`,
and `ex`. When `libraries/libgraph/index/graph.js:162-182`
(`#patternTermToN3Term`) resolves a prefixed query like `fit:Skill`, it looks up
`this.#prefixes["fit"]`, finds `undefined`, falls through the
`startsWith("https://")` branch, and returns the input as a **literal** term.
Literal terms never match stored named-node type objects, so
`ARGS="fit:Skill" just cli-subjects` returns an empty set even after Stream A's
export has indexed `https://www.forwardimpact.team/schema/rdf/Skill` quads into
the graph.

Without this change, spec success criteria 2 and 3 cannot be satisfied
regardless of how the templates render.

Edit: add `fit: "https://www.forwardimpact.team/schema/rdf/"` to `RDF_PREFIXES`.
This is a single-line config change — a new map entry, not a refactor — and is
defensible against the spec's "Not Included" exclusion of "changes to the graph
processor" because `RDF_PREFIXES` is a namespace declaration, not processor
logic. The graph processor itself (`libraries/libgraph/processor/*`) is
untouched.

**Tests:** `libraries/libgraph/test/` — add a test that constructs a
`GraphIndex` with a stored quad whose object is
`https://www.forwardimpact.team/schema/rdf/Skill` and asserts that
`getSubjects("fit:Skill")` returns the subject. Run existing `schema:Person`
tests to confirm no regression. If an equivalent test file for the prefix
mapping does not yet exist, add a minimal
`libraries/libgraph/test/prefixes.test.js`.

**Ordering:** land A1 and A1b together in the same PR. They are both
"cross-cutting one-liners that unblock everything else" and neither one is
useful without the other — A1 makes `fit:` items parseable, A1b makes them
queryable.

### A2. Mustache templates, view builders, and renderer

The rendering engine is new code in Map. It has three layers:

1. **Mustache templates** under `products/map/templates/` — one per entity type
   plus a shared page shell. These files hold all HTML markup and
   `itemtype`/`itemprop` attributes.
2. **View builders** under `products/map/src/view-builders/` — pure functions
   that transform raw YAML entities into the flat view model each template
   expects. They isolate the "raw data → template data" mapping so templates can
   stay dumb and testable.
3. **Renderer class** `products/map/src/renderer.js` — thin wrapper around
   `@forwardimpact/libtemplate`'s `TemplateLoader`, exposing one method per
   entity type. This mirrors `libraries/libsyntheticrender/render/renderer.js`.

#### A2a. Templates

**New directory:** `products/map/templates/`

Create one file per base entity, plus a page shell. Follow
`libraries/libsyntheticrender/templates/page.html` for the shell shape and
`libraries/libsyntheticrender/templates/{drugs,blog-post}.html` for per-entity
patterns. Every template that emits a main item must use a full absolute
`itemtype` IRI so the parser (after A1's widening) accepts it as a main item.
Use the `fit:` vocabulary IRIs defined in `products/map/schema/rdf/` —
`https://www.forwardimpact.team/schema/rdf/<Type>`.

Files:

- `page.html` — shared HTML document shell. Renders `<!DOCTYPE html>`, `<head>`
  with `<title>`, and `<body>{{{body}}}</body>`. The parser requires a full
  document, not a fragment — this shell is what makes every entity file
  parseable by `MicrodataRdfParser`.
- `skill.html` — single skill as a `fit:Skill` main item. Properties: `name`,
  `description`, `capability` (as `fit:capability`), nested proficiency
  descriptions, related disciplines/tracks/drivers.
- `capability.html` — single capability as a `fit:Capability` main item, with
  its skills nested as child items under `itemprop="skill"`. Skills inside the
  capability template use the same attribute shape as `skill.html` — keep the
  inner markup DRY by extracting a `skill-inline.html` Mustache partial and
  including it with `{{> skill-inline}}` from both templates. Mustache partials
  are Mustache's third positional argument to `mustache.render`
  (`render(template, view, partials, config)`); `libtemplate` needs a new method
  to expose this (see A2c).
- `level.html` — `fit:Level` main item with `name`, `shortName`, `description`,
  `position`.
- `behaviour.html` — `fit:Behaviour` main item with name, description, maturity
  descriptions, linked drivers.
- `discipline.html` — `fit:Discipline` main item with specialization, skill tier
  references.
- `track.html` — `fit:Track` main item with skill modifiers as nested
  `fit:SkillModifier` items.
- `stage.html` — `fit:Stage` main item with position, description, constraints.
- `driver.html` — `fit:Driver` main item with description and contributing-skill
  links.
- `tool.html` — `fit:Tool` main item with name, url, description, useWhen. (The
  `tool` entity type here is the Pathway software tool referenced by skills,
  **not** an LLM tool — matching the terminology mitigation in the spec.)

Each per-entity template fills in the `body` slot of `page.html`. The renderer
(A2c) calls `page.html` with `{ title, body }` where `body` is the
already-rendered entity partial, following
`libraries/libsyntheticrender/render/html.js:17-24`.

#### A2b. View builders

**New directory:** `products/map/src/view-builders/`

Files:

- `index.js` — barrel exporting one builder per entity type.
- `skill.js` —
  `buildSkillView(skill, { capabilities, disciplines, tracks, drivers })`.
- `capability.js` —
  `buildCapabilityView(capability, { skills, disciplines, tracks, drivers })`.
- `level.js`, `behaviour.js`, `discipline.js`, `track.js`, `stage.js`,
  `driver.js`, `tool.js` — one per entity.

Each builder imports its IRI helpers from `../iri.js` (see below).

Each builder returns a plain object keyed to the placeholders in the matching
template. No HTML, no escaping — Mustache handles escaping with
`{{placeholder}}` (and `{{{placeholder}}}` for raw HTML, which this spec
deliberately avoids for any user-sourced field). IRIs can safely use
triple-braces because they are constructed from controlled entity IDs. Draw
inspiration from the existing `products/pathway/src/formatters/*/shared.js`
helpers (e.g. `prepareSkillDetail` at
`products/pathway/src/formatters/skill/shared.js:91`) for the shape of the
flattening, but do not import them — they live in pathway and will stay there
for the CLI's markdown output.

The builder output must include all IRI fields pre-computed:

```javascript
// buildSkillView output shape
{
  iri: "https://www.forwardimpact.team/schema/rdf/skill/python",
  id: "python",
  name: "Python",
  description: "...",
  capabilityIri: "https://www.forwardimpact.team/schema/rdf/capability/foundations",
  capabilityName: "Foundations",
  isHumanOnly: false,
  proficiencies: [
    { level: "foundational", description: "..." },
    { level: "working",      description: "..." },
    ...
  ],
  relatedDisciplines: [{ iri, id, name, skillType }, ...],
  relatedTracks:      [{ iri, id, name, modifier }, ...],
  relatedDrivers:     [{ iri, id, name }, ...],
}
```

Pre-computing IRIs in the builder keeps every template free of string
concatenation. The IRI constants used by builders come from a single **shared**
module `products/map/src/iri.js` (not under `view-builders/` — it is promoted to
the top level so Stream B can import it):

```javascript
export const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";
export const skillIri      = (id) => `${VOCAB_BASE}skill/${id}`;
export const capabilityIri = (id) => `${VOCAB_BASE}capability/${id}`;
export const levelIri      = (id) => `${VOCAB_BASE}level/${id}`;
export const behaviourIri  = (id) => `${VOCAB_BASE}behaviour/${id}`;
export const disciplineIri = (id) => `${VOCAB_BASE}discipline/${id}`;
export const trackIri      = (id) => `${VOCAB_BASE}track/${id}`;
export const stageIri      = (id) => `${VOCAB_BASE}stage/${id}`;
export const driverIri     = (id) => `${VOCAB_BASE}driver/${id}`;
export const toolIri       = (id) => `${VOCAB_BASE}tool/${id}`;

// Derived-entity IRIs (Stream B only)
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
```

Export the module from `@forwardimpact/map` via a new entry in
`products/map/package.json` exports: `"./iri": "./src/iri.js"`. Both Stream A's
view-builders and Stream B's `services/pathway/src/serialize.js` import from
`@forwardimpact/map/iri`, guaranteeing the two sides cannot drift. This
eliminates what would otherwise be a hidden cross-stream contract enforceable
only by eyeballing code review.

A mismatch in IRI shape silently breaks success criterion 3
(`ARGS="fit:Skill" just cli-subjects` returning all skills) because the graph
would hold two disconnected IRI families — making the shared module a structural
safeguard, not a convenience.

#### A2c. Renderer class

**New file:** `products/map/src/renderer.js`

Mirrors `libraries/libsyntheticrender/render/renderer.js`:

```javascript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import * as viewBuilders from "./view-builders/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Renderer {
  #templates;

  constructor(templateLoader) {
    if (!templateLoader) throw new Error("templateLoader is required");
    this.#templates = templateLoader;
  }

  renderSkill(skill, ctx) {
    const view  = viewBuilders.buildSkillView(skill, ctx);
    const body  = this.#templates.render("skill.html", view);
    return this.#templates.render("page.html", { title: view.name, body });
  }

  renderCapability(capability, ctx) {
    const view = viewBuilders.buildCapabilityView(capability, ctx);
    // renderWithPartials — capability.html uses {{> skill-inline}}
    const body = this.#templates.renderWithPartials(
      "capability.html",
      view,
      ["skill-inline.html"],
    );
    return this.#templates.render("page.html", { title: view.name, body });
  }

  renderLevel(level)                { /* level.html */ }
  renderBehaviour(behaviour, ctx)   { /* behaviour.html */ }
  renderDiscipline(discipline, ctx) { /* discipline.html */ }
  renderTrack(track, ctx)           { /* track.html */ }
  renderStage(stage)                { /* stage.html */ }
  renderDriver(driver, ctx)         { /* driver.html */ }
  renderTool(tool)                  { /* tool.html */ }
}

export function createRenderer() {
  const templateDir = join(__dirname, "..", "templates");
  return new Renderer(new TemplateLoader(templateDir));
}
```

**Deviation from precedent:**
`libraries/libsyntheticrender/render/renderer.js:118-122`'s
`createRenderer(logger)` takes a logger and stores it on the instance for the
`enrichHtml` path. Map's renderer has no equivalent async/LLM path and therefore
does not need a logger — dropping the argument is deliberate. If future work
adds logging to the render path (e.g. per-template timing metrics), reintroduce
the logger through the factory at that point.

**Mustache partials.** `capability.html` includes `{{> skill-inline}}`.
`libtemplate`'s current `TemplateLoader.render()` signature is
`render(name, data, dataDir)` (see `libraries/libtemplate/loader.js:54` and the
existing usage in `libraries/libtemplate/test/loader.test.js:139` —
`loader.render("page.html", { v: "!" }, dataDir)`). The third positional
argument is already `dataDir`, so we **cannot** add partials as a third
positional argument without a breaking change.

Extend the loader instead with a new method:
`renderWithPartials(name, data, partialNames, dataDir)`. It loads each partial
name through the existing `load()` method (preserving the two-tier user-override
fallback for partials too), builds a `{ [partialName]: partialBody }` map, and
forwards to `Mustache.render(template, data, partials)` (Mustache's third
argument; see `node_modules/mustache/mustache.js:751` —
`mustache.render(template, view, partials, config)`). The existing `render()`
method is unchanged and stays backward compatible.

Add a companion test in `libraries/libtemplate/test/loader.test.js` for the
`renderWithPartials` path, asserting that (a) a partial referenced via
`{{> partial}}` is resolved, (b) a partial under `{dataDir}/templates/`
overrides the package default, and (c) missing partials raise the same "Template
'...' not found" error that `load()` does.

`products/map/templates/skill-inline.html` holds the shared skill markup
referenced from both `skill.html` (wrapped in the main-item itemtype) and
`capability.html` (wrapped in `itemprop="skill"` nested scope). Keep the partial
a plain fragment — do not repeat the `itemscope`/`itemtype` attributes inside
it; the including template provides those.

**Tests:** `products/map/test/renderer.test.js`

- Construct a `Renderer` with a real `TemplateLoader` pointed at
  `products/map/templates/`.
- Render each entity type with a minimal fixture. Assert the output is a
  complete HTML document (starts with `<!DOCTYPE html>`).
- Parse each rendered document with N3 `MicrodataRdfParser` (already used by
  `libresource`) and assert the expected `fit:` subjects, predicates, and
  objects appear in the quad stream. Do not assert on raw HTML strings —
  Mustache whitespace changes would make those tests brittle. Quad assertions
  catch real semantic regressions.
- Assert the `capability.html` + `skill-inline.html` partial produces the same
  skill quads (modulo subject nesting) as a standalone `skill.html` render.

`products/map/test/view-builders/*.test.js`

- Unit tests for each view builder. Pure-function inputs and outputs, no
  template involvement. Assert IRI shape against `products/map/src/iri.js`.

`products/map/test/iri.test.js`

- Unit tests for each IRI constructor — round-trip construction, stability
  across calls, and VOCAB_BASE constant. These are short but important because
  both Stream A and Stream B now depend on this module's output being
  byte-identical.

#### A2d. Map package manifest updates

**File:** `products/map/package.json`

- Add `"@forwardimpact/libtemplate": "^0.2.0"` to `dependencies` (matching the
  version range `libsyntheticrender` uses).
- Add `"templates/"` to the top-level `files` array so the Mustache templates
  ship in the published npm tarball. Without this entry, external users running
  `npx fit-map export` against the installed package will hit the
  `Template '...' not found` error path in `libraries/libtemplate/loader.js:41`.
- Add two new export entries:
  - `"./renderer": "./src/renderer.js"` — downstream packages can import the
    `Renderer` directly if needed. Not strictly required by Stream A, but keeps
    the exports table consistent with the other factories (`./loader`,
    `./validation`, etc.).
  - `"./iri": "./src/iri.js"` — **required** so Stream B's
    `services/pathway/src/serialize.js` can import the shared IRI helpers.
    Without this entry Stream B cannot depend on Map's IRI constants and would
    have to duplicate them, reintroducing the drift risk this refactor
    eliminates.

No changes required to `main`, `bin`, or the existing `scripts` —
`fit-map export` wires into the existing CLI dispatcher in A4.

### A3. Implement export command

**New file:** `products/map/src/exporter.js`

Exports a factory `createExporter({ fs, renderer })` returning a class with:

```
async exportAll({ data, outputDir })
```

Behaviour:

1. Accept the already-loaded `data` object (discipline, level, track,
   capability, skill, behaviour, stage, driver, tool). The exporter is
   stateless; the CLI composition root in A4 is responsible for loading.
2. Compute the target directory `outputDir/pathway/`.
3. **Clear stale output**: `rm -rf outputDir/pathway/` before any write. This
   solves the "entity removed from YAML" drift problem — we don't try to diff,
   we regenerate from scratch. Fast and deterministic.
4. For each entity type, call the matching method on the injected `Renderer`
   (A2c) — e.g. `renderer.renderSkill(skill, ctx)` — which returns a complete
   HTML document (page shell already applied by the renderer). Write each result
   to `outputDir/pathway/<type>/<id>.html`.
5. Recursively mkdir as needed.
6. Capabilities are written with their skills nested inline via the
   `capability.html` template + `skill-inline.html` partial from A2a. The
   exporter does **not** concatenate HTML strings — template composition is the
   renderer's job.
7. Skills are **also** written as standalone files under
   `pathway/skill/<id>.html` so `get_subjects fit:Skill` enumerates them by
   direct IRI regardless of capability nesting.
8. Return `{ written: [...paths], skipped: [...], errors: [...] }`.
9. No filesystem writes outside `outputDir/pathway/`.

**New file:** `products/map/src/index.js` — add `createExporter` and
`createRenderer` factories alongside existing `createDataLoader`,
`createSchemaValidator`, `createIndexGenerator`.

**Tests:** `products/map/test/exporter.test.js`

- Fixture with a minimal discipline + level + capability + one skill + one
  behaviour + one stage + one driver + one tool.
- Assert each expected file is written to `outputDir/pathway/<type>/<id>.html`.
- Assert the written HTML parses via `MicrodataRdfParser` and produces quads
  whose subjects use the `https://www.forwardimpact.team/schema/rdf/`
  vocabulary.
- Assert idempotency: running twice yields identical bytes.
- Assert stale-cleanup: pre-seed `outputDir/pathway/skill/ghost.html`, run the
  exporter, assert `ghost.html` is gone.

### A4. Wire `fit-map export` CLI subcommand

**File:** `products/map/bin/fit-map.js`

- Add `export` as a new case in the `switch (command)` dispatcher (line 288),
  next to `case "validate":` (line 289). The existing `runValidate` function
  definition is at line 112 — model the new `runExport` function on its shape
  but place it adjacent, not inside the dispatcher.
- Resolve `dataDir` via `findDataDir`, resolve `outputDir` from
  `--output=<path>` or default to `<repo data root>/knowledge` — use the
  existing `Finder` pattern (construction at line 71, usage at line 19 for the
  import).
- Load data: `loader.loadAllData(dataDir)`. This returns
  `{ drivers, behaviours, skills, disciplines, tracks, levels, capabilities, stages, questions, framework }`,
  which covers every entity type the exporter writes. No additional loader calls
  are needed for export (the agent-specific `loadAgentData` /
  `loadSkillsWithAgentData` variants are only required by Stream B's derivation
  RPCs, not here).
- Add help text matching the docblock at the top of the file.
- Import `createExporter` and `createRenderer` lazily (consistent with
  `runValidate`). The CLI wires them together:
  `const exporter = createExporter({ fs, renderer: createRenderer() });`.
  `createRenderer()` from A2c is parameterless because the template directory is
  resolved relative to `products/map/` at module load time.
- Print summary: number of files written per entity type.
- Return exit code 0/1.

### A5. Justfile integration

**File:** `justfile`

Add recipe after `process-graphs` (line 96):

```
# Export framework entities to HTML/microdata
export-framework:
    bunx --workspace=@forwardimpact/map fit-map export
```

Chain it before `process-resources`:

```
process: export-framework process-agents process-resources process-tools process-graphs process-vectors
process-fast: export-framework process-agents process-resources process-tools process-graphs
```

`data-init` (line 101) already creates `data/knowledge` so no change needed.
`quickstart` (line 24) inherits the change transitively via `process-fast`.

## Stream B — Pathway derivation service

> **Note:** An earlier revision of this plan included a B0 step to add
> `products/map/schema/rdf/derivations.ttl` so `get_ontology` would describe
> `fit:Job`, `fit:AgentProfile`, etc. That step is dropped — see the Key
> Decisions section for the rationale. The pathway service emits those classes
> in its own Turtle responses; Guide learns them from tool descriptions, not
> from `get_ontology`.

### B1. Scaffold service package

**New directory:** `services/pathway/`

Files:

- `package.json` — `@forwardimpact/svcpathway`, dependencies on
  `@forwardimpact/librpc`, `@forwardimpact/libconfig`,
  `@forwardimpact/libtelemetry`, `@forwardimpact/libskill`,
  `@forwardimpact/map`, `@forwardimpact/libtype`, `@forwardimpact/libutil` (for
  `Finder` in the composition root — see B4), and `n3` (for Turtle
  serialization). Scripts: `"dev": "node --watch server.js"`, `"test"`. `files`
  array: `["proto/", "server.js"]` — matching the convention in
  `services/graph/package.json:28-31`. (Note: this pattern excludes `index.js`
  and `src/`, which is a pre-existing oddity across all services in this repo,
  not something this spec tries to fix.) Model on `services/graph/package.json`.
- `proto/pathway.proto` (see B2).
- `index.js` — `PathwayService` class (see B3).
- `src/serialize.js` — pure Turtle serializers (see B3).
- `server.js` — composition root (see B4).
- `test/service.test.js` — RPC tests that parse the returned Turtle.
- `test/serialize.test.js` — unit tests for the serializers.
- `README.md` not required.

### B2. Proto definition

**New file:** `services/pathway/proto/pathway.proto`

```proto
syntax = "proto3";

package pathway;

import "common.proto";
import "tool.proto";

service Pathway {
  rpc ListJobs(ListJobsRequest) returns (tool.ToolCallResult);
  rpc DescribeJob(DescribeJobRequest) returns (tool.ToolCallResult);
  rpc ListAgentProfiles(ListAgentProfilesRequest) returns (tool.ToolCallResult);
  rpc DescribeAgentProfile(DescribeAgentProfileRequest) returns (tool.ToolCallResult);
  rpc DescribeProgression(DescribeProgressionRequest) returns (tool.ToolCallResult);
  rpc ListJobSoftware(ListJobSoftwareRequest) returns (tool.ToolCallResult);
}

message ListJobsRequest {
  optional string discipline = 1;
}

message DescribeJobRequest {
  string discipline = 1;
  string level = 2;
  optional string track = 3;
}

message ListAgentProfilesRequest {
  optional string discipline = 1;
}

message DescribeAgentProfileRequest {
  string discipline = 1;
  string track = 2;
  // Optional stage id (e.g. "intern", "established"). If omitted, the
  // service returns every stage profile for the discipline×track.
  optional string stage = 3;
}

message DescribeProgressionRequest {
  string discipline = 1;
  string from_level = 2;
  string to_level = 3;
  optional string track = 4;
}

message ListJobSoftwareRequest {
  string discipline = 1;
  string level = 2;
  optional string track = 3;
}
```

Codegen (`just codegen` / `fit-codegen`) picks this up automatically — libtype
exposes `pathway.*` message types after generation.

### B3. Service class

**New file:** `services/pathway/index.js`

```javascript
import { services } from "@forwardimpact/librpc";
import {
  generateAllJobs,
  getValidLevelTrackCombinations,
  deriveJob,
  deriveReferenceLevel,
  deriveAgentSkills,
  deriveAgentBehaviours,
  analyzeProgression,
  analyzeCustomProgression,
  deriveToolkit,
  generateStageAgentProfile,
} from "@forwardimpact/libskill";

const { PathwayBase } = services;

export class PathwayService extends PathwayBase {
  #data;
  #agentData;
  #skillsWithAgent;

  /**
   * @param {ServiceConfig} config
   * @param {object} bundle
   * @param {object} bundle.data              - loadAllData() output
   * @param {object} bundle.agentData         - loadAgentData() output
   * @param {Array}  bundle.skillsWithAgent   - loadSkillsWithAgentData() output
   */
  constructor(config, { data, agentData, skillsWithAgent }) {
    super(config);
    if (!data) throw new Error("data is required");
    if (!agentData) throw new Error("agentData is required");
    if (!skillsWithAgent) throw new Error("skillsWithAgent is required");
    this.#data = data;
    this.#agentData = agentData;
    this.#skillsWithAgent = skillsWithAgent;
  }

  async ListJobs(req) { /* delegates to generateAllJobs */ }
  async DescribeJob(req) { /* delegates to deriveJob */ }
  async ListAgentProfiles(req) { /* enumerates disciplines × tracks */ }
  async DescribeAgentProfile(req) { /* calls generateStageAgentProfile per stage */ }
  async DescribeProgression(req) { /* analyzeProgression / analyzeCustomProgression */ }
  async ListJobSoftware(req) { /* deriveJob → deriveToolkit */ }
}
```

**libskill call signatures** (verified against
`libraries/libskill/derivation.js`, `agent.js`, `progression.js`, `toolkit.js`):

| RPC                    | libskill calls (in order)                                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListJobs`             | `generateAllJobs({ disciplines, levels, tracks, skills, behaviours, validationRules })` — no `capabilities` arg. Filter the returned array by `req.discipline` if provided.                                                                                                                                    |
| `DescribeJob`          | `deriveJob({ discipline, level, track, skills, behaviours, capabilities, validationRules })` — `capabilities` **is** an arg here (it feeds `deriveResponsibilities`). `deriveJob` reads `validationRules.levels` internally (see `libraries/libskill/derivation.js:334`); do not pass a separate `levels` key. |
| `ListAgentProfiles`    | Loop `for (const d of data.disciplines)` calling `getValidLevelTrackCombinations({ discipline: d, levels, tracks })`, then reduce to unique `(discipline, track)` pairs. `getValidLevelTrackCombinations` requires `discipline` — there is no "all disciplines" short-circuit.                                 |
| `DescribeAgentProfile` | See dedicated section below.                                                                                                                                                                                                                                                                                   |
| `DescribeProgression`  | `analyzeProgression(currentJob, targetJob)` when same discipline/track, else `analyzeCustomProgression({ currentJob, targetJob })`. Both sides are materialized via `deriveJob` first.                                                                                                                         |
| `ListJobSoftware`      | `deriveJob(...)` to get `skillMatrix`, then `deriveToolkit({ skillMatrix, skills })`.                                                                                                                                                                                                                          |

Notes:

- `validationRules` must be sourced from `data.framework.validationRules` (see
  `products/pathway/src/commands/job.js:307` for the canonical reference).
  Passing `undefined` silently disables validation — do not do this.
- `generateAllJobs` returns full `JobDefinition` objects with skill matrices; do
  **not** serialize the matrices in `ListJobs`. The list serializer emits only
  `fit:Job`, `rdfs:label`, `fit:discipline`, `fit:level`, `fit:track` per job.
  Matrix detail is reserved for `DescribeJob`.

**`DescribeAgentProfile` composition.** The actual flow in
`products/pathway/src/commands/agent.js` builds stage-specific profiles via
`generateStageAgentProfile({ ...stageParams, stage })`. The earlier revision of
this plan described a non-existent
`deriveReferenceLevel → deriveAgentSkills → deriveAgentBehaviours` flow that is
only used for the `--skills` / `--tools` short paths. The correct implementation
mirrors `runAgentCommand` lines 437–498:

1. Resolve `humanDiscipline`, `humanTrack`, `agentDiscipline`, `agentTrack` from
   `req.discipline` + `req.track` against `data` and `agentData` (port
   `resolveAgentEntities` from `agent.js`, or expose it from a shared module).
2. `level = deriveReferenceLevel(data.levels)`.
3. Build `stageParams`:
   ```javascript
   const stageParams = {
     discipline: humanDiscipline,
     track: humanTrack,
     level,
     skills: skillsWithAgent,    // from loadSkillsWithAgentData
     behaviours: data.behaviours,
     agentBehaviours: agentData.behaviours,
     agentDiscipline,
     agentTrack,
     stages: data.stages,
   };
   ```
4. If `req.stage` is set: resolve the stage object from `data.stages`, call
   `generateStageAgentProfile({ ...stageParams, stage })`, serialize the single
   profile.
5. If `req.stage` is unset: map across `data.stages`, call
   `generateStageAgentProfile` for each, serialize as a list of
   `fit:AgentProfile` nodes each linked to their `fit:stage`.

**Why `skillsWithAgent` is mandatory.** `loadAllData` destructures each skill
into a limited set of fields and drops `human` (see
`products/map/src/loader.js:102-127`). `loadSkillsWithAgentData` instead spreads
the full raw YAML skill into each output entry (`loader.js:432-435`) and is the
shape `generateStageAgentProfile` expects when walking per-stage skill matrices.
The service must receive both `data` (via `loadAllData`) and `skillsWithAgent`
(via `loadSkillsWithAgentData`) and pass the latter in `stageParams.skills`, not
`data.skills`.

**Output format: Turtle RDF in the `content` field.** Each RPC returns
`{ content: <turtle-string> }`. This matches the existing `GetOntology` pattern
(`services/graph/index.js:60` — returns `ontology.ttl` Turtle as `content`) and,
crucially, makes derived results speak the same vocabulary as the graph-indexed
base entities from Stream A. The LLM can then pattern the response against
vocabulary it already learned from `get_ontology` / `get_subjects` and issue
follow-up `query_by_pattern` calls against the graph for related base entities.

Why RDF and not markdown:

- **Pipeline coherence.** Base entities exported by Stream A flow through
  `libresource` → `libgraph` as Turtle quads under the `fit:` namespace
  (`libraries/libresource/parser.js:74` — `quadsToRdf` uses N3 `Writer` with
  `format: "Turtle"`). If the service emitted markdown, Guide would have two
  incompatible views of the same vocabulary and could not chain derived results
  into graph queries.
- **Follow-up queries.** When Guide sees a skill IRI like
  `https://www.forwardimpact.team/schema/rdf/skill/python` in a `DescribeJob`
  response, it can immediately issue
  `query_by_pattern(subject=<iri>, predicate="?", object="?")` against the graph
  to pull the base skill definition, stage handoffs, capability membership,
  toolReferences, etc. Markdown kills that flywheel.
- **Existing convention.** `GetOntology` returns Turtle in `content` today. The
  `identifiers` field (Pattern B) is not usable here because derived entities
  are not persisted to `ResourceIndex` (spec: "No materialization of derived
  entities into the RDF graph") — nothing for the Agent's `hands.js:178`
  resource loader to fetch. Turtle in `content` is the only viable option that
  keeps graph-compatible vocabulary visible to the LLM.

**Vocabulary:** The service emits IRIs under the same
`https://www.forwardimpact.team/schema/rdf/` namespace used by the Stream A
templates and the TTL schemas in `products/map/schema/rdf/`. For base-entity
references (skill, behaviour, level, discipline, track, stage, driver, tool)
**import the IRI helpers from `@forwardimpact/map/iri`** (the shared module
introduced in A2b) — both Stream A's view-builders and this serializer draw from
the same constructors, so drift is structurally impossible. Derived-entity IRI
helpers (`jobIri`, `agentProfileIri`, `progressionIri`) also live in that same
shared module.

For derived-entity classes and predicates, this spec introduces an ad-hoc
vocabulary that lives **only** in pathway service responses and `tools.yml`
descriptions (not in SHACL). Stream A templates must **never** emit any of the
derived-entity types from the table below — `fit:Job`, `fit:AgentProfile`,
`fit:Progression`, `fit:SkillProficiency`, `fit:SkillChange`,
`fit:BehaviourChange`, `fit:SkillModifier` — otherwise the resource processor
would materialize them into the graph, violating the spec's "No materialization
of derived entities" constraint. A2a's renderer test suite should include a
negative assertion: parse every rendered Stream A document and confirm no
subject is typed with any of these classes.

Classes and predicates used per RPC:

| Response               | Classes                                                                         | Key predicates                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ListJobs`             | `fit:Job`                                                                       | `fit:discipline`, `fit:level`, `fit:track`, `rdfs:label`                                                                                                                       |
| `DescribeJob`          | `fit:Job`, blank-node `fit:SkillProficiency` entries                            | `fit:discipline`, `fit:level`, `fit:track`, `fit:skillMatrix`, `fit:skill`, `fit:proficiency`, `fit:behaviourProfile`, `fit:behaviour`, `fit:maturity`, `fit:responsibilities` |
| `ListAgentProfiles`    | `fit:AgentProfile`                                                              | `fit:discipline`, `fit:track`                                                                                                                                                  |
| `DescribeAgentProfile` | `fit:AgentProfile`, optional `fit:stage`                                        | `fit:discipline`, `fit:track`, `fit:stage`, `fit:agentSkill`, `fit:agentBehaviour`, `fit:frontmatter` (as JSON literal)                                                        |
| `DescribeProgression`  | `fit:Progression`, blank-node `fit:SkillChange` / `fit:BehaviourChange` entries | `fit:fromJob`, `fit:toJob`, `fit:change`, `fit:skill`, `fit:behaviour`, `fit:fromProficiency`, `fit:toProficiency`, `fit:changeKind`                                           |
| `ListJobSoftware`      | `fit:Job`                                                                       | `fit:software` (object = `fit:Tool` IRI), `rdfs:label`                                                                                                                         |

IRIs follow the convention:

```
https://www.forwardimpact.team/schema/rdf/job/<discipline>/<level>[/<track>]
https://www.forwardimpact.team/schema/rdf/agent-profile/<discipline>/<track>[/<stage>]
https://www.forwardimpact.team/schema/rdf/progression/<discipline>/<from>-<to>[/<track>]
https://www.forwardimpact.team/schema/rdf/skill/<skillId>    ← matches Stream A
https://www.forwardimpact.team/schema/rdf/stage/<stageId>    ← matches Stream A
```

**Progression RDF — worked example.** `analyzeProgression` returns an object
shaped `{ current, target, skillChanges[], behaviourChanges[], summary }`, where
each entry in `skillChanges[]` has fields like
`{ skillId, change, isGained, isLost, fromProficiency, toProficiency }`. The
serializer maps one `skillChange` entry to a blank node:

```turtle
@prefix fit: <https://www.forwardimpact.team/schema/rdf/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<https://www.forwardimpact.team/schema/rdf/progression/fde/l2-l3/forward_deployed>
  a fit:Progression ;
  fit:fromJob <.../job/fde/l2/forward_deployed> ;
  fit:toJob   <.../job/fde/l3/forward_deployed> ;
  fit:skillChange [
    a fit:SkillChange ;
    fit:skill <.../skill/python> ;
    fit:fromProficiency "working" ;
    fit:toProficiency   "practitioner" ;
    fit:change 1 ;
    fit:changeKind "increased"
  ] ;
  fit:skillChange [
    a fit:SkillChange ;
    fit:skill <.../skill/cloud-architecture> ;
    fit:toProficiency "foundational" ;
    fit:changeKind "gained"
  ] .
```

`changeKind` is derived from the existing `isGained`/`isLost`/`change` fields:
`isGained → "gained"`, `isLost → "lost"`, `change > 0 → "increased"`,
`change < 0 → "decreased"`, `change === 0 → "unchanged"`. Never invent a
predicate that does not correspond to a direct field on the libskill output;
that way the RDF shape stays a mechanical projection of the derivation result.

**Serialization helper:** Add `services/pathway/src/serialize.js` with pure
functions per shape:

```javascript
export function jobToTurtle(job) { ... }
export function jobListToTurtle(jobs) { ... }
export function agentProfileToTurtle(profile) { ... }
export function agentProfileListToTurtle(profiles) { ... }
export function progressionToTurtle(progression) { ... }
export function jobSoftwareToTurtle(job, toolkit) { ... }
```

Each returns a Turtle string using the N3 `Writer` from the `n3` package — add
`n3` as a direct dependency of `services/pathway/package.json`, matching the
convention in `services/graph/package.json`. (It is already present in the
monorepo via libresource/libgraph, but service packages depend on it
explicitly.) IRI conventions are listed in the Vocabulary table above —
deterministic, stable, and easy for the LLM to compose.

Keep the service class thin: each RPC calls libskill, hands the result to the
matching serializer, and returns `{ content: turtle }`. Do not import
`products/pathway/src/formatters/` — those siblings produce human-facing
markdown, which is the wrong shape for this interface.

**Tests:** `services/pathway/test/service.test.js`

- Construct `PathwayService` with a hand-built `data` object and call each RPC.
- Parse the returned `content` with the N3 `Parser` (Turtle) and assert the
  expected quads are present — subject IRIs, predicates, object values. This
  verifies vocabulary, not string formatting.
- Assert round-trip: parse → re-serialize produces a stable set of quads.
- Assert IRIs use the `fit:` namespace and follow the conventions above.

`services/pathway/test/serialize.test.js`

- Unit tests for each pure serializer function in `src/serialize.js`, with small
  fixtures and exact quad assertions.

### B4. Composition root

**New file:** `services/pathway/server.js`

```javascript
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDataLoader } from "@forwardimpact/map";
import { Finder } from "@forwardimpact/libutil";
import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";
import { PathwayService } from "./index.js";

const config = await createServiceConfig("pathway");
const logger = createLogger("pathway");
const tracer = await createTracer("pathway");

// Resolve the pathway data directory using the same rules as
// fit-pathway: walk up from cwd using Finder. If the runtime needs a
// custom data_dir override, set SERVICE_PATHWAY_DATA_DIR in the env
// (libconfig picks it up automatically) and the composition root can
// branch on config.dataDir.
const finder = new Finder(fs, logger, process);
const dataDir = config.dataDir
  ? String(config.dataDir)
  : join(finder.findData("data", homedir()), "pathway");

// Three-call load sequence matching products/pathway/src/commands/agent.js
// lines 411-413. loadAllData produces a destructured per-skill shape
// that omits `human` (see loader.js:102-127), while
// loadSkillsWithAgentData spreads the full raw skill and is the shape
// generateStageAgentProfile expects when walking per-stage skill
// matrices. Both `data` and `skillsWithAgent` are required.
const loader = createDataLoader();
const data = await loader.loadAllData(dataDir);
const agentData = await loader.loadAgentData(dataDir);
const skillsWithAgent = await loader.loadSkillsWithAgentData(dataDir);

const service = new PathwayService(config, {
  data,
  agentData,
  skillsWithAgent,
});
const server = new Server(service, config, logger, tracer);
await server.start();
```

If any of the three loader calls throws or the directory is missing, let the
exception propagate — `fit-rc` treats an unhandled startup rejection as a hard
failure, per spec: "rejects startup if the data directory is missing".

### B5. Register service in init, env files, and endpoints

**How service host/port actually resolves.** `config/config.example.json` does
**not** store per-service host/port blocks — there is no `service.graph`,
`service.vector`, or similar section (verified: only `service.map`,
`service.agent`, `service.llm`, `service.memory`, and `service.tool` exist).
Service transport config comes from environment variables in the three
`.env*.example` files, which `libraries/libconfig/config.js` merges via the
`SERVICE_{NAME}_URL` pattern. The tool service reads these URLs to create gRPC
clients for each endpoint's `pathway.Pathway.*` method string. Without a
`SERVICE_PATHWAY_URL` entry, `createServiceConfig("pathway")` falls back to
libconfig's defaults (host `0.0.0.0`, port `3000`, see
`libconfig/config.js:85-86`) and the pathway server will bind to 3000 —
colliding with any other default-port service.

**File:** `config/config.example.json`

1. Append to `init.services` array (after `graph`, before `llm`):

```json
{
  "name": "pathway",
  "command": "bun run --filter @forwardimpact/svcpathway dev"
}
```

2. **Do not** add a `service.pathway` block with `host`/`port` — that pattern
   does not exist in this repo. Host and port are set by env vars (step 3
   below). If per-service config beyond transport ever becomes necessary (e.g.
   `data_dir`), add a `service.pathway` block for those fields only, modeled on
   the existing `service.map` block shape. The `data_dir` override is not
   strictly required because B4's composition root resolves it via `Finder`.

3. **Files:** `.env.local.example`, `.env.docker-native.example`,
   `.env.docker-supabase.example`

   Append `SERVICE_PATHWAY_URL` to each. Pick a free port — existing allocations
   in `.env.local.example:65-71` use 3002-3008 for
   agent/memory/llm/vector/graph/tool/trace, and line 106 reserves 3009 for an
   optional `hash` service. Use port `3010`. Add the line (next to the other
   `SERVICE_*_URL` entries):

   ```
   SERVICE_PATHWAY_URL=grpc://localhost:3010
   ```

   Apply the identical line to all three `.env*.example` files. libconfig's
   env-merge (`config.js:93-104`) maps `SERVICE_PATHWAY_URL` to the pathway
   server's bind address and to every other service's client lookup for
   `pathway.Pathway.*` methods.

4. Append to `service.tool.endpoints`:

```json
"pathway_list_jobs": {
  "method": "pathway.Pathway.ListJobs",
  "request": "pathway.ListJobsRequest"
},
"pathway_describe_job": {
  "method": "pathway.Pathway.DescribeJob",
  "request": "pathway.DescribeJobRequest"
},
"pathway_list_agent_profiles": {
  "method": "pathway.Pathway.ListAgentProfiles",
  "request": "pathway.ListAgentProfilesRequest"
},
"pathway_describe_agent_profile": {
  "method": "pathway.Pathway.DescribeAgentProfile",
  "request": "pathway.DescribeAgentProfileRequest"
},
"pathway_describe_progression": {
  "method": "pathway.Pathway.DescribeProgression",
  "request": "pathway.DescribeProgressionRequest"
},
"pathway_list_job_software": {
  "method": "pathway.Pathway.ListJobSoftware",
  "request": "pathway.ListJobSoftwareRequest"
}
```

**File:** `products/guide/starter/config.json` — apply the identical
`init.services` and `service.tool.endpoints` changes so `npx fit-guide --init`
produces a ready-to-run config.

**Files:** any `.env*.example` that ships with the fit-guide starter (check
`products/guide/starter/` for parallel env fixtures) — mirror the
`SERVICE_PATHWAY_URL=grpc://localhost:3010` addition.

### B6. Tool descriptions

**File:** `config/tools.example.yml`

Append six entries following the existing `get_ontology` / `get_subjects` shape.
Each entry's `instructions` and `evaluation` must state that the tool returns
**Turtle RDF using the `fit:` vocabulary** so the LLM knows to treat the result
as graph-compatible data and can chain into `query_by_pattern`. Example
`evaluation` phrasing:

> Turtle RDF describing the job using the `fit:` vocabulary. Skill and behaviour
> IRIs can be passed to `query_by_pattern` or `get_subjects` to retrieve base
> definitions from the graph.

Each `purpose` and `applicability` block must additionally include the
disambiguation sentence from spec § Terminology Risk. Concretely:

- `pathway_list_agent_profiles.purpose` / `.applicability` must contain:
  > "Pathway agent profiles are static role descriptions in framework data —
  > they are NOT runnable LLM sub-agents. Use `list_sub_agents` for delegation."
- `pathway_describe_agent_profile` — same disambiguation sentence.
- `pathway_list_job_software.purpose` / `.applicability` must contain:
  > "This lists software technologies used by the job (Python, Figma, etc.) —
  > NOT the LLM tools available to you."

`pathway_list_jobs`, `pathway_describe_job`, `pathway_describe_progression` do
not collide with Guide's meta-vocabulary but should still use the `pathway_*`
prefix language in their descriptions to signal scope.

Parameter entries match the proto request fields.

**File:** `products/guide/starter/tools.yml` — mirror the same six entries.

### B7. Integration tests

Two integration tests are required for this spec. Neither is optional — they are
the automated form of success criteria 2, 7, and 8.

**File:** `services/pathway/test/integration.test.js`

- Start `PathwayService` in-process with real pathway data (`data/pathway` from
  the repo root, resolved via `Finder`).
- Call `DescribeJob` with inputs matching
  `npx fit-pathway job <discipline> <level> --track=<track>`. Parse the returned
  Turtle and assert:
  - `fit:Job` subject exists with the expected IRI.
  - The set of `fit:skill` IRIs in the skill matrix equals the set of skill IDs
    the CLI reports for the same inputs (compare to `deriveJob(...).skillMatrix`
    directly — this guarantees parity with libskill without depending on CLI
    output formatting).
  - Each `fit:proficiency` literal matches the corresponding CLI value.
- Call `DescribeProgression` with the same inputs as
  `npx fit-pathway progress <discipline> <from> <to> --track=<track>`. Parse the
  Turtle and compare the set of `fit:SkillChange` blank nodes to
  `analyzeProgression(...).skillChanges` field-by-field.

**File:** `products/map/test/pipeline.test.js`

End-to-end test for Stream A's export → resource → graph flow. This covers
success criterion 2 which no existing test touches.

- Fixture pathway data directory with one discipline, one level, one capability,
  one skill.
- Temporary `data/knowledge/`, `data/resources/`, `data/graphs/` directories.
- Call `createExporter(...).exportAll(...)` → confirm HTML landed.
- Invoke `libresource` `ResourceProcessor` programmatically on the fixture
  knowledge dir → confirm resources contain Turtle with `fit:` subjects.
- Invoke `libgraph` `GraphProcessor` programmatically → confirm
  `GraphIndex.getSubjects("fit:Skill")` returns the fixture skill. This also
  exercises A1b's `RDF_PREFIXES` entry — if `fit` is not registered, the query
  degrades to a literal term and this assertion fails.
- This test asserts A1 (parser widening), A1b (graph prefix), and the exporter's
  HTML shape together produce queryable subjects. If it fails after a refactor,
  debugging one step at a time is still possible via the earlier per-unit tests.

## Verification against success criteria

| #   | Criterion                                                | How verified                                   |
| --- | -------------------------------------------------------- | ---------------------------------------------- |
| 1   | `fit-map export` produces HTML in `data/knowledge/`      | A4 CLI + A3 exporter tests                     |
| 2   | `just cli-subjects` lists `fit:*` types                  | A1 + A1b + A5 + B7 pipeline test               |
| 3   | `ARGS="fit:Skill" just cli-subjects` returns all         | Same; manual after `just quickstart`           |
| 4   | `npx fit-guide --init` emits pathway endpoints           | B5 starter config edit; fresh-dir manual check |
| 5   | `npx fit-rc status` shows pathway running, tools resolve | B1–B5 end-to-end; manual check                 |
| 6   | Guide answers "what skills..." via graph path            | A stream end-to-end; manual LLM check          |
| 7   | Guide answers L3 FDE question matching fit-pathway       | B7 `DescribeJob` integration test              |
| 8   | Guide answers progression delta matching fit-pathway     | B7 `DescribeProgression` integration test      |
| 9   | Adversarial terminology probes pass                      | B6 disambiguation sentences; manual LLM check  |

## Out of scope reminders (from spec)

- No new derivation logic — service is pure transport.
- No interview question tool.
- No agent prompt changes beyond advertising the new tools.
- No materialization of derived entities into the graph.
- No web UI for the pathway service.

## File summary

**Created:**

- `products/map/templates/page.html` (shared HTML document shell)
- `products/map/templates/skill-inline.html` (Mustache partial)
- `products/map/templates/{skill,capability,level,behaviour,discipline,track,stage,driver,tool}.html`
- `products/map/src/iri.js` (shared IRI helpers — consumed by both Stream A
  view-builders and Stream B serialize.js; exported as `@forwardimpact/map/iri`)
- `products/map/src/view-builders/index.js` (barrel)
- `products/map/src/view-builders/{skill,capability,level,behaviour,discipline,track,stage,driver,tool}.js`
- `products/map/src/renderer.js` (`Renderer` class + `createRenderer`)
- `products/map/src/exporter.js`
- `products/map/test/renderer.test.js` (quad-level assertions via
  `MicrodataRdfParser`)
- `products/map/test/view-builders/*.test.js` (per-builder unit tests)
- `products/map/test/iri.test.js` (shared IRI helpers)
- `products/map/test/exporter.test.js`
- `products/map/test/pipeline.test.js` (end-to-end export → resource → graph)
- `services/pathway/package.json`
- `services/pathway/proto/pathway.proto`
- `services/pathway/index.js`
- `services/pathway/src/serialize.js`
- `services/pathway/server.js`
- `services/pathway/test/service.test.js`
- `services/pathway/test/serialize.test.js`
- `services/pathway/test/integration.test.js`

**Modified:**

- `libraries/libresource/parser.js` (A1 — prefix filter widening)
- `libraries/libresource/test/parser.test.js`
- `libraries/libgraph/index.js` (A1b — add `fit:` to `RDF_PREFIXES`)
- `libraries/libgraph/test/prefixes.test.js` — new or extended file covering the
  `fit:` prefix resolution (A1b)
- `libraries/libtemplate/loader.js` (A2c — add `renderWithPartials` method;
  `render()` stays backward compatible)
- `libraries/libtemplate/test/loader.test.js` (partials test)
- `products/map/package.json` (add `@forwardimpact/libtemplate` dep, add
  `templates/` to `files`, add `./renderer` and `./iri` exports)
- `products/map/bin/fit-map.js` (add `export` subcommand — dispatcher at line
  288, `case "validate":` at 289; `Finder` construction precedent at line 71,
  not 70)
- `products/map/src/index.js` (export `createExporter`, `createRenderer`)
- `products/pathway/src/formatters/index.js` (mechanical removal of the
  microdata re-export lines: `export * from "./microdata-shared.js"` plus the
  seven `export { ...ToMicrodata } from "./{entity}/microdata.js"` lines — one
  each for skill, behaviour, discipline, track, level, stage, driver. The file
  itself stays because it still re-exports the DOM and markdown formatters the
  CLI uses.)
- `justfile` (add `export-framework`; chain into `process` / `process-fast`)
- `config/config.example.json` (B5 — `init.services` entry + six
  `service.tool.endpoints` entries. Do **not** add a `service.pathway` host/port
  block — host/port come from env vars.)
- `.env.local.example` (B5 — `SERVICE_PATHWAY_URL=grpc://localhost:3010`)
- `.env.docker-native.example` (B5 — same)
- `.env.docker-supabase.example` (B5 — same)
- `config/tools.example.yml` (six new entries)
- `products/guide/starter/config.json` (mirror example)
- `products/guide/starter/tools.yml` (mirror example)
- Any `.env*.example` files in `products/guide/starter/` (mirror the
  `SERVICE_PATHWAY_URL` addition if present)

**Deleted:**

- `products/pathway/src/formatters/microdata-shared.js`
- `products/pathway/src/formatters/{skill,behaviour,discipline,track,level,stage,driver}/microdata.js`
  — these are dead code at the pathway product's boundary, re-exported by
  `products/pathway/src/formatters/index.js` but not imported by any pathway
  runtime consumer (verified: zero matches for `ToMicrodata` or
  `microdata-shared` outside the `formatters/` directory across the entire
  monorepo). The `tool/` subdirectory has no `microdata.js` file (only
  `shared.js`), and there is no `capability/` subdirectory — so nothing to
  delete in those two cases. The sibling `markdown.js`, `dom.js`, and
  `shared.js` files **stay** in pathway; they power the CLI's human-facing
  output.
- Corresponding microdata-only test files under
  `products/pathway/test/formatters/` (if present). Their coverage is replaced
  by `products/map/test/renderer.test.js` and
  `products/map/test/view-builders/*.test.js`.
