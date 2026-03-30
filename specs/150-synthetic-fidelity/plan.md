# Synthetic Data Fidelity — Plan

Concrete implementation steps for each item in `spec.md`, organized by tier.
Each section names the files changed, the exact code pattern to modify, and the
verification method.

---

## Tier 1 — Fix what's broken

### A1. Fix discipline prompt placeholder

**File:** `libraries/libsyntheticprose/prompts/pathway/discipline.js`

Line 54 references `{roleName}` in the agent identity text. The skeleton only
populates `{roleTitle}` and `{specialization}`. Remove the `{roleName}`
reference — replace it with `{roleTitle}` or delete the sentence.

**Verify:** `grep -r 'roleName' libraries/libsyntheticprose/` returns zero
matches after the change.

---

### A2. Fix blog date overflow

**File:** `libraries/libsyntheticrender/render/link-assigner.js`

Line 283 computes month as `Math.floor(i / 2) + 1`. When `blogCount > 24`, this
produces months 13+. Wrap the month via modulo:

```javascript
const month = ((Math.floor(i / 2)) % 12) + 1;
const day = 10 + (i % 20);
```

This distributes blogs cyclically across 12 months regardless of count.

**Verify:** Generate with `blogs 45` and confirm all dates parse as valid ISO
dates (`new Date(date)` returns a valid date for every blog).

---

### A3. Unify IRI namespace

**Files:**

- `libraries/libsyntheticgen/engine/entities.js` — lines 24, 28, 33, 43, 137

Currently produces IRIs as `https://{domain}/{type}/{id}` (e.g., `/org/bionova`,
`/person/athena`). The render layer (`industry-data.js`, `link-assigner.js`)
uses `/id/{type}/{id}`, and the enricher's `stripOffDomainIris` (line 261) only
preserves `/id/` IRIs.

**Change:** In `entities.js`, insert `/id/` into all IRI patterns:

```javascript
// Before
iri: `https://${domain}/org/${o.id}`
iri: `https://${domain}/department/${d.id}`
iri: `https://${domain}/team/${t.id}`
iri: `https://${domain}/project/${p.id}`
iri: `https://${domain}/person/${id}`

