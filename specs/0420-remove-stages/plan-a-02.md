# Part 02 — libskill: rewrite agent derivation, skill markdown, checklist, exports

## Scope

Rewrite the stage-based agent generation in libskill to produce one agent per
discipline (x track) using flat skill checklists. Remove all stage ordering,
stage transitions, stage-keyed checklist derivation, and stage-based agent
profile generation.

## Changes

### 1. Delete `agent-stage.js`

**Delete:** `libraries/libskill/src/agent-stage.js`

This file contains `deriveStageAgent`, `generateStageAgentProfile`,
`buildAgentIndex`, and `interpolateTeamInstructions`. All are replaced by new
functions in `agent.js`.

### 2. Rewrite `agent.js` — new `generateAgentProfile` function

**File:** `libraries/libskill/src/agent.js`

**Remove:**

- `import { compareByStageOrder }` (line 29)
- `deriveStageTransitions()` (lines 202-224) — stage transitions no longer exist
- Re-exports of `deriveStageAgent`, `generateStageAgentProfile`,
  `buildAgentIndex`, `interpolateTeamInstructions` from `agent-stage.js` (lines
  232-237)
- `generateSkillMarkdown` current implementation (lines 137-193)

**Add new function: `generateAgentProfile()`**

Replaces `generateStageAgentProfile`. Parameters:

```js
export function generateAgentProfile({
  discipline, track, level, skills, behaviours,
  agentBehaviours, agentDiscipline, agentTrack,
})
```

Returns `{ frontmatter, bodyData, filename }` where:

- **filename**: `{kebab(roleTitle)}.md` or `{kebab(roleTitle)}--{track}.md`
  - Uses `discipline.roleTitle` kebab-cased, not abbreviations
  - Example: `software-engineer--platform.md`, `data-engineer.md`
- **frontmatter.name**: filename without `.md`
- **frontmatter.description**: `"{specialization} ({track.name})"` or
  `"{specialization}"` when no track
- **frontmatter.model**: `"opus"`
- **frontmatter.skills**: array of skill dirnames
- **bodyData**: includes `title`, `identity`, `priority`, `skillIndex`,
  `roleContext`, `workingStyles`, `disciplineConstraints`, `trackConstraints`,
  `teamInstructions` — same as current `buildStageProfileBodyData` but without
  `stageId`, `stageName`, `stageDescription`, `stageConstraints`,
  `stageTransitions`, `returnFormat`

The `skillIndex` filter changes from:

```js
// Before: only skills with agent.stages[stage.id]
if (!skill.agent.stages?.[stage.id]) return null;
```

To:

```js
// After: all skills with an agent section
if (!skill.agent) return null;
```

**Add new function: `buildAgentIndex()`**

Replaces stage-based version. Iterates disciplines × tracks (no stages):

```js
export function buildAgentIndex({ disciplines, tracks, agentDisciplines, agentTracks })
```

Returns `[{id, name, description}]` where:

- `id`: `{kebab(roleTitle)}--{track}` or `{kebab(roleTitle)}`
- `name`: `"{specialization} - {track.name}"` or `"{specialization}"`
- `description`: `"{specialization} ({track.name})."`

**Move `interpolateTeamInstructions` into `agent.js`** (currently in
`agent-stage.js`). No logic change needed.

**Rewrite `generateSkillMarkdown()`**

New signature — no `stages` parameter:

```js
export function generateSkillMarkdown({ skillData })
```

**Before:** reads `agent.stages[stageId]` for each stage, builds sorted stages
array with focus/readChecklist/confirmChecklist per stage, next stage handoffs.

**After:** reads flat `agent.focus`, `agent.readChecklist`,
`agent.confirmChecklist` directly. Returns:

```js
return {
  frontmatter: { name: agent.name, description: agent.description, useWhen: agent.useWhen || "" },
  title: name,
  focus: agent.focus,
  readChecklist: agent.readChecklist || [],
  confirmChecklist: agent.confirmChecklist || [],
  instructions: skillData.instructions || "",
  installScript: skillData.installScript || "",
  implementationReference: skillData.implementationReference || "",
  toolReferences: skillData.toolReferences || [],
  dirname: agent.name,
};
```

