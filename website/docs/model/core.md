---
title: Core Derivation
description: Detailed explanation of how skill proficiencies, behaviour maturities, and responsibilities are derived from entity combinations.
---

## Overview

Derivation is the process of transforming raw entity definitions into concrete
role expectations. Given a discipline, track, and level, the engine produces
exact skill proficiencies, behaviour maturities, and responsibilities.

> See [Core Model](/docs/model/) for the entity overview and formula.

---

## Skill Derivation

Every skill goes through a four-step derivation pipeline.

### Step 1: Determine Skill Type

Each discipline classifies every skill into one of three tiers:

| Tier             | Constant    | Purpose                        |
| ---------------- | ----------- | ------------------------------ |
| coreSkills       | `PRIMARY`   | Deepest expertise for the role |
| supportingSkills | `SECONDARY` | Supporting capability          |
| broadSkills      | `BROAD`     | General awareness              |

A lookup map is built once per discipline via `buildSkillTypeMap()` for O(1)
access during derivation.

### Step 2: Get Base Proficiency from Level

Each level defines base skill proficiencies per tier:

```yaml
# Example level definition
baseSkillProficiencies:
  primary: practitioner
  secondary: working
  broad: foundational
```

The level's `baseSkillProficiencies` maps the skill type to a starting
proficiency.

### Step 3: Apply Track Modifier

Tracks define capability-based skill modifiers. The modifier for a skill's
capability is added to the base proficiency:

```yaml
# Example track definition
skillModifiers:
  delivery: 1      # +1 to ALL delivery skills
  scale: -1        # -1 to ALL scale skills
```

The modifier shifts the proficiency index:

```
derivedIndex = baseLevelIndex + trackModifier
```

### Step 4: Clamp to Valid Range

Two constraints are applied:

1. **Positive modifier cap** — Positive modifiers cannot push the result above
   the level's maximum base proficiency. If the level peaks at `practitioner`, a
   +1 modifier cannot produce `expert`.

2. **Range clamp** — The final result must fall between `awareness` (0) and
   `expert` (4).

```
Final Proficiency = clamp(0, cappedIndex, 4)
```

### Complete Derivation Example

| Input      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Discipline | Software Engineering                                             |
| Level      | L3 (primary=practitioner, secondary=working, broad=foundational) |
| Track      | Platform (delivery: +1, scale: -1)                               |
| Skill      | CI/CD (capability: delivery, tier: supportingSkills)             |

1. **Skill type**: SECONDARY (supporting skill)
2. **Base proficiency**: working (index 2)
3. **Modifier**: +1 (delivery capability)
4. **Cap check**: practitioner (index 3) ≤ max base practitioner (index 3) — OK
5. **Result**: practitioner

---

## Behaviour Derivation

Behaviours use a simpler derivation:

```
Final Maturity = Level Base + Discipline Modifier + Track Modifier
```

| Step                | Source                    | Example        |
| ------------------- | ------------------------- | -------------- |
| Level base          | `baseBehaviourMaturity`   | developing (1) |
| Discipline modifier | `behaviourModifiers.{id}` | +1             |
| Track modifier      | `behaviourModifiers.{id}` | 0              |
| **Result**          | Clamped to valid range    | practicing (2) |

Maturities are clamped between `emerging` (0) and `exemplifying` (4).

---

## Responsibility Derivation

Responsibilities come from capabilities and vary by role type:

| Role Type         | Source                                    |
| ----------------- | ----------------------------------------- |
| Professional (IC) | `capability.professionalResponsibilities` |
| Management        | `capability.managementResponsibilities`   |

Responsibilities are selected by the derived skill proficiency for each
capability. Higher skill proficiencies unlock additional responsibilities.

---

## Driver Coverage

Drivers represent organizational outcomes. Coverage is calculated by checking
which skills and behaviours meet specific thresholds:

| Threshold          | Value                      |
| ------------------ | -------------------------- |
| Skill proficiency  | working or above           |
| Behaviour maturity | practicing or above        |
| Level              | Senior threshold and above |

Each driver specifies related skills and behaviours. If the derived job meets
the thresholds for a driver's dependencies, that driver is considered covered.

---

## Modifier Policies

### Positive Modifier Capping

When a track modifier is positive, the resulting level cannot exceed the level's
maximum base skill proficiency. This prevents lower levels from gaining
unrealistically high expertise just because a track emphasizes a particular
area.

### Negative Modifiers

Negative modifiers are not capped — they can freely reduce a level down to
`awareness`. This models the reduced expectations in de-emphasized areas.

### Capability-Level Modifiers

Track modifiers apply at the capability level, affecting all skills in that
capability equally. This avoids per-skill configuration while still allowing
meaningful differentiation between tracks.

---

## Technical Reference

### Key Functions

| Function                    | Module        | Purpose                            |
| --------------------------- | ------------- | ---------------------------------- |
| `buildSkillTypeMap()`       | derivation.js | O(1) skill type lookup             |
| `getSkillType()`            | derivation.js | Determine skill tier               |
| `deriveSkillProficiency()`  | derivation.js | Full skill derivation pipeline     |
| `deriveSkillMatrix()`       | derivation.js | All skills for a job               |
| `deriveBehaviourProfile()`  | derivation.js | All behaviours for a job           |
| `deriveResponsibilities()`  | derivation.js | Role responsibilities              |
| `calculateDriverCoverage()` | derivation.js | Driver coverage analysis           |
| `resolveSkillModifier()`    | modifiers.js  | Resolve track modifier for a skill |

### Imports

```javascript
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveResponsibilities,
  calculateDriverCoverage,
} from "@forwardimpact/libpathway/derivation";
```

---

## Related Documentation

- [Core Model](/docs/model/) — Entity overview and formula
- [Lifecycle](/docs/model/lifecycle/) — Stages and handoffs
- [Map](/docs/map/) — Data format and validation
