---
name: fit-landmark
description: >
  Work with the @forwardimpact/landmark product. Use when analyzing
  engineering-system signals, exploring GetDX snapshot trends, reading
  marker evidence, checking promotion readiness, viewing team health
  with growth recommendations, or surfacing engineer voice.
---

# Landmark

Landmark is the analysis and recommendation layer on top of Map data. It reads
from Map's activity schema and framework YAML to surface evidence, health,
readiness, growth timelines, initiative impact, and engineer voice. All
computation is deterministic — no LLM calls.

## When to Use

- Analyzing team health across GetDX drivers and skill evidence
- Checking an engineer's promotion readiness against marker checklists
- Viewing growth timelines based on Guide-interpreted evidence
- Surfacing engineer voice from GetDX snapshot comments
- Tracking initiative impact on driver scores
- Exploring snapshot trends and factor comparisons

## Commands

- `fit-landmark org show` / `org team` — Organization directory and team views
- `fit-landmark snapshot list|show|trend|compare` — GetDX snapshot analytics
- `fit-landmark evidence` — Marker-linked evidence with Guide's rationale
- `fit-landmark marker <skill>` — Marker definitions reference view
- `fit-landmark readiness --email <email>` — Promotion readiness checklist
- `fit-landmark timeline --email <email>` — Individual growth timeline by
  quarter
- `fit-landmark coverage --email <email>` — Evidence coverage metrics
- `fit-landmark practiced --manager <email>` — Evidenced vs derived capability
- `fit-landmark health [--manager <email>]` — Health view with drivers,
  evidence, and growth recommendations
- `fit-landmark voice --manager|--email` — Engineer voice from GetDX comments
- `fit-landmark initiative list|show|impact` — Initiative tracking and impact
  analysis

## Audience Model

Each view applies privacy rules based on the audience:

- **Engineer** (own data): `evidence`, `readiness`, `timeline`, `coverage`,
  `voice --email`
- **Manager** (1:1 tool): `health`, `readiness`, `timeline`, `practiced`,
  `voice --manager`
- **Director** (planning): `snapshot`, `coverage`, `practiced`, `initiative`

## Prerequisites

- GetDX account with API access
- Map activity schema migrated and populated
- Framework data with drivers and markers authored in capability YAML
- Summit (optional) for inline growth recommendations in health view

## Common Workflows

- "What should this engineer be demonstrating at the next level?" → `readiness`
- "How is this team doing?" → `health`
- "What are engineers saying is blocking them?" → `voice`
- "Did the initiative we ran actually improve scores?" → `initiative impact`
- "What skills are practiced vs only on paper?" → `practiced`