// After
iri: `https://${domain}/id/org/${o.id}`
iri: `https://${domain}/id/department/${d.id}`
iri: `https://${domain}/id/team/${t.id}`
iri: `https://${domain}/id/project/${p.id}`
iri: `https://${domain}/id/person/${id}`
```

**Verify:** After generation, `stripOffDomainIris` preserves person, team, and
project links in enriched HTML. Unit-test the IRI output from `entities.js`
directly (confirm all 5 entity types produce `/id/` IRIs) in addition to
checking the generated HTML for `itemid=` attributes.

---

### A4. Warn on people shortfall

**Files:**

- `libraries/libsyntheticgen/engine/entities.js` — `generatePeople` function
- `libraries/libsyntheticgen/engine/tier0.js` — `EntityGenerator` class (owns
  the logger)

After the `while` loop in `generatePeople` (line 89), add a warning when the
result count is less than the requested count:

```javascript
if (people.length < count) {
  logger.warn(
    `People shortfall: requested ${count}, generated ${people.length} (name pool exhausted)`,
  );
}
```

The `logger` is available on `EntityGenerator` in `tier0.js` but is not
currently threaded into `entities.js`. The call chain is
`EntityGenerator.generate()` → `buildEntities(ast, rng)` →
`generatePeople(ast, rng, teams, domain)`. Add `logger` as a parameter to
`buildEntities` and `generatePeople`, passed from `this.logger` in
`EntityGenerator`.

**Verify:** Set `count 500` in a test DSL (exceeding the Greek name pool) and
confirm the warning appears in stderr.

---

### A5. Derive org name and dates from DSL context

**File:** `libraries/libsyntheticrender/render/link-assigner.js`

**Signature change required:** `assignLinks` currently receives destructured
individual arrays
(`{ drugs, platforms, projects, people, teams, departments, domain, courseCount, eventCount, blogCount, articleTopics, seed }`).
It does NOT receive `entities` as a single object. Add two new parameters to the
destructured signature: `orgName` and `dateRange` (or `startYear`/`endYear`).
The caller must extract these from the entities/scenarios before calling
`assignLinks`.

**Org name (line 193):** Replace hardcoded `"BioNova"` with the new `orgName`
parameter:

```javascript
export function assignLinks({
  drugs, platforms, projects, people, teams, departments, domain,
  courseCount, eventCount, blogCount, articleTopics = [], seed = 42,
  orgName = null,   // NEW
  startYear = null, // NEW
  endYear = null,   // NEW
}) {
  const effectiveOrgName = orgName || domain;
  const effectiveYear = startYear || new Date().getFullYear();
```

Pass `effectiveOrgName` into course object construction at line 193.

**Dates (lines 192, 231, 276, 283, 337):** Blog, course, and event dates are
pinned to 2025. Replace all hardcoded `2025` with `effectiveYear`. For blogs,
spread across the year range using `startYear + (i % yearSpan)` when a range is
provided.

**Caller change:** Wherever `assignLinks` is called (in the render layer),
extract org name and date range from the generated entities/scenarios:

```javascript
const orgName = entities.orgs?.[0]?.name || entities.domain;
const allDates = (entities.scenarios || [])
  .flatMap((s) => (s.snapshots || []).map((snap) => snap.date))
  .sort();
const startYear = allDates.length ? new Date(allDates[0]).getFullYear() : null;
const endYear = allDates.length ? new Date(allDates.at(-1)).getFullYear() : null;
```

If scenarios or snapshots are empty, fall back to the current year.

**Verify:** Create a DSL with a 2027–2029 timeline. Generated content dates
should fall within that range, not 2025. Confirm no `"BioNova"` string appears
when using a different org name.

---

## Tier 2 — Raise coherence

### B1. Extract shared vocabulary constants

**New file:** `libraries/libsyntheticgen/vocabulary.js`

Place the shared vocabulary in `libsyntheticgen` — it is the structural
foundation that both `libsyntheticprose` and `libsyntheticrender` already depend
on. Placing it in `libsyntheticprose` would create a new dependency from
`libsyntheticrender` → `libsyntheticprose`, which does not exist today and
should not be introduced.

```javascript
/** @type {string[]} */
export const PROFICIENCY_LEVELS = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];

/** @type {string[]} */
export const MATURITY_LEVELS = [
  "emerging",
  "developing",
  "practicing",
  "role_modeling",
  "exemplifying",
];