No `stages` array in the return value. No stage comparator. No handoff lookup.

### 3. Rewrite `checklist.js`

**File:** `libraries/libskill/src/checklist.js`

**Remove:** `deriveChecklist()` function entirely. It exists solely to aggregate
stage-keyed checklists — with flat checklists, this aggregation is unnecessary.
Checklists are directly on each skill's agent section and rendered inline.

**Keep:** `formatChecklistMarkdown()` — may still be useful for rendering skill
checklists. Update its input type to match the new flat structure if needed.

Alternatively, if `formatChecklistMarkdown` has no remaining callers after the
pathway changes (Part 03), delete the entire file.

### 4. Rewrite `job.js`

**File:** `libraries/libskill/src/job.js`

**Remove:**

- `import { getStageOrder } from "@forwardimpact/map/levels"` (line 21)
- `import { deriveChecklist } from "./checklist.js"` (line 19)
- `deriveAllChecklists()` function (lines 61-73)
- `checklists` from `buildJobDetailView` (lines 108-111, 131)
- `stages` parameter from `prepareJobDetail` (line 157)

The `JobDetailView` type loses its `checklists` property. The `prepareJobDetail`
function no longer accepts or passes `stages`.

### 5. Remove stage ordering from policies

**File:** `libraries/libskill/src/policies/orderings.js`

**Remove:**

- `import { getStageOrder } from "@forwardimpact/map/levels"` (line 15)
- `export { getStageOrder }` re-export (line 19)
- `compareByStageOrder()` function (lines 44-51)
- The "Stage Comparators" section header comment

**File:** `libraries/libskill/src/policies/index.js`

**Remove:**

- `getStageOrder` export (line 122)
- `compareByStageOrder` export (line 123)
- The comment "Data-driven stage ordering" (line 121)

### 6. Update `agent-validation.js`

**File:** `libraries/libskill/src/agent-validation.js`

In `estimateBodyDataLength()`:

- Remove `stageConstraints` length estimation (lines 36-39)
- Keep `disciplineConstraints` and `trackConstraints`
- Remove `stageDescription` from `stringFields` (line 18 — currently listed as a
  string)

### 7. Update root exports

**File:** `libraries/libskill/src/index.js`

**Remove:**

- `deriveStageTransitions` from agent.js exports (line 98)
- `deriveStageAgent`, `generateStageAgentProfile`, `buildAgentIndex`,
  `interpolateTeamInstructions` from agent-stage.js exports (lines 106-111)
- `deriveChecklist` from checklist.js exports (line 114) — if checklist.js is
  deleted, remove both exports

**Add:**

- `generateAgentProfile` to agent.js exports
- `buildAgentIndex` to agent.js exports (moved from agent-stage.js)
- `interpolateTeamInstructions` to agent.js exports (moved from agent-stage.js)

**Keep:**

- `generateSkillMarkdown` (updated signature)
- `formatChecklistMarkdown` if kept
- `validateAgentProfile`, `validateAgentSkill`

### 8. Update tests

**File:** `libraries/libskill/test/policies-orderings-advanced.test.js`

Remove `compareByStageOrder` tests.

Add/update tests for:

- `generateAgentProfile` — verify it produces a single profile per
  discipline/track with correct naming pattern
- `generateSkillMarkdown` — verify it reads flat agent fields, not stages
- `buildAgentIndex` — verify no stage dimension in output

## Verification

```sh
cd libraries/libskill && bun test
```

## Blast radius

| Action         | Files                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete         | `src/agent-stage.js`                                                                                                                              |
| Modify         | `src/agent.js`, `src/checklist.js`, `src/job.js`, `src/agent-validation.js`, `src/policies/orderings.js`, `src/policies/index.js`, `src/index.js` |
| Modify (tests) | `test/policies-orderings-advanced.test.js`                                                                                                        |
