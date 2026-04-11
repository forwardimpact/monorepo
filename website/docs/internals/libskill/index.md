---
title: libskill Internals
description: "Derivation engine — key functions, module index, imports, and technical details of skill, behaviour, and responsibility derivation."
---

## Module Index

| Module               | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `src/derivation.js`  | Core derivation functions (skills, behaviours, drivers) |
| `src/agent.js`       | Agent profile generation                                |
| `src/job.js`         | Job preparation for display                             |
| `src/job-cache.js`   | Job caching for performance                             |
| `src/interview.js`   | Interview question selection                            |
| `src/progression.js` | Career path analysis and gap identification             |
| `src/checklist.js`   | Stage transition checklist derivation                   |
| `src/toolkit.js`     | Tool derivation from skill references                   |
| `src/profile.js`     | Profile filtering (human + agent)                       |
| `src/modifiers.js`   | Capability and skill modifier resolution                |
| `src/matching.js`    | Job matching and gap analysis                           |
| `src/policies/`      | Ordering, sorting, filtering, and threshold policies    |

libskill is pure-function by design and intentionally exempt from OO+DI. All
functions are stateless and side-effect-free.

---

## Skill Derivation Technical Details

Every skill goes through a four-step derivation pipeline.

### Step 1: Determine Skill Type

Each discipline classifies every skill into one of three tiers:

| Tier             | Constant    | Purpose                        |
| ---------------- | ----------- | ------------------------------ |
| coreSkills       | `PRIMARY`   | Deepest expertise for the role |
| supportingSkills | `SECONDARY` | Supporting capability          |
| broadSkills      | `BROAD`     | General awareness              |

A lookup map is built once per discipline via `buildSkillTypeMap()` for O(1)
access during derivation. Individual lookups use `getSkillTypeForDiscipline()`.

### Step 2: Get Base Proficiency from Level

Each level defines `baseSkillProficiencies` mapping the skill type (primary,
secondary, broad) to a starting proficiency.

### Step 3: Apply Track Modifier

Tracks define capability-based skill modifiers. The modifier for a skill's
capability is added to the base proficiency:

```
derivedIndex = baseLevelIndex + trackModifier
```

### Step 4: Clamp to Valid Range

Two constraints are applied:

1. **Positive modifier cap** -- Positive modifiers cannot push the result above
   the level's maximum base proficiency.
2. **Range clamp** -- The final result must fall between `awareness` (0) and
   `expert` (4).

The full matrix is assembled by `deriveSkillMatrix()`, which runs the pipeline
for every skill in the discipline. Behaviours are derived by
`deriveBehaviourProfile()` using a simpler formula:
`Level Base + Discipline Modifier + Track Modifier`, clamped to valid range.

---

## Key Functions

| Function                      | Module        | Purpose                                        |
| ----------------------------- | ------------- | ---------------------------------------------- |
| `buildSkillTypeMap()`         | derivation.js | Build O(1) skill type lookup for a discipline  |
| `getSkillTypeForDiscipline()` | derivation.js | Determine skill tier (primary/secondary/broad) |
| `deriveSkillProficiency()`    | derivation.js | Full skill derivation pipeline for one skill   |
| `deriveSkillMatrix()`         | derivation.js | Derive all skills for a job                    |
| `deriveBehaviourProfile()`    | derivation.js | Derive all behaviours for a job                |
| `deriveResponsibilities()`    | derivation.js | Derive role responsibilities from capabilities |
| `calculateDriverCoverage()`   | derivation.js | Check driver coverage against thresholds       |
| `resolveSkillModifier()`      | modifiers.js  | Resolve track modifier for a skill             |

---

## Lifecycle Key Functions

| Function                | Module                | Purpose                               |
| ----------------------- | --------------------- | ------------------------------------- |
| `deriveChecklist()`     | checklist.js          | Derive stage transition checklists    |
| `getStageOrder()`       | policies/orderings.js | Return stage ordering for comparisons |
| `compareByStageOrder()` | policies/orderings.js | Sort stages by lifecycle order        |

### Lifecycle Data Structure

```javascript
// Stage definition (from stages.yaml)
{
  id: "code",
  name: "Code",
  emojiIcon: "...",
  description: "Implement the solution and write tests",
  constraints: ["Cannot change architecture", ...],
  handoffs: [
    { name: "Request Review", targetStage: "review", prompt: "..." }
  ]
}

// Derived checklist output
{
  readChecklist: [
    { skill: { id, name }, capability: { id, name, emojiIcon }, items: [...] }
  ],
  confirmChecklist: [
    { skill: { id, name }, capability: { id, name, emojiIcon }, items: [...] }
  ]
}
```

---

## Programmatic Access

```javascript
// Core derivation
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveResponsibilities,
  calculateDriverCoverage,
} from "@forwardimpact/libskill/derivation";

// Profile preparation (human + agent)
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";

// Agent derivation
import { deriveReferenceLevel, deriveAgentSkills } from "@forwardimpact/libskill/agent";

// Lifecycle
import { deriveChecklist } from "@forwardimpact/libskill/checklist";

// Career progression
import { analyzeProgression } from "@forwardimpact/libskill/progression";

// Job matching
import { calculateJobMatch, findMatchingJobs } from "@forwardimpact/libskill/matching";
```

---

## Related Documentation

- [Pathway Internals](/docs/internals/pathway/) -- Presentation layer that
  consumes derived data
- [Model Reference](/docs/reference/model/) -- Entity overview and derivation
  formula
