# Plan 1190 — FHIR Microdata HTML Output Format

## Approach

Sequence work bottom-up: register the DSL keyword, expose
`datasetsMap` on the `datasets` node return shape, then add the two new
pipeline nodes (`fhir-cross-ref`, `fhir-microdata-html`) with their pure
render/index functions in `libsyntheticrender`. Wire `skeleton` to thread
the optional cross-ref through `renderHTML` → `renderClinicalPages` and
augment the three 1140 builders so reverse-links emit only when the
cross-ref is non-null. Land tests alongside each step so the
`null`-cross-ref byte-identity contract (spec criterion 7) is guarded
from the first commit. The libresource-backed RDF assertions live in
`libterrain/test/` because they need both the rendered output and the
new pipeline wiring; the per-Patient file-count test lives in
`libsyntheticrender/test/` against the pure render function.

Libraries used (Step 8 test only — production code uses no new
libraries): `@forwardimpact/libresource/parser.js` (`Parser`),
`@forwardimpact/libresource/skolemizer.js` (`Skolemizer`), `jsdom`
(`JSDOM`). libresource exports `Parser` and `Skolemizer` at the
`/parser.js` and `/skolemizer.js` subpaths — not at the root entry —
per `libraries/libresource/package.json`.

## Step 1 — Register the DSL keyword

**Intent:** Make `fhir_microdata_html` parse as a valid `output` block format.

Files modified:

- `libraries/libsyntheticgen/src/dsl/tokenizer.js`
- `libraries/libsyntheticgen/src/dsl/parser-standard.js`

Changes:

- `tokenizer.js` KEYWORDS set (after `"embeddings_jsonl"` at line 179):
  add `"fhir_microdata_html"`.
- `parser-standard.js` `DATASET_FORMATS` set (after `"embeddings_jsonl"`
  at line 229): add `"fhir_microdata_html"`. No new entries in
  `OUTPUT_DISPATCH` — the format reuses the existing `path` field.

Verify: extend `libraries/libsyntheticgen/test/` (or co-located parser
test) with a fixture declaring `output patients fhir_microdata_html { path
"out/patients" }` and assert it parses without the "Unknown output
format" error.

## Step 2 — Export `normalizePatientRef` from synthea.js

**Intent:** Make the existing patient-reference normalizer reusable so
`buildFhirCrossRef` keys patients by the same id `filterByConditions`
does.

Files modified:

- `libraries/libsyntheticgen/src/tools/synthea.js`

Change: prepend `export` to `function normalizePatientRef` (line 173).

