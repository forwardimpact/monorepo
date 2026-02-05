---
title: Model
description: Derivation engine for roles, skills, and AI agent profiles.
---

## Purpose

The model package contains the core logic that transforms raw data into
actionable role definitions. Whether generating a human job description or an AI
agent profile, the same derivation engine ensures consistent expectations.

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

| Module           | Purpose                     |
| ---------------- | --------------------------- |
| `derivation.js`  | Core derivation functions   |
| `agent.js`       | Agent profile generation    |
| `job.js`         | Job preparation for display |
| `interview.js`   | Question selection          |
| `progression.js` | Career path analysis        |
| `checklist.js`   | Stage transition checklists |

## Usage

```javascript
import {
  deriveSkillMatrix,
  deriveBehaviourProfile,
  deriveJob,
} from "@forwardimpact/model/derivation";

import { prepareAgentProfile } from "@forwardimpact/model/agent";
```

## Related Documents

- [Core Model](core.md) — Disciplines, grades, tracks, skills, behaviours
- [Lifecycle](lifecycle.md) — Stages, handoffs, and checklists
