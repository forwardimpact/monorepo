# Part 04 — Synthetic data pipeline: remove stage vocabulary, DSL parsing, prompts, rendering

## Scope

Remove all stage-related code from the synthetic data pipeline so that
regenerating data (`just synth` or equivalent) produces `data/pathway/` without
`stages.yaml` and with flat skill checklists.

## Changes

### 1. Remove `STAGE_NAMES` from vocabulary

**File:** `libraries/libsyntheticgen/src/vocabulary.js`

Delete `STAGE_NAMES` constant (lines 28-35).

**File:** `libraries/libsyntheticgen/src/index.js`

Remove `STAGE_NAMES` from the re-export (line 8).

### 2. Remove stage parsing from DSL

**File:** `libraries/libsyntheticgen/src/dsl/tokenizer.js`

Remove `stages` from the keyword list (line 71).

**File:** `libraries/libsyntheticgen/src/dsl/parser-framework.js`

In `parseFramework()` (line 194):

- Remove `stages: []` from framework AST initialization (line 205)
- Remove `"stages"` from `FW_ARRAY_KEYS` set (line 207)

The DSL `stages [specify, plan, ...]` line in `story.dsl` will become a parse
error. This is intentional — the DSL must be updated.

### 3. Update DSL source file

**File:** `data/synthetic/story.dsl`

Remove the `stages` line from the `framework` block (line 743):

```
Before: stages [specify, plan, scaffold, code, review, deploy]
After:  (line deleted)
```

### 4. Delete stage prompt template

**Delete:** `libraries/libsyntheticprose/src/prompts/pathway/stage.js`

This file contains `buildStagePrompt()` which generates LLM instructions for
stage definitions — no longer needed.

### 5. Update capability prompt — flat agent structure

**File:** `libraries/libsyntheticprose/src/prompts/pathway/capability.js`

- Remove `import { STAGE_NAMES } from "@forwardimpact/libsyntheticgen"` (line 4
  or equivalent)
- In `buildCapabilityPrompt()` (lines 15-103), replace the `agent.stages`
  instruction block (lines 62-70) with flat agent field instructions:

**Before (lines 62-70):**

```
"- agent.stages: Object with ONLY the stages where this skill is meaningfully relevant."
... (stage criteria, per-stage focus/readChecklist/confirmChecklist)
```

**After:**

```
"- agent.focus: 1 sentence — the overall primary focus for this skill."
"- agent.readChecklist: Array of 5-9 items — steps to read/understand before acting."
"  Follow READ-DO semantics: read each item, then do it."
"- agent.confirmChecklist: Array of 5-9 items — items to verify after completing work."
"  Follow DO-CONFIRM semantics: do from memory, then confirm every item."
```

Remove all `STAGE_NAMES[N]` references and stage criteria guidance.

### 6. Update framework prompt

**File:** `libraries/libsyntheticprose/src/prompts/pathway/framework.js`

In `buildFrameworkPrompt()` (line 40), remove the annotation that explains
`stage` as a lifecycle phase.

### 7. Update pathway generation engine

**File:** `libraries/libsyntheticprose/src/engine/pathway.js`

In `generatePathwayData()` (lines 99-246):

- Remove Step 3 (lines 128-135) — stage generation via `buildStagePrompt()`
- Remove `stages` from the returned pathway data object
- Remove `import { buildStagePrompt }` if present

The remaining generation steps (behaviours, capabilities, drivers, disciplines,
tracks) proceed unchanged. Capabilities now generate flat agent fields instead
of nested stage blocks.

### 8. Update pathway rendering

**File:** `libraries/libsyntheticrender/src/render/pathway.js`

In `renderPathway()` (lines 50-66):

- Remove `["stages", "stages.yaml", "stages"]` from `SINGLE_FILE_ENTITIES`
  (lines 10-16)

This ensures `stages.yaml` is not output when rendering pathway data.

### 9. Regenerate synthetic data

After all code changes, run the synthetic data pipeline to produce new
`data/pathway/` output:

```sh
just synth   # or equivalent regeneration command
```

Verify:

- No `data/pathway/stages.yaml` exists
- Capability YAML files have `agent.{focus, readChecklist, confirmChecklist}`
  per skill (flat, not nested under `agent.stages`)

### 10. Update tests

Update or add tests in the relevant test directories:

- `libraries/libsyntheticgen/test/` — verify `STAGE_NAMES` is not exported, DSL
  parsing rejects `stages` keyword
- `libraries/libsyntheticprose/test/prompt-builders.test.js` — remove
  `buildStagePrompt` import (line 5), delete stage prompt tests (lines 70-87),
  verify capability prompt includes flat agent fields
- `libraries/libsyntheticrender/test/` — verify pathway render does not output
  `stages.yaml`

## Verification

```sh
cd libraries/libsyntheticgen && bun test
cd libraries/libsyntheticprose && bun test
cd libraries/libsyntheticrender && bun test
just synth
ls data/pathway/stages.yaml  # should not exist
grep -r 'agent.stages' data/pathway/capabilities/  # should return no matches
```

Success criteria from spec:

- `STAGE_NAMES` is absent from libsyntheticgen exports (criterion 10)
- Regenerated data has no `stages.yaml` and flat skill checklists (criterion 9)

## Blast radius

| Action     | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete     | `libraries/libsyntheticprose/src/prompts/pathway/stage.js`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Modify     | `libraries/libsyntheticgen/src/vocabulary.js`, `libraries/libsyntheticgen/src/index.js`, `libraries/libsyntheticgen/src/dsl/tokenizer.js`, `libraries/libsyntheticgen/src/dsl/parser-framework.js`, `libraries/libsyntheticprose/src/prompts/pathway/capability.js`, `libraries/libsyntheticprose/src/prompts/pathway/framework.js`, `libraries/libsyntheticprose/src/engine/pathway.js`, `libraries/libsyntheticrender/src/render/pathway.js`, `data/synthetic/story.dsl` |
| Regenerate | All files under `data/pathway/`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