Verify: `libraries/libsyntheticgen/test/` adds a one-line import
assertion (or any subsequent step's test importing it compiles).

## Step 3 — Add `datasetsMap` to the `datasets` node return

**Intent:** Make the FHIR record arrays reachable by downstream nodes
without re-running Synthea or re-parsing files.

Files modified:

- `libraries/libterrain/src/nodes.js`

Changes inside the `datasets` node (lines 195–211):

```diff
     datasets: {
       deps: ["parse"],
       async run({ parse }) {
         const files = new Map();
-        if (!parse.datasets?.length || !toolFactory) return { files };
+        if (!parse.datasets?.length || !toolFactory) {
+          return { files, datasetsMap: new Map() };
+        }

         const datasets = await generateDatasets(
           parse.datasets,
           parse.seed,
           toolFactory,
           logger,
           parse.clinical,
         );
         await renderDatasetOutputs(parse.outputs, datasets, files, logger);
-        return { files };
+        return { files, datasetsMap: datasets };
       },
     },
```

The two `generateDatasets` arguments and the surrounding lines are
verbatim from `libraries/libterrain/src/nodes.js`:200–209; the diff
only inserts the `datasetsMap` keys.

Inside `renderDatasetOutputs` (line 376): add an explicit skip at the
top of the loop:

```diff
   for (const out of outputs) {
+    if (out.format === "fhir_microdata_html") continue;
     const dataset = datasets.get(out.dataset);
```

Verify: `libraries/libterrain/test/datasets.test.js` — extend the
existing `runDatasetsNode` test harness with one assertion that the
returned shape now carries a `datasetsMap` (Map), and one regression
test asserting `renderDatasetOutputs` does not emit the
"dataset not generated" info log when an output's format is
`fhir_microdata_html`.

## Step 4 — Pure cross-ref builder + render function in libsyntheticrender

**Intent:** Land the format-rendering and cross-ref-derivation logic as
pure functions, callable from the pipeline nodes in Step 5.

Files created:

- `libraries/libsyntheticrender/src/render/fhir-microdata.js`
- `libraries/libsyntheticrender/templates/fhir-patient.html`
- `libraries/libsyntheticrender/templates/fhir-patient-index.html`

Files modified:

- `libraries/libsyntheticrender/src/index.js` — export
  `renderFhirMicrodataHtml` and `buildFhirCrossRef`.
- `libraries/libsyntheticrender/package.json` — add
  `"./render/fhir-microdata": "./src/render/fhir-microdata.js"` to
  `exports`.

`fhir-microdata.js` exports:

```js
export function buildFhirCrossRef({ patients, conditions, clinical, domain }) {
  // Returns CrossRefIndex per design § Cross-ref derivation, plus the
  // inverted trial→patient view consumed by buildTrialCardData (Step 6):
  //   { patientToTrialIris, conditionIdToPatientIris, siteIdToPatientIris,
  //     trialIriToPatientIris }
  // trialIriToPatientIris is derived from patientToTrialIris in one pass
  // before return — Set iteration order follows the input FHIR Patient
  // array order (design § Risks).
  // Uses normalizePatientRef from libsyntheticgen/src/tools/synthea.js
  // (re-exported in Step 2).
}

export function renderFhirMicrodataHtml(input, config) {
  // input: { patients, conditions, procedures, medRequests, crossRef, domain }
  // config: { path }   — `path` is required; throws if absent or empty.
  // Asserts each patient.id matches the UUID shape (design § Invariants);
  // throws on the first non-UUID id.
  // Returns Map<string,string> with entries:
  //   `${config.path}/${patient_id}.html`  — one Person main item per file
  //   `${config.path}/index.html`           — aggregate listing
}
```

Templates use the Mustache idiom already established by clinical
templates. `fhir-patient.html` emits one `Person` main item (itemtype
`https://schema.org/Person`) with nested itemscopes for
`MedicalCondition` / `MedicalProcedure` / `DrugPrescription` — each
nested itemscope carries a **Schema.org** itemtype
(`https://schema.org/MedicalCondition`, …) per design § Vocabulary's
"Itemtypes (Person, MedicalCondition, MedicalProcedure,
DrugPrescription) remain Schema.org per the spec table." The Patient
→ nested-resource relations and §4 `enrolledIn` links use
**absolute-URI** itemprops in the fit: namespace
(`itemprop="https://www.forwardimpact.team/schema/rdf/hasCondition"`,
…) so the streaming microdata parser does not resolve them against
Schema.org. `fhir-patient-index.html` lists each patient as
`{name, condition-summary, iri}` per spec §6; the index file itself
carries no Schema.org main item — Guide's crawler discovers
per-patient pages via the per-row `<a href="{{patient_html_path}}">`
anchors, and each per-patient page is the main-item-bearing surface.

