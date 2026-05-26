# Part 01 — Map product: remove stage schema, validation, loading, rendering

## Scope

Remove all stage-related code from `products/map/`. After this part, the map
product no longer knows about stages: no schema, no validation, no loading, no
rendering, no starter data.

## Changes

### 1. Delete stage schema files

**Delete:**

- `products/map/schema/json/stages.schema.json`
- `products/map/schema/rdf/stages.ttl`

### 2. Delete stage starter data

**Delete:**

- `products/map/starter/stages.yaml`

### 2a. Remove `stageId` from shared schema definitions

**File:** `products/map/schema/json/defs.schema.json`

Remove the `stageId` enum definition (line 29 and surrounding block). This
shared definitions file is referenced by other schemas — verify no remaining
`$ref` to `stageId` exists after removal.

### 3. Remove stage from data loader

**File:** `products/map/src/loader.js`

In `loadAllData()` (line 330), remove the line that loads `stages.yaml`:

```
Before: stages are loaded and included in the returned data object
After:  no stages property in returned data
```

Remove `stages` from the returned object (line 343).

### 4. Remove stage validation

**File:** `products/map/src/validation/level.js`

Delete `validateStage()` function (lines 217-283).

**File:** `products/map/src/validation.js`

- Delete `validateStageHandoffTargets()` (lines 65-83).
- In `validateAllData()` (lines 174-181), remove the stage validation loop and
  the call to `validateStageHandoffTargets`.
- Remove `stages` from the data destructuring at the top of `validateAllData`.

**File:** `products/map/src/validation/agent.js`

- Delete `validateSkillAgentStages()` (lines 93-119) — validates that skills
  have stage entries for all required stages.
- Delete `validateAgentSkillStageFields()` (lines 121-162) — validates
  focus/readChecklist/confirmChecklist within a stage block.
- In `validateAgentData()` (lines 214-250), remove calls to these functions.
- Add new validation for flat agent skill fields: each skill with an `agent`
  section must have `agent.focus` (string), `agent.readChecklist` (array, 1+
  items), and `agent.confirmChecklist` (array, 1+ items). No `agent.stages` key
  allowed.

**File:** `products/map/src/validation/skill.js`

