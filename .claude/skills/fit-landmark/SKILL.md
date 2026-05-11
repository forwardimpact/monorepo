---
name: fit-landmark
description: >
  Measure engineering outcomes and team health without blaming individuals.
  Use when checking promotion readiness, exploring GetDX snapshot trends,
  viewing marker evidence, surfacing engineer voice, assessing whether
  culture investments are working, or generating growth recommendations.
---

# Landmark

Analysis and recommendation layer on top of Map data. Landmark reads from Map's
activity schema and standard YAML to surface evidence, health, readiness, growth
timelines, and engineer voice. Evidence rows are written by Guide's evaluation
pipeline; all Landmark computation is deterministic — no LLM calls.

## When to Use

- Measuring team outcomes without blaming individuals
- Checking an engineer's promotion readiness against marker checklists
- Analyzing team health across GetDX drivers and skill evidence
- Assessing whether investments in engineering culture are improving results
- Viewing growth timelines based on Guide-interpreted evidence
- Surfacing engineer voice from GetDX snapshot comments
- Exploring snapshot trends and factor comparisons
- Comparing evidenced vs derived capability across a team

---

## How It Works

### Evidence Model

Landmark combines two data sources: **standard data** (YAML definitions from Map
with skill markers and proficiency levels) and **activity data** (GetDX
snapshots, GitHub artifacts, and Guide-interpreted evidence stored in the Map
activity schema). Evidence is linked to skills via marker definitions authored
in capability YAML files.

### Readiness Assessment

Promotion readiness compares an engineer's evidenced skill levels against the
marker checklist for their target level. Each marker is checked against
available evidence — the result is a per-skill pass/gap report showing what has
been demonstrated and what still needs demonstration.

### Health Analysis

Team health aggregates GetDX driver scores, skill evidence coverage, and growth
trajectory across a manager's reports. The health view combines quantitative
snapshot data with qualitative evidence to surface where teams are strong and
where they need support.

### Privacy Model

Each view applies privacy rules based on the audience — engineers see only their
own data, managers see their direct reports, directors see aggregated team
data.

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Audience Model

Each view applies privacy rules based on the audience:

- **Engineer** (own data): `evidence`, `readiness`, `timeline`, `coverage`,
  `voice --email`
- **Manager** (1:1 tool): `health`, `readiness`, `timeline`, `practiced`,
  `voice --manager`
- **Director** (planning): `snapshot`, `coverage`, `practiced`,
  `voice --manager`

---

## Common Workflows

See [`references/workflows.md`](references/workflows.md) for worked examples.

---

## Prerequisites

- GetDX account with API access
- Map activity schema migrated and populated (`npx fit-map activity migrate`)
- Standard data with drivers and markers authored in capability YAML
- Summit (optional) for inline growth recommendations in health view

## Verification

```sh
npx fit-landmark org show                # Should display organization directory
npx fit-landmark snapshot list           # Should list available GetDX snapshots
npx fit-landmark health                  # Should display team health overview
```

## Documentation

- [Landmark Overview](https://www.forwardimpact.team/landmark/index.md) —
  Product overview, audience model, and key concepts
- [Getting Started: Landmark for Leaders](https://www.forwardimpact.team/docs/getting-started/leaders/landmark/index.md)
  — From zero to your first engineering outcome measurement
- [Demonstrate Engineering Progress](https://www.forwardimpact.team/docs/products/engineering-outcomes/index.md)
  — Show evidence of engineering progress without blaming individuals
- [Tell Whether Culture Investments Are Working](https://www.forwardimpact.team/docs/products/engineering-outcomes/culture-investments/index.md)
  — Track initiative impact through outcome trends
- [Find Growth Areas and Build Evidence](https://www.forwardimpact.team/docs/products/growth-areas/index.md)
  — Identify gaps and track progress toward the next level
- [Check Progress Toward Next Level](https://www.forwardimpact.team/docs/products/growth-areas/check-progress/index.md)
  — See where you stand against level expectations
- [List Engineering Data Sources](https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md)
  — List the activity rows retained about an engineer and their fall-off dates
