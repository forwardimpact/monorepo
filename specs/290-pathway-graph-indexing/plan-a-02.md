# Plan: 290 — Stream A: Map HTML Export

> **Part 2 of 3.** Read [plan-a.md](plan-a.md) for the overall decomposition.
>
> **Depends on:** [plan-a-01.md](plan-a-01.md) — must be merged
> first. This plan imports `@forwardimpact/map/iri` and uses
> `TemplateLoader.renderWithPartials()`, both introduced there. It also relies
> on F1 (parser widening) and F2 (graph prefix) for the end-to-end pipeline test
> to pass.
>
> **Independent of:** [plan-a-03.md](plan-a-03.md) —
> Stream A and Stream B can land in either order after foundation.

## Scope

Add the `fit-map export` command that reads `data/pathway/` YAML and renders one
HTML microdata file per base entity (skill, capability, level, behaviour,
discipline, track, stage, driver, tool) into `data/knowledge/pathway/`. The
existing resource processor and graph processor pick the files up unchanged,
indexing every base entity into the RDF graph under the `fit:` namespace.

This satisfies spec success criteria 1, 2, 3, and 6.

## Key decisions

- **Render HTML via Mustache templates loaded through
  `@forwardimpact/libtemplate`**, not by promoting the existing JavaScript
  microdata formatters. `libraries/libsyntheticrender/` is the existing
  precedent: it owns a `templates/` directory of Mustache `.html` files, wraps
  them in a single `page.html` shell, and renders through
  `TemplateLoader.render(name, view)` (see
  `libraries/libsyntheticrender/render/html.js:17-24` for the `page()` shell
  helper and `libraries/libsyntheticrender/render/renderer.js:118-122` for the
  `createRenderer()` wiring). The same shape is applied to Map: one Mustache
  template per base entity type under `products/map/templates/`, a thin
  `Renderer` class in `products/map/src/renderer.js` that holds a
  `TemplateLoader` and exposes one method per entity, and small pure
  view-builder functions that transform raw YAML entities into the flat data
  shape the templates consume.

  Do **not** reuse `libsyntheticrender/templates/` — its templates bind to
  `schema.org/*` classes and entity shapes specific to synthetic organization
  data. We reuse the _pattern_ (templates + `TemplateLoader` + `page.html`
  shell), not the template bodies.

- **Delete the dead microdata formatters in pathway.** The existing
  `products/pathway/src/formatters/*/microdata.js` files and
  `microdata-shared.js` are dead code at the pathway product's boundary — they
  are re-exported from `products/pathway/src/formatters/index.js` but no pathway
  runtime importer consumes them (verified with
  `grep -rn "ToMicrodata\|microdata-shared" products/pathway/src` outside the
  `formatters/` directory returns zero hits). Removing them leaves only the
  `dom.js`, `markdown.js`, and `shared.js` siblings, which continue to power the
  pathway CLI's human-facing output.

- **Draw inspiration from pathway formatters' shared helpers, do not import
  them.** The `prepareSkillsList` / `prepareSkillDetail` helpers under
  `products/pathway/src/formatters/skill/shared.js` are data-shape transforms
  that do not depend on any HTML helpers. The new view-builders in Map perform
  the same "raw YAML entity → flat view model" flattening, but live in
  `products/map/src/view-builders/` and are written fresh against the template
  placeholders each template expects. Pathway keeps its own view-builders for
  the CLI's markdown/DOM paths.

- **One HTML file per entity** written to
  `data/knowledge/pathway/<type>/<id>.html`. The subdirectory isolates generated
  files from hand-authored knowledge and makes `data-clean`-then-regenerate
  idempotent. The exporter deletes the `data/knowledge/pathway/` tree at the
  start of each run so stale entries left over from deleted YAML entries do not
  leak into the resource processor.

- **Skills written twice — nested inside capability and standalone.**
  Capabilities are written with their skills nested inline via the
  `capability.html` template + `skill-inline.html` partial. Skills are also
  written as standalone files under `pathway/skill/<id>.html` so
  `get_subjects fit:Skill` enumerates them by direct IRI regardless of
  capability nesting.

## Steps

### A2. Mustache templates, view builders, and renderer

The rendering engine is new code in Map. It has three layers:

1. **Mustache templates** under `products/map/templates/` — one per entity type
   plus a shared page shell. These files hold all HTML markup and
   `itemtype`/`itemprop` attributes.
2. **View builders** under `products/map/src/view-builders/` — pure functions
   that transform raw YAML entities into the flat view model each template
   expects.
3. **Renderer class** `products/map/src/renderer.js` — thin wrapper around
   `TemplateLoader`, exposing one method per entity type.

#### A2a. Templates

**New directory:** `products/map/templates/`

