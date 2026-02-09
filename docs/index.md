---
title: Forward Impact
description: |
  Great engineering comes from improving the performance of people and machines
  together. Define skills, behaviours, and career levels that apply equally to
  human engineers and coding agent teams.
toc: false
---

> _"The aim of leadership should be to improve the performance of man and
> machine, to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."_
>
> — W. Edwards Deming

## Vision

Great engineering comes from improving the performance of people and machines
together. This monorepo provides apps that define skills, behaviours, and career
paths—raising quality, increasing output, and bringing pride of workmanship to
human engineers and coding agent teams alike.

## Core Concept

A unified framework where human engineering roles and coding agent teams derive
from the same foundation:

```
Schema (definitions) → Model (derivation) → Apps (presentation)
```

The same skill and behaviour definitions power:

- **Human career paths** — Job descriptions, skill matrices, progression
- **Coding agent teams** — Agent profiles, skill files, lifecycle constraints

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
