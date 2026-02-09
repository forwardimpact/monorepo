---
title: Model
description: Derivation engine for roles, skills, and agent team profiles.
---

## Purpose

The model package contains the core logic that transforms raw data into
actionable role definitions. Whether generating a human job description or a
coding agent team profile, the same derivation engine ensures consistent
expectations.

## Core Derivation

The fundamental formula:

```
Job = Discipline × Track × Grade
Agent = Discipline × Track × Stage
```

Both use the same skill and behaviour derivation, differentiated by:

- **Jobs**: Use all skills, capped by grade ceiling
- **Agents**: Filter `isHumanOnly` skills, constrain by stage

## Key Modules

| Module           | Purpose                         |
| ---------------- | ------------------------------- |
| `derivation.js`  | Core derivation functions       |
| `agent.js`       | Agent profile generation        |
| `job.js`         | Job preparation for display     |
| `job-cache.js`   | Job caching for performance     |
| `interview.js`   | Question selection              |
| `progression.js` | Career path analysis            |
| `checklist.js`   | Stage transition checklists     |
| `toolkit.js`     | Tool derivation from skills     |
| `profile.js`     | Profile filtering (human/agent) |
| `modifiers.js`   | Capability and skill modifiers  |
| `matching.js`    | Job matching and gap analysis   |

## Usage

```javascript
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveJob,
} from "@forwardimpact/model/derivation";

import { prepareAgentProfile } from "@forwardimpact/model/profile";
```

## Related Documents

- [Core Model](core.md) — Disciplines, grades, tracks, skills, behaviours
- [Lifecycle](lifecycle.md) — Stages, handoffs, and checklists
