---
title: Forward Impact
description: |
  Applications that help teams grow and cultivate world-class engineers in
  the age of AI. A unified framework where human engineering roles and AI
  coding agents derive from the same foundation.
toc: false
---

## Vision

Engineering excellence requires both human growth and AI augmentation. This
monorepo provides apps that define skills, behaviours, and career paths—working
equally well for human engineers and AI coding agents from the same coherent
model.

## Core Concept

A unified framework where human engineering roles and AI coding agents derive
from the same foundation:

```
Schema (definitions) → Model (derivation) → Apps (presentation)
```

The same skill and behaviour definitions power:

- **Human career paths** — Job descriptions, skill matrices, progression
- **AI coding agents** — Agent profiles, skill files, lifecycle constraints

## Apps

| Package                                    | Purpose                                        |
| ------------------------------------------ | ---------------------------------------------- |
| [@forwardimpact/schema](schema/index.md)   | Schema definitions and data loading            |
| [@forwardimpact/model](model/index.md)     | Derivation engine for roles and agent profiles |
| [@forwardimpact/pathway](pathway/index.md) | Web app and CLI for career progression         |

## Key Documents

**Schema**

- [Schema Overview](schema/index.md) — Data model and validation

**Model**

- [Model Overview](model/index.md) — Derivation engine
- [Core Model](model/core.md) — Disciplines, grades, tracks, skills, behaviours
- [Lifecycle](model/lifecycle.md) — Stages, handoffs, and checklists

**Pathway**

- [Pathway Overview](pathway/index.md) — Web app and CLI
- [Agents](pathway/agents.md) — Agent profile generation
- [Reference](pathway/reference.md) — File organization, CLI, templates