Create one file per base entity, plus a page shell. Follow
`libraries/libsyntheticrender/templates/page.html` for the shell shape and
`libraries/libsyntheticrender/templates/{drugs,blog-post}.html` for per-entity
patterns. Every template that emits a main item must use a full absolute
`itemtype` IRI so the parser (after foundation F1's widening) accepts it as a
main item. Use the `fit:` vocabulary IRIs from `products/map/schema/rdf/` —
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
  including it with `{{> skill-inline}}` from both templates. (The
  `renderWithPartials` method that makes this work was added in foundation step
  F4.)
- `skill-inline.html` — Mustache partial holding the shared skill markup
  referenced from both `skill.html` (wrapped in the main-item itemtype) and
  `capability.html` (wrapped in `itemprop="skill"` nested scope). Keep the
  partial a plain fragment — do not repeat the `itemscope`/`itemtype` attributes
  inside it; the including template provides those.
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

**Negative constraint.** No template in this directory may emit any of the IRIs
in `DERIVED_ENTITY_TYPES` (exported from `@forwardimpact/map/iri` — see
foundation step F3) as a main `itemtype`. Those classes belong to Stream B's
derived-entity vocabulary and are emitted only by the pathway service's Turtle
responses — never indexed into the graph. The renderer test (A2c) includes a
negative assertion that imports `DERIVED_ENTITY_TYPES` and checks every rendered
document against it. **Do not hard-code the list in the test** — importing from
the shared module is what prevents Stream A and Stream B from drifting if Stream
B later adds a new derived class.

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

Each builder imports its IRI helpers from `@forwardimpact/map/iri` (introduced
in foundation F3). **Do not** re-define the IRI base or constructors locally —
drift between view-builders and Stream B's serializer is exactly what the shared
module exists to prevent.

Each builder returns a plain object keyed to the placeholders in the matching
template. No HTML, no escaping — Mustache handles escaping with
`{{placeholder}}` (and `{{{placeholder}}}` for raw HTML, which this spec
deliberately avoids for any user-sourced field). IRIs can safely use
triple-braces because they are constructed from controlled entity IDs.

Draw inspiration from the existing `products/pathway/src/formatters/*/shared.js`
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
concatenation.

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

**Tests:** `products/map/test/renderer.test.js`

- Construct a `Renderer` with a real `TemplateLoader` pointed at
  `products/map/templates/`.
- Render each entity type with a minimal fixture. Assert the output is a
  complete HTML document (starts with `<!DOCTYPE html>`).
- Parse each rendered document with N3 `MicrodataRdfParser` (already used by
  `libresource`) and assert the expected `fit:` subjects, predicates, and
  objects appear in the quad stream. **Do not assert on raw HTML strings** —
  Mustache whitespace changes would make those tests brittle. Quad assertions
  catch real semantic regressions.
- Assert the `capability.html` + `skill-inline.html` partial produces the same
  skill quads (modulo subject nesting) as a standalone `skill.html` render.
- **Negative assertion**: parse every rendered document and confirm no subject
  is typed with any IRI in `DERIVED_ENTITY_TYPES` (imported from
  `@forwardimpact/map/iri`). These are derived-entity classes owned by Stream B
  and must not be indexed. Import the list — do not duplicate it in the test, or
  the assertion will silently fall out of sync the next time Stream B's
  vocabulary grows.

`products/map/test/view-builders/*.test.js`

- Unit tests for each view builder. Pure-function inputs and outputs, no
  template involvement. Assert IRI shape against `@forwardimpact/map/iri`.

#### A2d. Map package manifest updates

**File:** `products/map/package.json`

- Add `"@forwardimpact/libtemplate": "^0.2.0"` to `dependencies` (matching the
  version range `libsyntheticrender` uses).
- Add `"templates/"` to the top-level `files` array so the Mustache templates
  ship in the published npm tarball. Without this entry, external users running
  `npx fit-map export` against the installed package will hit the
  `Template '...' not found` error path in `libraries/libtemplate/loader.js:41`.
- Add `"./renderer": "./src/renderer.js"` to the exports table — downstream
  packages can import the `Renderer` directly if needed. Not strictly required
  by Stream A, but keeps the exports table consistent with the other factories
  (`./loader`, `./validation`, etc.).

(The `"./iri"` export was added in foundation F3 — do not duplicate it here.)

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
   HTML document (page shell already applied). Write each result to
   `outputDir/pathway/<type>/<id>.html`.
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

- Fixture with a minimal discipline + level + capability + one skill
  - one behaviour + one stage + one driver + one tool.
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

### A6. Pipeline integration test (end-to-end)

**File:** `products/map/test/pipeline.test.js`

End-to-end test for the export → resource → graph flow. This is the automated
form of success criterion 2, which no existing test touches.

- Fixture pathway data directory with one discipline, one level, one capability,
  one skill.
- Temporary `data/knowledge/`, `data/resources/`, `data/graphs/` directories.
- Call `createExporter(...).exportAll(...)` → confirm HTML landed.
- Invoke `libresource`'s `ResourceProcessor` programmatically on the fixture
  knowledge dir → confirm resources contain Turtle with `fit:` subjects.
- Invoke `libgraph`'s `GraphProcessor` programmatically → confirm
  `GraphIndex.getSubjects("fit:Skill")` returns the fixture skill. This also
  exercises foundation F2's `RDF_PREFIXES` entry — if `fit:` is not registered,
  the query degrades to a literal term and this assertion fails.
- This test asserts foundation F1 (parser widening), foundation F2 (graph
  prefix), and the exporter's HTML shape together produce queryable subjects. If
  it fails after a refactor, debugging one step at a time is still possible via
  the earlier per-unit tests.

### A7. Pathway formatters cleanup

The `microdata` formatters under
`products/pathway/src/formatters/*/microdata.js` and `microdata-shared.js` are
dead code at the pathway product's boundary. Verify with:

```
grep -rn "ToMicrodata\|microdata-shared" products/pathway/src
```

— matches should appear only inside the `formatters/` directory itself (the
re-exports). Outside that directory, zero hits.

**File:** `products/pathway/src/formatters/index.js`

Mechanically remove:

- `export * from "./microdata-shared.js"`
- The seven `export { ...ToMicrodata } from "./{entity}/microdata.js"` lines —
  one each for skill, behaviour, discipline, track, level, stage, driver.

The file itself stays because it still re-exports the DOM and markdown
formatters the CLI uses.

**Deleted files:**

- `products/pathway/src/formatters/microdata-shared.js`
- `products/pathway/src/formatters/skill/microdata.js`
- `products/pathway/src/formatters/behaviour/microdata.js`
- `products/pathway/src/formatters/discipline/microdata.js`
- `products/pathway/src/formatters/track/microdata.js`
- `products/pathway/src/formatters/level/microdata.js`
- `products/pathway/src/formatters/stage/microdata.js`
- `products/pathway/src/formatters/driver/microdata.js`

(The `tool/` subdirectory has no `microdata.js` file — only `shared.js` — and
there is no `capability/` subdirectory, so nothing to delete in those two cases.
The sibling `markdown.js`, `dom.js`, and `shared.js` files **stay** in pathway;
they power the CLI's human-facing output.)

Also delete any microdata-only test files under
`products/pathway/test/formatters/` if present. Their coverage is replaced by
`products/map/test/renderer.test.js` and
`products/map/test/view-builders/*.test.js`.

## Verification against success criteria

| #   | Criterion                                           | How verified                                |
| --- | --------------------------------------------------- | ------------------------------------------- |
| 1   | `fit-map export` produces HTML in `data/knowledge/` | A4 CLI + A3 exporter tests                  |
| 2   | `just cli-subjects` lists `fit:*` types             | A6 pipeline test (with foundation F1+F2)    |
| 3   | `ARGS="fit:Skill" just cli-subjects` returns all    | A6 pipeline test; manual after `quickstart` |
| 6   | Guide answers "what skills..." via graph path       | A stream end-to-end; manual LLM check       |

Criteria 4, 5, 7, 8, 9 are covered by
[plan-a-03.md](plan-a-03.md).

## File summary

**Created:**

- `products/map/templates/page.html` (shared HTML document shell)
- `products/map/templates/skill-inline.html` (Mustache partial)
- `products/map/templates/{skill,capability,level,behaviour,discipline,track,stage,driver,tool}.html`
- `products/map/src/view-builders/index.js` (barrel)
- `products/map/src/view-builders/{skill,capability,level,behaviour,discipline,track,stage,driver,tool}.js`
- `products/map/src/renderer.js` (`Renderer` class + `createRenderer`)
- `products/map/src/exporter.js`
- `products/map/test/renderer.test.js` (quad-level assertions)
- `products/map/test/view-builders/*.test.js`
- `products/map/test/exporter.test.js`
- `products/map/test/pipeline.test.js` (end-to-end)

**Modified:**

- `products/map/package.json` (add `@forwardimpact/libtemplate` dep, add
  `templates/` to `files`, add `./renderer` export)
- `products/map/bin/fit-map.js` (add `export` subcommand)
- `products/map/src/index.js` (export `createExporter`, `createRenderer`)
- `products/pathway/src/formatters/index.js` (remove microdata re-exports)
- `justfile` (add `export-framework`; chain into `process` / `process-fast`)

**Deleted:**

- `products/pathway/src/formatters/microdata-shared.js`
- `products/pathway/src/formatters/{skill,behaviour,discipline,track,level,stage,driver}/microdata.js`
- Corresponding microdata-only test files under
  `products/pathway/test/formatters/` (if present)