/** @type {string[]} */
export const STAGE_NAMES = [
  "specify",
  "plan",
  "scaffold",
  "code",
  "review",
  "deploy",
];
```

Export from `libraries/libsyntheticgen/index.js`.

**Update consumers:**

| File                                              | Hardcoded value                              | Change                                      |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `libsyntheticrender/validate.js` L334             | `VALID_PROFICIENCIES`                        | Import from `libsyntheticgen/vocabulary.js` |
| `libsyntheticprose/prompts/pathway/level.js`      | Inline proficiency/maturity strings          | Import from `libsyntheticgen/vocabulary.js` |
| `libsyntheticprose/prompts/pathway/behaviour.js`  | Inline maturity strings                      | Import from `libsyntheticgen/vocabulary.js` |
| `libsyntheticprose/prompts/pathway/capability.js` | Inline proficiency + stage strings           | Import from `libsyntheticgen/vocabulary.js` |
| `libsyntheticprose/engine/pathway.js` L305        | Fallback arrays in `generateSelfAssessments` | Import from `libsyntheticgen/vocabulary.js` |

Remove all inline copies after wiring.

**Verify:**
`grep -rn "awareness.*foundational.*working" libraries/libsynthetic*` returns
only `libsyntheticgen/vocabulary.js`. Run `npm run test` to confirm no
regressions.

---

### B2. Derive validation constants from DSL output

**File:** `libraries/libsyntheticrender/validate.js`

`VALID_DRIVERS` (lines 290–307) is a hardcoded Set of 16 driver IDs. These are
universe-specific — a different DSL may define entirely different drivers.

**Change:** Remove the `VALID_DRIVERS` constant. In
`checkSnapshotScoreDriverIds` (the check that uses it), extract valid driver IDs
from the generated framework data passed to `validateCrossContent`:

```javascript
function checkSnapshotScoreDriverIds(content) {
  const validDrivers = new Set(
    content.pathway?.drivers?.map((d) => d.id) || [],
  );
  // ... validation using validDrivers instead of VALID_DRIVERS
}
```

The `validateCrossContent` function already receives the full `content` object
which includes `content.pathway`. Thread the driver list through.

Similarly, derive `VALID_PROFICIENCIES` from `content.pathway.framework` or from
the vocabulary import (B1) — the latter is simpler since proficiency names are
structural.

**Verify:** Add a driver ID to the DSL that's not in the old hardcoded list.
Validation should pass. Remove a driver from the DSL — validation should catch
references to the removed driver.

---

### B3. Forward prior output into downstream prompts

**Files:**

- `libraries/libsyntheticprose/engine/pathway.js` — threading
- `libraries/libsyntheticprose/prompts/pathway/behaviour.js` — new parameter
- `libraries/libsyntheticprose/prompts/pathway/capability.js` — new parameter
- `libraries/libsyntheticprose/prompts/pathway/discipline.js` — new parameter
- `libraries/libsyntheticprose/prompts/pathway/track.js` — new parameter

**Current flow** (pathway.js lines 95–237):

1. `generateFramework` → `framework`
2. `generateLevels` → `levels` (receives framework metadata)
3. `generateStages` → `stages`
4. `generateBehaviours` → `behaviours[]` (parallel, no prior context)
5. `generateCapabilities` → `capabilities[]` (parallel, no prior context)
6. `generateDrivers` → `drivers`
7. `generateDisciplines` → `disciplines[]` (parallel, no prior context)
8. `generateTracks` → `tracks[]` (parallel, no prior context)
9. `generateSelfAssessments` → deterministic, no LLM

**New flow:** After step 2, collect level titles and proficiency baselines as
`priorOutput.levels`. After step 4, collect behaviour names/descriptions as
`priorOutput.behaviours`.

**Prompt builder changes:** Add a `priorOutput` parameter to each builder.
Append a "Previously generated context" section to the user prompt when
`priorOutput` is present:

```javascript
export function buildBehaviourPrompt(skeleton, schema, priorOutput) {
  const context = priorOutput?.levels
    ? `\n\nPreviously generated level titles: ${priorOutput.levels.map((l) => l.title).join(", ")}`
    : "";
  // ... append context to user prompt
}
```

**Threading in pathway.js:**

```javascript
const levels = await this.generateStep("levels", ...);
const priorOutput = { levels };

// behaviours receive level context
const behaviours = await Promise.all(
  skeletons.behaviours.map((s) =>
    this.generateStep("behaviour", s, schema, { priorOutput }),
  ),
);

priorOutput.behaviours = behaviours;

// capabilities receive level + behaviour context
const capabilities = await Promise.all(
  skeletons.capabilities.map((s) =>
    this.generateStep("capability", s, schema, { priorOutput }),
  ),
);

priorOutput.capabilities = capabilities;

// disciplines receive all prior context
// tracks receive all prior context
```

**Token budget for prior context:** Forwarding full descriptions for all prior
entities would consume too many input tokens in late-stage prompts (disciplines
and tracks receive everything). Keep prior context compact:

- **Levels:** title and proficiency baseline only (not full descriptions). ~100
  tokens for 6 levels.
- **Behaviours:** name and one-sentence summary only. ~200 tokens for 10
  behaviours.
- **Capabilities:** name and skill list (IDs, not descriptions). ~300 tokens for
  10 capabilities.

Total prior context stays under ~600 tokens even at the discipline/track stage.
The prompt builder should format prior context as a concise bullet list, not as
raw JSON. If a future framework has significantly more entities, add a hard cap
(e.g., 1000 tokens) and truncate the oldest entries.

**Verify:** Generate framework twice — once without forwarding (current), once
with. Manual review of 3 entity pairs (level↔capability, behaviour↔discipline,
capability↔track) should show shared terminology in the forwarded version.

---

### B4. Add shared voice and terminology preamble

**New file:** `libraries/libsyntheticprose/prompts/pathway/preamble.js`

A single function returning the system preamble text. Defines voice
(professional, concise, third-person) and key terminology (use the framework's
own names for proficiency/maturity levels, not synonyms).

```javascript
import { PROFICIENCY_LEVELS, MATURITY_LEVELS } from "@forwardimpact/libsyntheticgen/vocabulary.js";

