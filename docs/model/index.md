---
title: Model
description: Chart the route — derive job descriptions, agent profiles, and skill matrices from your terrain data.
---

<div class="page-header">
<img src="/assets/icons/model.svg" alt="Model" />

## Chart the Route

</div>

<div class="product-value">
<p>
The Model is the derivation engine at the heart of Forward Impact. Feed it a
discipline, a track, and a grade — and it produces a complete job definition.
Swap the grade for a lifecycle stage and you get an agent profile instead. Same
data, same formula, different outputs.
</p>
</div>

### What you get

<ul class="benefits">
<li>Job definitions derived from Discipline × Track × Grade</li>
<li>Agent profiles derived from Discipline × Track × Stage</li>
<li>Skill matrices with automatically applied track modifiers</li>
<li>Behaviour profiles calibrated to career level</li>
<li>Stage-transition checklists tailored to each role</li>
<li>Career progression analysis showing the path ahead</li>
</ul>

### Who it's for

**Engineering managers** building job descriptions that are consistent,
comparable, and connected to real skill expectations.

**Platform teams** generating coding agent profiles that match the same
standards as human engineers.

**HR and talent teams** who want structured, data-driven career frameworks
instead of ad-hoc job descriptions.

---

## The Core Formula

Every output traces back to a simple combination:

```
Job    = Discipline × Track × Grade
Agent  = Discipline × Track × Stage
```

| Input          | Question                    |
| -------------- | --------------------------- |
| **Discipline** | What kind of engineer?      |
| **Track**      | Where and how do you work?  |
| **Grade**      | What career level?          |
| **Stage**      | What part of the lifecycle? |

Both jobs and agents use the same skill and behaviour derivation. The
difference: jobs include all skills capped by grade, while agents filter out
human-only skills and constrain by lifecycle stage.

---

## Key Capabilities

| Capability         | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| **Job derivation** | Complete role definitions with skills and behaviours  |
| **Agent profiles** | Stage-specific agent instructions for AI assistants   |
| **Skill matrices** | Derived skill levels with track modifiers applied     |
| **Checklists**     | Stage transition criteria from capability definitions |
| **Progression**    | Career path analysis and gap identification           |
| **Interviews**     | Role-specific question selection                      |
| **Job matching**   | Gap analysis between current and target roles         |

---

## Explore Further

- [Core Model](core.md) — How disciplines, grades, tracks, skills, and
  behaviours combine
- [Lifecycle](lifecycle.md) — Stages, handoffs, and checklists for human and
  agent workflows

---

## Technical Reference

### Modules

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

### Programmatic Access

```javascript
import { deriveSkillMatrix, deriveBehaviourProfile, deriveJob }
  from "@forwardimpact/libpathway/derivation";

import { prepareAgentProfile }
  from "@forwardimpact/libpathway/profile";
```