Verify: `libraries/libsyntheticrender/test/fhir-microdata.test.js` —
unit test (1) asserts file count equals `patients.length + 1` against
a 3-Patient fixture (criterion 1); (2) asserts the Mustache output for
one patient contains the expected `itemid` IRI shape and the four
Schema.org itemtypes; (3) asserts the rendered HTML contains
**exactly one** top-level `itemscope` *without* a parent `itemscope`
ancestor (criterion 2's exact-one-main-item constraint) — checked via
a simple bracket counter over the rendered string since libresource is
intentionally not a dep here; (4) asserts that with a non-empty
`crossRef.trialIriToPatientIris` the page contains an `enrolledIn`
link; (5) asserts that with a non-UUID `patient.id` the function
throws; (6) asserts that `config.path` absent throws.

## Step 5 — Add the two new pipeline nodes

**Intent:** Wire the pure functions from Step 4 into the dep graph with
the gating contract from the design.

Files modified:

- `libraries/libterrain/src/nodes.js`

Insert two entries into the node table between `datasets` and
`clinical-output`:

```js
"fhir-cross-ref": {
  deps: ["parse", "entities", "datasets"],
  run({ parse, entities, datasets }) {
    const wiredOutputs = (parse.outputs || []).filter(
      (o) => o.format === "fhir_microdata_html",
    );
    if (wiredOutputs.length === 0) return null;
    if (!entities.clinical) {
      logger.info("pipeline", "fhir-cross-ref: skipped (no clinical block)");
      return null;
    }
    const mergedPatients = [];
    const mergedConditions = [];
    for (const out of wiredOutputs) {
      const p = findFhirDataset(datasets.datasetsMap, out.dataset, "patient");
      const c = findFhirDataset(datasets.datasetsMap, out.dataset, "condition");
      if (!p || !c) {
        logger.info(
          "pipeline",
          `fhir-cross-ref: skipping output '${out.dataset}' (sibling FHIR datasets not generated)`,
        );
        continue;
      }
      mergedPatients.push(...p.records);
      mergedConditions.push(...c.records);
    }
    if (mergedPatients.length === 0) return null;
    return buildFhirCrossRef({
      patients: mergedPatients,
      conditions: mergedConditions,
      clinical: entities.clinical,
      domain: entities.domain,
    });
  },
},

"fhir-microdata-html": {
  deps: ["parse", "datasets", "fhir-cross-ref"],
  run({ parse, datasets, "fhir-cross-ref": crossRef }) {
    const files = new Map();
    if (crossRef === null) return { files };
    const wiredOutputs = (parse.outputs || []).filter(
      (o) => o.format === "fhir_microdata_html",
    );
    for (const out of wiredOutputs) {
      const input = unwrapFhirDatasets(datasets.datasetsMap, out, parse.domain, crossRef);
      const rendered = renderFhirMicrodataHtml(input, out.config);
      for (const [path, content] of rendered) files.set(path, content);
    }
    return { files };
  },
},
```

**Selecting the FHIR dataset id for the cross-ref.** The cross-ref is
built once over all `fhir_microdata_html` outputs the DSL declares —
the design's `CrossRefIndex` is shaped to span the full set, not one
output at a time. `fhir-cross-ref` collects every wired
`out.dataset` into an ordered list, looks up each output's
`<out.dataset>_patient` and `<out.dataset>_condition` Datasets in
`datasetsMap`, concatenates the resulting FHIR record arrays, and
passes the merged arrays into `buildFhirCrossRef`. Skips outputs whose
sibling Datasets are absent (with the `info` log) and returns `null`
when **no** wired output has both siblings. Patient IRIs are unique
across outputs (Synthea seeds independent UUIDs per output's seed
config), so the merge has no collision risk.

**Helpers.** `findFhirDataset(datasetsMap, datasetId, type)` —
returns `datasetsMap.get(`${datasetId}_${type}`)` or `undefined`, per
design § D7's `<output.dataset>_<type>` rule. `unwrapFhirDatasets`
returns
`{ patients, conditions, procedures, medRequests, crossRef, domain }`
shaped for `renderFhirMicrodataHtml`'s input contract — `patients`
and friends are the per-output FHIR record arrays (one output's
patients only, since `renderFhirMicrodataHtml` emits files for one
output's `config.path`), not the merged set the cross-ref consumes.
Both helpers live as module-private functions below
`mergeOutputFiles`. `domain` is read from `parse.domain` (already on
the `parse` node output, same source the `entities` node uses at line
59).

Imports at top of file:

```diff
 import {
   validateLinks,
   validateHTML,
   renderDataset,
   renderSql,
   renderEmbeddings,
+  renderFhirMicrodataHtml,
+  buildFhirCrossRef,
 } from "@forwardimpact/libsyntheticrender";
```

Verify: extend `libraries/libterrain/test/datasets.test.js` (or new
`libraries/libterrain/test/fhir-microdata.test.js`) — (1) assert
`fhir-cross-ref` returns `null` when no output declares the format;
(2) assert it returns `null` when `entities.clinical` is missing even
if an output is wired; (3) assert it returns a `CrossRefIndex` when
both conditions hold and a recording factory injects synthetic
`_patient` / `_condition` Datasets into `datasetsMap`.

## Step 6 — Thread cross-ref through skeleton render chain

**Intent:** Carry the (possibly `null`) cross-ref from the pipeline
into the three 1140 builders so reverse-links can emit. When the
cross-ref is `null`, the chain must be observably identical to the
pre-change code path (criterion 7).

Files modified:

- `libraries/libterrain/src/nodes.js`
- `libraries/libsyntheticrender/src/render/renderer.js`
- `libraries/libsyntheticrender/src/render/html.js`
- `libraries/libsyntheticrender/src/render/html-clinical.js`

Changes:

`nodes.js` `skeleton` node (lines 86–96): add `"fhir-cross-ref"` to
deps and forward the value:

```diff
     skeleton: {
-      deps: ["entities", "cache-lookup"],
-      run({ entities, "cache-lookup": prose }) {
+      deps: ["entities", "cache-lookup", "fhir-cross-ref"],
+      run({ entities, "cache-lookup": prose, "fhir-cross-ref": fhirCrossRef }) {
         if (!entities.people) return { files: new Map(), linked: null };
         logger.info(
           "render",
           "Rendering HTML (Pass 1: deterministic skeleton)",
         );
-        return renderer.renderSkeleton(entities, prose);
+        return renderer.renderSkeleton(entities, prose, { fhirCrossRef });
       },
     },
```

`renderer.js` `Renderer.renderSkeleton(entities, prose)` (line 41):

```diff
-  renderSkeleton(entities, prose) {
-    return renderHTML(entities, prose, this.templateLoader);
+  renderSkeleton(entities, prose, options = {}) {
+    return renderHTML(entities, prose, this.templateLoader, options);
   }
```

`html.js` `renderHTML(entities, prose, templates)` (line 386):

```diff
-export function renderHTML(entities, prose, templates) {
+export function renderHTML(entities, prose, templates, options = {}) {
+  const { fhirCrossRef = null } = options;
   ...
   if (entities.clinical) {
     const pageWrap = (title, body) => page(templates, title, body, domain);
-    renderClinicalPages(files, entities, prose, templates, domain, pageWrap);
+    renderClinicalPages(files, entities, prose, templates, domain, pageWrap, fhirCrossRef);
   }
```

`html-clinical.js`:

```diff
 export function renderClinicalPages(
   files,
   entities,
   prose,
   templates,
   domain,
   pageWrap,
+  fhirCrossRef = null,
 ) {
```

…and inside the body, pass `fhirCrossRef` into the three relevant
builders:

```diff
-        conditions: buildConditionData(conditions, trials, prose),
+        conditions: buildConditionData(conditions, trials, prose, fhirCrossRef),
...
-        sites: buildSiteData(sites, trials, prose),
+        sites: buildSiteData(sites, trials, prose, fhirCrossRef),
...
-        trials: buildTrialCardData(trials, conditions, sites),
+        trials: buildTrialCardData(trials, conditions, sites, fhirCrossRef),
```

Builders gain a trailing `fhirCrossRef = null` arg and short-circuit
on `null` — when the cross-ref is absent each builder returns the same
data array shape it does today, with no `*PatientLinks` field added.
This is the load-bearing guarantee for criterion 7: the Mustache
sections in the template fire only when their array key is present
**and** non-empty, so an absent key produces byte-identical output to
the pre-change template.

When `fhirCrossRef` is non-null:

- `buildTrialCardData` per trial: append
  `enrolledPatientLinks: [...(fhirCrossRef.trialIriToPatientIris.get(trial.iri) ?? [])].map(iri => ({iri}))`.
- `buildConditionData` per condition: append
  `affectedPatientLinks: [...(fhirCrossRef.conditionIdToPatientIris.get(cond.id) ?? [])].map(iri => ({iri}))`.
- `buildSiteData` per site: append
  `servedPatientLinks: [...(fhirCrossRef.siteIdToPatientIris.get(site.id) ?? [])].map(iri => ({iri}))`.

`trialIriToPatientIris` is a fourth field on `CrossRefIndex` —
inverted **once** inside `buildFhirCrossRef` rather than per call.
Update Step 4's `CrossRefIndex` shape and the test to cover the new
field. The design's three-field shape was for the forward direction;
the reverse map is a derived view that lives next to the others so
consumers (templates and any future RDF check) read a single immutable
index.

Templates `trial-card.html`, `condition-explainer.html`,
`site-description.html` gain one Mustache section each before the
closing tag, e.g. for `trial-card.html`:

```diff
   {{#siteLinks}}
   <link itemprop="location" href="{{{iri}}}" />
   {{/siteLinks}}
+  {{#enrolledPatientLinks}}
+  <link itemprop="https://www.forwardimpact.team/schema/rdf/enrolledPatient" href="{{{iri}}}" />
+  {{/enrolledPatientLinks}}
 </article>
```

Analogous block for `condition-explainer.html`
(`affectedPatientLinks` / `affectedPatient`) and
`site-description.html` (`servedPatientLinks` / `servedPatient`) using
the predicates from design § Vocabulary, **emitted as absolute-URI
itemprops** so they resolve to `fit:` predicates rather than the
enclosing Schema.org itemtype's namespace.

Verify: `libraries/libsyntheticrender/test/render-clinical-html.test.js`
gains one positive test: calling `renderHTML(entities, prose, templates,
{ fhirCrossRef })` against a fixture whose maps contain a matched
patient emits one `<link>` line per reverse-link section. The
criterion-7 byte-identity assertion lives in Step 9.

## Step 7 — Wire `fhir-microdata-html` files into the write node and `STAGES`

**Intent:** The new node's `files` reach disk and both new nodes are
enumerable by the `inspect` verb.

Files modified:

- `libraries/libterrain/src/nodes.js` `write` node (lines 267–299) and
  `mergeOutputFiles` (line 395).
- `libraries/libterrain/src/pipeline.js` `STAGES` array (line 40) —
  add `"fhir-cross-ref"` (after `"datasets"`) and
  `"fhir-microdata-html"` (after `"clinical-output"`) so verb-closure
  walks and the `inspect` verb enumerate the new nodes.

Changes:

```diff
     write: {
       deps: [
         "enriched",
         "raw",
         "markdown",
         "pathway",
         "datasets",
         "clinical-output",
+        "fhir-microdata-html",
         "validate",
       ],
       run({
         enriched,
         raw,
         markdown,
         pathway,
         datasets,
         "clinical-output": clinicalOutput,
+        "fhir-microdata-html": fhirMicrodataHtml,
         validate,
       }) {
         const files = mergeOutputFiles(
           options.only,
           enriched,
           raw,
           markdown,
           pathway,
           datasets,
           clinicalOutput,
+          fhirMicrodataHtml,
         );
```

`mergeOutputFiles` gains a trailing `fhirMicrodataHtml` parameter; its
files merge into the output map unconditionally (parallel to how
`clinicalOutput.files` is handled today at line 420).

Verify: `libraries/libterrain/test/pipeline.test.js` — extend an
existing pipeline fixture with a `fhir_microdata_html` output backed by
a stub Synthea factory that yields a 1-Patient bundle; assert the
resulting `write.files` Map contains both
`{path}/{patient_id}.html` and `{path}/index.html`.

## Step 8 — End-to-end RDF assertions

**Intent:** Spec criteria 2–6 — running libresource's parser against
the rendered output must surface the expected items and cross-link
quads.

Files created:

- `libraries/libterrain/test/fhir-microdata-rdf.test.js`

Files modified:

- `libraries/libterrain/package.json` — add
  `"@forwardimpact/libresource": "^0.1.111"` and `"jsdom": "^29.1.1"`
  to `devDependencies`. Versions match `libgraph` and `libvector` (which
  also peer-depend on libresource) and the `jsdom` version already
  required transitively by libresource — no new major in the
  workspace.

Test shape: build entities/parse with a clinical block referencing one
condition + one trial + one site; stub the Synthea factory to return a
1-Patient bundle whose `Condition.code.coding[].code` matches the DSL
condition id (mirroring the harness in
`libterrain/test/datasets.test.js`). Run the full node graph; collect
files; for each rendered HTML file, parse with
`new JSDOM(content)` (`import { JSDOM } from "jsdom"`)
plus `new Parser(new Skolemizer(), logger).parseHTML(dom, baseIri)`
(`import { Parser } from "@forwardimpact/libresource/parser.js"`;
`import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js"`)
and assert quads:

- Criterion 2: per-patient page → exactly one main item, itemtype
  `Person`, IRI matches
  `https://test.example/id/clinical/patient/<uuid>`.
- Criterion 3: subject=patient IRI, predicates `hasCondition`,
  `hasProcedure`, `hasMedicationRequest` link to the inline items.
- Criterion 4: subject=patient IRI, predicate `enrolledIn`, object =
  trial IRI from DSL.
- Criterion 5: subject=trial IRI, predicate `enrolledPatient`, object
  = patient IRI; same for `affectedPatient` on the condition page and
  `servedPatient` on the site page.
- Criterion 6: both directions of the patient↔trial edge present in
  the combined graph.

## Step 9 — Spec 1140 regression snapshot

**Intent:** Spec criterion 7 — when no `fhir_microdata_html` output is
declared, 1140 pages render byte-identically.

Files modified:

- `libraries/libsyntheticrender/test/render-clinical-html.test.js` —
  add a negative assertion test against a known fixture: for the
  trial-card, condition-explainer, and site-description outputs
  rendered with **no** `options.fhirCrossRef`, assert
  `output.includes("enrolledPatient") === false`,
  `output.includes("affectedPatient") === false`,
  `output.includes("servedPatient") === false`, AND that the
  builder data object has none of the new
  `enrolledPatientLinks` / `affectedPatientLinks` / `servedPatientLinks`
  keys present. This pair of checks is stronger than a captured-baseline
  snapshot — it runs deterministically without a pre-change capture
  step, and it directly enforces the criterion-7 contract that the
  reverse-link fields are absent when no cross-ref is supplied.

Verify: `bun test libsyntheticrender` passes. The same test serves as
the gate for the criterion-7 byte-identity contract — if a future
change leaks reverse-link emission into the null-cross-ref path, this
test fails before the build artifact ships.

## Risks

- **devDependency footprint.** `jsdom` is the largest devDependency
  introduced here. Step 8 places it in `libterrain` only — not
  `libsyntheticrender` — so render-only unit tests keep their existing
  dep surface.
- **`fhir-cross-ref` adds latency to non-FHIR `skeleton` runs.** The
  `null`-path is O(1) over `parse.outputs`, but the dep edge serializes
  `skeleton` behind `datasets`. Surfaced in CI timing on the regression
  fixture; if measurable, the D12 rejected post-process alternative
  re-opens — flag this in the implementation PR description so the
  reviewer can spot the delta.
- **`microdata-rdf-streaming-parser` itemprop resolution.** The design
  calls out absolute-URI itemprops for fit: predicates; a bare
  `hasCondition` would silently emit `https://schema.org/hasCondition`.
  Templates and Step 6 builders must use the full URI. Step 8's quad
  assertions catch a regression here.
- **Synthea fixture availability in CI.** The Step 8 test stubs the
  Synthea factory rather than invoking Java — keeps CI hermetic and
  matches `datasets.test.js` precedent. A future integration test that
  invokes the real JAR is out of scope here.

## Execution

Run all nine steps sequentially through `kata-implement` on the
`feat/1190-fhir-microdata-html` branch — each step's verification
gates the next. No parallelism: every step touches files a later step
re-touches, and the cross-cutting signature change in Step 6 must land
between the pure-function landing in Step 4 and the pipeline wiring in
Step 5–7. No technical-writer routing — no documentation surface
changes; the format keyword is internal-only.

— Staff Engineer 🛠️