export function buildPreamble(frameworkName) {
  return [
    `You are writing content for the "${frameworkName}" engineering career framework.`,
    `Use these exact proficiency level names: ${PROFICIENCY_LEVELS.join(", ")}.`,
    `Use these exact maturity level names: ${MATURITY_LEVELS.join(", ")}.`,
    `Write in professional, concise, third-person voice.`,
    `Use consistent terminology across all entities — prefer precise terms over synonyms.`,
  ].join("\n");
}
```

**`frameworkName` source:** The `PathwayGenerator.generate()` method receives
`{ framework, domain, industry, schemas }`. The framework AST from the DSL
parser contains `framework.name`. Thread `framework.name` (or fall back to
`domain`) as `frameworkName` into each prompt builder via the existing `ctx`
object — e.g., `{ ...ctx, frameworkName: framework.name || domain }`.

**Change in each prompt builder:** Prepend the preamble to the system message.
All 8 builders (`framework.js`, `level.js`, `stage.js`, `behaviour.js`,
`capability.js`, `driver.js`, `discipline.js`, `track.js`) get:

```javascript
import { buildPreamble } from "./preamble.js";
// In buildXxxPrompt():
const system = buildPreamble(frameworkName) + "\n\n" + existingSystemPrompt;
```

**Verify:** Grep all 8 prompt builders for `buildPreamble` import — all present.
Generated prose should use exact proficiency/maturity names, not synonyms.

---

### B5. Replace hardcoded vocabulary in prompts with DSL-derived values

**Files:** Same prompt builders as B1.

After B1 extracts vocabulary to a shared module and B4 introduces the preamble,
ensure prompts interpolate values from the import rather than inline strings.

This is largely done by B1 and B4 combined. The remaining work:

- `capability.js` lines 55–60: Stage names come from `STAGE_NAMES` import rather
  than hardcoded `"specify"`, `"plan"`, etc.
- `behaviour.js` line 32: Maturity levels come from `MATURITY_LEVELS` import.
- `level.js` lines 47–49: Proficiency/maturity come from imports.

**Verify:** No inline proficiency, maturity, or stage name strings remain in any
prompt builder.
`grep -n "awareness\|foundational\|emerging\|developing" libraries/libsyntheticprose/prompts/`
returns only preamble.js (via vocabulary import).

---

### B6. Constrain stage handoff targets

**File:** `libraries/libsyntheticprose/prompts/pathway/stage.js`

In the user prompt section that describes stage structure, add:

```
"targetStage in each handoff MUST be one of the stage IDs listed above.
Do not invent stage IDs that are not in the provided list."
```

Insert this after the stage ID list is rendered into the prompt.

**Verify:** Generate stages and confirm all `targetStage` values reference valid
stage IDs from the same framework. Cross-check with `validateCrossContent`.

---

### B7. Scale max_tokens by entity complexity

**File:** `libraries/libsyntheticprose/engine/prose.js`

In `generateStructured()` (line 111), the LLM call at line 130 uses a fixed
`max_tokens: 4000`. The method signature is
`async generateStructured(key, messages)` — it does not accept options.

Add an optional `maxTokens` parameter:

```javascript
async generateStructured(key, messages, { maxTokens = 4000 } = {}) {
  // ... existing cache logic ...
  const response = await this.llmApi.createCompletions({
    messages,
    max_tokens: maxTokens,
  });
```

**Note:** The cache key is computed from `key` and `messages` (line 114). Since
`maxTokens` is not part of the cache key, changing it for a given entity will
still match existing cache entries. This is acceptable — the cache stores the
LLM output, and a different token budget only affects whether the response is
truncated, not the cache lookup.

In `generateJson()` (which wraps `generateStructured`), forward the option:

```javascript
async generateJson(key, messages, options) {
  const raw = await this.generateStructured(key, messages, options);
```

In `pathway.js`, compute `maxTokens` per entity type:

```javascript
const BASE_TOKENS = 2000;
const PER_SKILL_TOKENS = 800;

// For capabilities:
const maxTokens = BASE_TOKENS + (skeleton.skills.length * PER_SKILL_TOKENS);

// For drivers, stages, framework:
const maxTokens = BASE_TOKENS;
```

Pass `{ maxTokens }` as an option through `generateStep` to
`generateStructured`.

**Verify:** Generate a capability with 6 skills — confirm the response is not
truncated (full JSON parses successfully). Generate a driver — confirm token
budget is 2000, not 4000.

---

### Tier 2 note: Prose cache invalidation

Tier 2 changes all 8 prompt builders (B3 context forwarding, B4 preamble, B5
vocabulary). The prose cache key is computed from
`generateHash(key, JSON.stringify(messages))` (prose.js line 114). Since the
messages include the full system and user prompts, any change to prompt text
(preamble, vocabulary interpolation, prior context) automatically produces a
different cache key.

This means Tier 2 changes will **not** match existing cache entries — every
entity will be regenerated on the next `make synthetic-update` run. This is the
desired behaviour (we want the new prompts to produce coherent prose), but it
means the first generation after Tier 2 ships will be a full LLM run, not a
cache-only run.

**Action:** After completing Tier 2, run `make synthetic-update` to regenerate
all prose and update `.prose-cache.json`. Commit the updated cache so that
subsequent `make synthetic` (cached mode) works without LLM calls.

---

## Tier 3 — Prevent regression

### C1. Unit tests for libsyntheticprose

**New files:**

- `libraries/libsyntheticprose/test/prompt-builders.test.js`
- `libraries/libsyntheticprose/test/prose-engine.test.js`
- `libraries/libsyntheticprose/test/pathway-generator.test.js`

**Prompt builder tests** (`prompt-builders.test.js`):

Test each of the 8 builders:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLevelPrompt } from "../prompts/pathway/level.js";

describe("buildLevelPrompt", () => {
  it("returns system and user messages", () => {
    const result = buildLevelPrompt(skeleton, schema);
    assert.ok(result.system);
    assert.ok(result.user);
  });

  it("includes JSON schema in user message", () => {
    const result = buildLevelPrompt(skeleton, schema);
    assert.ok(result.user.includes('"type"'));
  });

  it("references entity IDs from skeleton", () => {
    const result = buildLevelPrompt(skeleton, schema);
    for (const id of skeleton.levelIds) {
      assert.ok(result.user.includes(id));
    }
  });
});
```

Repeat pattern for all 8 builders. After B3, also test that `priorOutput`
appears in the prompt when provided.

**ProseEngine tests** (`prose-engine.test.js`):

```javascript
describe("ProseEngine", () => {
  it("returns cached result on cache hit", async () => { /* mock */ });
  it("calls LLM on cache miss", async () => { /* mock */ });
  it("strips JSON fences from response", () => { /* test generateJson */ });
  it("round-trips cache save and load", async () => { /* temp file */ });
});
```

**PathwayGenerator tests** (`pathway-generator.test.js`):

Mock `proseEngine` to return fixture data. Verify:

- All 9 steps execute in dependency order
- Each step receives correct skeleton and schema
- Self-assessments use the generated levels, not hardcoded values

**Verify:** `node --test libraries/libsyntheticprose/test/` passes.

---

### C2. Integration test for libuniverse Pipeline

**New file:** `libraries/libuniverse/test/pipeline.test.js`

Use a minimal DSL fixture (2 teams, 5 people, 1 project, 1 scenario) with
no-prose mode. Wire the pipeline with real `DslParser`, `EntityGenerator`, and
`Renderer`, but skip the prose engine (no LLM calls).

The `Pipeline` class (libuniverse/pipeline.js) has this interface:
`async run({ universePath, only, schemaDir })`. The prose engine mode is set at
construction time, not per-run. Wire with `mode: "no-prose"` in the
`ProseEngine` constructor.

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Pipeline } from "../pipeline.js";
// ... wire dependencies with ProseEngine in no-prose mode

describe("Pipeline", () => {
  it("completes parse-generate-render-validate without errors", async () => {
    const result = await pipeline.run({ universePath: fixturePath });
    assert.ok(result.entities);
    assert.ok(result.files);
    assert.strictEqual(result.validation.errors?.length ?? 0, 0);
  });
});
```

**Minimal DSL fixture:** Create
`libraries/libuniverse/test/fixtures/minimal.dsl` with the smallest valid
universe (1 org, 1 department, 1 team, 3 people, 1 project, 1 scenario, minimal
framework).

**Verify:** `node --test libraries/libuniverse/test/` passes.

---

### C3. Unit tests for untested renderers

**New files:**

- `libraries/libsyntheticrender/test/html-renderer.test.js`
- `libraries/libsyntheticrender/test/enricher.test.js`
- `libraries/libsyntheticrender/test/link-assigner.test.js`
- `libraries/libsyntheticrender/test/industry-data.test.js`

**html-renderer.test.js:** Render a minimal entity set to HTML. Verify output
contains expected `<article>` structure and `itemid` attributes.

**enricher.test.js:** Test `stripOffDomainIris` with both `/id/` and non-`/id/`
IRIs. After A3, all IRIs should be preserved. Test entity link injection for a
sample HTML document.

**link-assigner.test.js:** Test `assignLinks` with a small entity set. Verify:

- Blog dates are valid for counts > 24 (after A2 fix)
- Course `orgName` matches the entity org name (after A5 fix)
- All generated IRIs use `/id/` prefix
- Event and course catalogs produce valid structures

**industry-data.test.js:** Test `generateDrugs` and `generatePlatforms` return
arrays with required fields (`iri`, `name`, `id`, `category`).

**Verify:** `node --test libraries/libsyntheticrender/test/` passes.

---

### C4. Eval scenario reference check

**New file:** `libraries/libsyntheticrender/validate-eval.js`

A standalone validation function that:

1. Loads `config/eval.example.yml`
2. Extracts all entity name and IRI references from scenario definitions
3. Cross-references against the generated data (drugs, platforms, projects,
   people)
4. Reports missing references

```javascript
export function validateEvalReferences(evalConfig, generatedData) {
  const errors = [];
  // Extract entity refs from eval scenarios
  // Check each against generatedData
  return errors;
}
```

**Integration:** Add as an optional validation step in the Pipeline. Also usable
standalone via `node libraries/libsyntheticrender/validate-eval.js`.

**Immediate fix:** Audit ALL entity references in `config/eval.example.yml`, not
just names — include IRIs, team names, person names, project names, drug names,
and platform names. The following references need updating:

| Eval reference        | Type              | Status                                                                | Fix                                 |
| --------------------- | ----------------- | --------------------------------------------------------------------- | ----------------------------------- |
| `Immunex`             | Drug name         | Broken — `industry-data.js` uses `ImmuneX Pro` (id: `immunex-pro`)    | Update eval to `ImmuneX Pro`        |
| `Neurova`             | Drug name         | Broken — `industry-data.js` uses `NeuraLink-7` (id: `neuralink-7`)    | Update eval to `NeuraLink-7`        |
| `Project Alpha`       | Project name      | Broken — DSL defines `oncora`, `molecularforge`, etc.                 | Update eval to actual project ID    |
| `Project Gamma`       | Project name/IRI  | Broken — IRI `https://bionova.example/id/project/gamma`               | Update IRI to actual project IRI    |
| `GMP360`              | Platform name     | Broken — `industry-data.js` uses `BatchControl` (id: `batch-control`) | Update eval to `BatchControl`       |
| `ManufacturingOS`     | Platform name/IRI | Broken — `industry-data.js` uses `SupplyOptimizer` etc.               | Update eval to actual platform      |
| `Drug Discovery Team` | Team name         | Verify — must match generated team from DSL                           | Verify against `entities.js` output |
| `Thoth`               | Person name       | Verify — must exist in Greek name pool and be assigned correctly      | Verify against generation output    |
| `Minerva`             | Person name       | Verify — must exist in Greek name pool                                | Verify against generation output    |
| `BioNova R&D`         | Org/dept name     | Verify — must match DSL org structure                                 | Verify against generation output    |
| `MolecularForge`      | Platform name/IRI | OK — exists in `industry-data.js`                                     | No change needed                    |
| `Oncora`              | Drug name         | OK — exists in `industry-data.js`                                     | No change needed                    |

Run `make synthetic` in no-prose mode and cross-reference every named entity and
IRI in `eval.example.yml` against the generated output. Update all broken
references in a single commit.

**Verify:** Run the validator against current generated data — zero unresolved
references after fixing `eval.example.yml`.

---

## Tier 4 — Expand capability

### D1. Project narrative arcs

**Files:**

- `libraries/libsyntheticgen/dsl/parser.js` — new optional fields
- `libraries/libsyntheticrender/render/link-assigner.js` — consume fields
- `libraries/libsyntheticrender/render/enricher.js` — include in context

**DSL parser change:** Add optional array rules for `milestones`, `risks`,
`technical_choices` inside `project` blocks. Parse into the project entity as
arrays of strings. When absent, default to empty arrays.

**link-assigner.js change:** When generating blogs/events/articles for a
project, include the narrative fields in the content template:

```javascript
if (project.milestones?.length) {
  context += `\nKey milestones: ${project.milestones.join(", ")}`;
}
```

**enricher.js change:** Pass narrative fields into the enrichment prompt
context.

**DSL update (`examples/universe.dsl`):** Add narrative fields to at least 2
projects:

```
project oncora {
  ...
  milestones ["Phase 2 completion", "Phase 3 enrollment start"]
  risks ["enrollment delays", "manufacturing scale-up"]
  technical_choices ["mAb platform", "companion diagnostic"]
}
```

**Verify:** Generated blog content for `oncora` references "Phase 2" or
"enrollment" — terms from the narrative fields.

---

### D2. Scenario narrative context

**Files:**

- `libraries/libsyntheticgen/dsl/parser.js` — new optional field
- Activity generator (comment generation) — consume field

**DSL parser change:** Add optional `narrative` string field to `scenario`
blocks. When absent, defaults to `null`.

**Activity generator change:** When generating comments for a scenario with a
narrative, include the narrative in the comment generation prompt.

**DSL update:** Add narratives to at least 2 scenarios in
`examples/universe.dsl`.

**Verify:** Generated comments for scenarios with narratives reference narrative
themes.

---

### D3. People archetypes

**Files:**

- `libraries/libsyntheticgen/dsl/parser.js` — new optional block
- `libraries/libsyntheticgen/engine/entities.js` — assign archetype
- `libraries/libsyntheticprose/engine/pathway.js` — use archetype distribution

**DSL parser change:** Add optional `archetypes` block inside `people`. Parse as
`{ name: percentage }` pairs.

**entities.js change:** In `generatePeople`, assign an archetype to each person
based on the declared percentages using the seeded RNG.

**pathway.js change:** In `generateSelfAssessments`, shape the proficiency
distribution by archetype. Map proficiency levels to ordinal indices
(awareness=0 through expert=4), apply the offset, and clamp to [0, 4]:

- `high_performer`: shift +1 index above expected, clamp at 4 (expert)
- `new_hire`: shift −1 index below expected, clamp at 0 (awareness)
- `struggling`: shift −2 below expected, clamp at 0 (awareness)
- `steady_contributor`: use expected index (current behaviour)

```javascript
const PROFICIENCY_INDEX = { awareness: 0, foundational: 1, working: 2, practitioner: 3, expert: 4 };
const ARCHETYPE_OFFSET = { high_performer: 1, steady_contributor: 0, new_hire: -1, struggling: -2 };

function adjustProficiency(expected, archetype) {
  const base = PROFICIENCY_INDEX[expected];
  const offset = ARCHETYPE_OFFSET[archetype] || 0;
  const clamped = Math.max(0, Math.min(4, base + offset));
  return PROFICIENCY_LEVELS[clamped];
}
```

**Verify:** Generate with archetypes. Compare self-assessment distributions for
`high_performer` vs `struggling` — they should differ measurably (e.g.,
high_performer average proficiency index > struggling average by at least 1).

---

### D4. Content topic distributions

**Files:**

- `libraries/libsyntheticgen/dsl/parser.js` — new optional block
- `libraries/libsyntheticrender/render/link-assigner.js` — weighted selection

**DSL parser change:** Add optional `blog_topics` block inside `content`. Parse
as `{ topic: percentage }` pairs.

**link-assigner.js change:** Replace the `BLOG_TOPICS` array selection with
weighted selection from DSL values. When no `blog_topics` are defined, fall back
to the current uniform `BLOG_TOPICS` array.

```javascript
function selectWeightedTopic(topics, rng) {
  const total = topics.reduce((sum, t) => sum + t.weight, 0);
  let r = rng() * total;
  for (const t of topics) {
    r -= t.weight;
    if (r <= 0) return t.name;
  }
  return topics.at(-1).name;
}
```

**Verify:** Define 90/10 weighted topics in DSL. Generated blogs should show
approximately 90% of the dominant topic.

---

## Validation improvements (E)

### E1. Prose length validation

**File:** `libraries/libsyntheticrender/validate.js`

Add a `checkProseLength` check to `validateCrossContent`. Before setting final
ranges, measure the current distributions:

**Step 1 — Measure baselines:** Run `make synthetic-update` and compute
min/mean/max character counts for each prose field type across all generated
entities. Record the distributions.

**Step 2 — Set ranges:** Configure min/max as ±50% of the measured mean, rounded
to readable numbers. Provisional ranges (to be confirmed by measurement):

```javascript
const PROSE_RANGES = {
  description: { min: 50, max: 2000 },
  proficiencyDescription: { min: 20, max: 500 },
  maturityDescription: { min: 20, max: 500 },
};
```

These ranges must be validated against actual output before committing. If
measured values fall outside these provisionals, adjust the ranges to fit
observed reality — the goal is to catch outliers and truncation, not to reject
valid prose.

Iterate all prose fields in capabilities, behaviours, and levels. Flag values
outside the configured range.

**Verify:** Add check to the validation suite. Run against generated data —
should pass. If any fields fall outside the configured range, investigate
whether the range or the generation needs adjustment.

---

### E2. Proficiency monotonicity check

**File:** `libraries/libsyntheticrender/validate.js`

Add a `checkProficiencyMonotonicity` check. For each skill's level-to-level
proficiency baselines, verify the sequence is non-decreasing when mapped to the
proficiency index (awareness=0, foundational=1, working=2, practitioner=3,
expert=4).

**Verify:** Run against generated data. If violations are found, tune the level
prompt (B3 context forwarding should help). Measure the violation rate before
and after B3 to confirm that context forwarding actually reduces monotonicity
violations.

---

### E3. Self-assessment plausibility check

**File:** `libraries/libsyntheticrender/validate.js`

Add a `checkSelfAssessmentPlausibility` check. For each level's self-assessment
distribution, verify the median skill rating is within ±1 of the expected
proficiency for that level. Flag distributions where L5 people have a majority
of "awareness" ratings.

**Calibration:** Before committing the ±1 threshold, measure the actual
deviation in current generated data. If the current median deviation is larger
than ±1 (which it likely is, given flat jitter), start with a wider threshold
(e.g., ±2) and tighten it after D3 (archetypes) ships. The check should catch
gross implausibility, not enforce exact alignment.

**Verify:** Run against generated data. After D3 (archetypes), plausibility
should improve further — re-measure and tighten the threshold.

---

## Implementation order

Work proceeds left-to-right within each tier, but tiers are sequential:

```
Tier 1: A1 → A2 → A3 → A4 → A5
Tier 2: B1 → B4 → B5 → B2 → B3 → B6 → B7
Tier 3: C3 → C1 → C2 → C4
Tier 4: D1 → D2 → D3 → D4
Validation: E1 → E2 → E3
```

**Tier 2 ordering rationale:** B1 (vocabulary extraction) must come before B4
(preamble uses vocabulary) and B5 (prompts consume vocabulary). B5 depends on
both B1 and B4 (it says "After B1 extracts vocabulary … and B4 introduces the
preamble"), so B4 must precede B5. B2 (derive drivers) is independent of
vocabulary but should follow B1 since validate.js is touched by both. B3
(context forwarding) is the largest change and depends on B1/B4/B5 being stable.

**Tier 3 ordering rationale:** C3 (render tests) covers the Tier 1 bug fixes
(A2, A3, A5 in link-assigner/enricher) and should land first since Tier 1 ships
before Tier 2. C1 (prose tests) covers the Tier 2 changes to the prose layer. C2
(pipeline integration) exercises the full chain and should come after unit-level
coverage. C4 (eval check) is standalone.

Each tier is independently shippable. Commit after completing each lettered item
within a tier.

---

## Verification checklist

After all tiers:

```sh
npm run test                    # Unit tests pass
npm run check                   # Lint + format + test
make synthetic                  # Generation succeeds
npx fit-map validate            # Data validation passes
```