- Delete `validateStageFields()` (lines 57-118).
- Delete `validateSkillAgentStages()` (lines 120-183).
- Add new validation for flat skill agent structure: `agent.focus` required
  string, `agent.readChecklist` required non-empty array,
  `agent.confirmChecklist` required non-empty array. Reject if `agent.stages` is
  present (error: "skill agent uses deprecated stages nesting — flatten to
  agent.focus/readChecklist/ confirmChecklist").

**File:** `products/map/src/schema-validation.js`

Remove `stages.yaml` → `stages.schema.json` entry from `SCHEMA_MAPPINGS` (line
22).

### 5. Remove stage ordering utility

**File:** `products/map/src/levels.js`

Delete `getStageOrder()` function (lines 73-75) and its documentation comment
block (lines 57-75).

### 6. Remove stage IRI helper

**File:** `products/map/src/iri.js`

- Delete `stageIri()` (line 19).
- Remove `stage` parameter from `agentProfileIri()` (lines 33-36). New
  signature: `agentProfileIri(discipline, track)`.

### 7. Remove stage view builder

**Delete:**

- `products/map/src/view-builders/stage.js`

Remove its export from `products/map/src/view-builders/index.js` (line 11:
`export { buildStageView } from "./stage.js"`).

### 8. Remove stage renderer and exporter

**File:** `products/map/src/renderer.js`

Delete `renderStage()` (lines 78-82).

**File:** `products/map/src/exporter.js`

In `#buildTasks()` (lines 74-80), remove the stage rendering loop.

### 9. Delete stage template

**Delete:**

- `products/map/templates/stage.html`

### 10. Remove stage from init command

**File:** `products/map/src/commands/init.js`

Remove stage references in data structure documentation (line 73).

### 11. Flatten capability YAML agent sections

**Files:** All capability YAML files under `data/pathway/capabilities/`

For each skill that has `agent.stages`:

**Before:**

```yaml
agent:
  name: data-integration
  description: "..."
  useWhen: "..."
  stages:
    specify:
      focus: "Clarify data sources..."
      readChecklist: [...]
      confirmChecklist: [...]
    code:
      focus: "Automate data extraction..."
      readChecklist: [...]
      confirmChecklist: [...]
    review:
      focus: "Validate data integrity..."
      readChecklist: [...]
      confirmChecklist: [...]
```

**After:**

```yaml
agent:
  name: data-integration
  description: "..."
  useWhen: "..."
  focus: "Integrate, transform, and validate data pipelines."
  readChecklist:
    - "Review source data schemas and formats."
    - "Understand regulatory data compliance requirements."
    - "Check existing integration patterns and dependencies."
    - "Identify data quality validation rules."
    - "Review transformation logic and business rules."
  confirmChecklist:
    - "Data sources and integration scope are well defined."
    - "Extraction, transformation, and loading processes are automated."
    - "Data integrity and compliance are validated."
    - "Pipeline monitoring and error handling are in place."
    - "Integration tests cover critical data flows."
```

The consolidated `focus` captures the overall skill focus (not stage-specific).
The `readChecklist` and `confirmChecklist` merge the most important items from
all stage-specific checklists, following CHECKLISTS.md guidelines:

- `readChecklist`: READ-DO semantics (5-9 items)
- `confirmChecklist`: DO-CONFIRM semantics (5-9 items)
- Precise, actionable phrasing

**This is the most labor-intensive step.** Each skill needs human judgment to
consolidate 2-6 stage checklists into one coherent flat checklist. Use LLM
assistance for the initial draft, then verify quality manually.

**Note:** Part 04 (synthetic pipeline) will regenerate `data/pathway/`
capabilities from scratch with the new flat format. The manual flattening here
is needed only if Parts 01-03 must pass tests before Part 04 runs. If executing
all parts on a single branch, defer this step to Part 04's regeneration and
instead temporarily stub the data files to unblock validation tests.

### 12. Delete generated stages.yaml

**Delete:**

- `data/pathway/stages.yaml`

### 13. Update tests

**Files:**

- `products/map/test/levels.test.js` — remove `getStageOrder` tests (lines
  71-90)
- `products/map/test/view-builders/others.test.js` — remove `buildStageView`
  test
- `products/map/test/exporter.test.js` — remove stage export tests
- `products/map/test/data-loader.test.js` — remove stage loading expectations
- `products/map/test/renderer.test.js` — remove stage rendering tests
- `products/map/test/pipeline.test.js` — update pipeline test to not expect
  stages
- `products/map/test/iri.test.js` — remove `stageIri` test, update
  `agentProfileIri` test

Add tests for the new flat agent validation in `products/map/test/` — verify
that `agent.stages` is rejected and
`agent.{focus, readChecklist, confirmChecklist}` is accepted.

## Verification

```sh
cd products/map && bun test
bunx fit-map validate   # passes with no stage schemas or data
```

## Blast radius

| Action         | Files                                                                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete         | `schema/json/stages.schema.json`, `schema/rdf/stages.ttl`, `starter/stages.yaml`, `templates/stage.html`, `src/view-builders/stage.js`, `data/pathway/stages.yaml`                                                                                                                                                     |
| Modify         | `schema/json/defs.schema.json`, `src/loader.js`, `src/validation.js`, `src/validation/level.js`, `src/validation/agent.js`, `src/validation/skill.js`, `src/schema-validation.js`, `src/levels.js`, `src/iri.js`, `src/renderer.js`, `src/exporter.js`, `src/commands/init.js`, all `data/pathway/capabilities/*.yaml` |
| Modify (tests) | `test/levels.test.js`, `test/view-builders/others.test.js`, `test/exporter.test.js`, `test/data-loader.test.js`, `test/renderer.test.js`, `test/pipeline.test.js`, `test/iri.test.js`                                                                                                                                  |
