---
name: fit-landmark
description: >
  Demonstrate engineering progress and do not make individuals feel
  surveilled. Show evidence of growth. Use when the quarterly review has
  only ticket counts and you need system-level trends. Use when you check
  promotion readiness. Use when you assess whether culture investments
  work. Use when you explore GetDX snapshot trends, marker evidence,
  engineer voice, and growth timelines.
---

# Landmark

Landmark is an analysis and recommendation layer on top of Map data. Landmark
reads from Map's activity schema and standard YAML. It surfaces evidence,
health, readiness, growth timelines, and engineer voice. Guide's evaluation
pipeline writes the evidence rows. All Landmark computation is deterministic.
Landmark makes no LLM calls.

## When to Use

**Demonstrate engineering progress:**

- Show system-level trends — `npx fit-landmark health --manager <email>`
- Assess whether culture investments work —
  `npx fit-landmark snapshot trend --item <id>`
- Explore GetDX snapshot trends and comparisons —
  `npx fit-landmark snapshot compare --snapshot <id>`

**Find growth areas backed by evidence:**

- Check promotion readiness — `npx fit-landmark readiness --email <email>`
- View growth timelines — `npx fit-landmark timeline --email <email>`
- Compare evidenced capability with derived capability —
  `npx fit-landmark practiced --manager <email>`

**Surface engineer voice:**

- Surface feedback from GetDX comments —
  `npx fit-landmark voice --manager <email>`
- View an individual's voice — `npx fit-landmark voice --email <email>`

---

## How It Works

### Evidence Model

Landmark combines two data sources. **Standard data** holds YAML definitions
from Map with skill markers and proficiency levels. **Activity data** holds
GetDX snapshots, GitHub artifacts, and Guide-interpreted evidence in the Map
activity schema. Marker definitions authored in capability YAML files link the
evidence to skills.

### Readiness Assessment

Promotion readiness compares an engineer's evidenced skill levels against the
marker checklist for their target level. Landmark checks each marker against
the available evidence. The result is a per-skill pass/gap report. The report
shows what the engineer demonstrated and what still needs demonstration.

### Health Analysis

Team health aggregates GetDX driver scores, skill evidence coverage, and growth
trajectory across a manager's reports. The health view combines quantitative
snapshot data with qualitative evidence. It surfaces where teams are strong and
where they need support.

### Privacy Model

Each view applies privacy rules based on the audience. Engineers see only their
own data. Managers see their direct reports. Directors see aggregated team
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

When you sign in, subject-scoped commands (`readiness`, `timeline`,
`coverage`, `sources`, and `voice` with no flags) default `--email` to
your own identity. `evidence` stays explicit. If you omit `--email`
there, `evidence` deliberately shows the broadest view your access
allows. `health --manager` takes a team lead's **own** email. Do not
pass the email of the lead's manager.

---

## Common Workflows

See [`references/workflows.md`](references/workflows.md) for worked examples.

---

## Prerequisites

- GetDX account with API access
- Map activity database prepared — one of: `npx fit-map substrate stage`
  (one-shot CI/interview pipeline), `npx fit-map activity start` +
  `npx fit-map activity seed` (dev flow), or `npx fit-map activity migrate`
  plus your own ingest (migrations only). The `fit-map` skill documents all
  three paths
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
- [Get Career Guidance Grounded in the Standard](https://www.forwardimpact.team/docs/products/growth-areas/index.md)
  — Identify gaps and track progress toward the next level
- [Check Progress Toward Next Level](https://www.forwardimpact.team/docs/products/growth-areas/check-progress/index.md)
  — See where you stand against level expectations
- [List Engineering Data Sources](https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md)
  — List the activity rows retained about an engineer and their fall-off dates
- [Sign In to Landmark](https://www.forwardimpact.team/docs/products/signing-in-to-landmark/index.md)
  — Sign in via Supabase magic-link so commands resolve your identity
  automatically
