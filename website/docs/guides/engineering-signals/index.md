---
title: "Engineering Signals"
description: "Analyze marker evidence, snapshot trends, and team-scoped engineering signals with Landmark."
---

# Engineering Signals

Landmark is the analysis layer for engineering-system signals. It reads
framework definitions and activity data from Map, then presents focused views —
personal evidence, practice patterns, snapshot trends, and team health. No LLM
calls; Landmark queries, aggregates, and explains.

## Data Inputs

Landmark reads from the activity data that Map stores:

- **GitHub activity** — pull requests, reviews, commits, and their metadata
- **GetDX snapshots** — periodic developer experience survey results
- **Organization hierarchy** — manager relationships for team scoping
- **Framework definitions** — skills, markers, and proficiency levels

All data is ingested and stored by Map. Landmark only reads and analyzes.

## Team Scope

Landmark derives team membership from the manager hierarchy in your organization
data. When you query by manager, Landmark includes all engineers in that
manager's reporting chain. This means views automatically reflect your actual
team structure without manual configuration.

## Core Views

### Personal Evidence

See the evidence collected for a specific skill:

```sh
npx fit-landmark evidence --skill system_design
```

This shows GitHub artifacts (PRs, reviews, commits) that match the markers
defined for that skill. Each piece of evidence is linked to a specific marker
and proficiency level, so you can see which markers have supporting activity and
which do not.

### Practice Patterns

View how a skill is practiced across a team:

```sh
npx fit-landmark practice --skill system_design --manager platform_manager
```

This aggregates evidence across team members to show patterns — which markers
are commonly demonstrated, where practice is concentrated, and where gaps exist.

### Snapshot Trends

Track developer experience over time:

```sh
npx fit-landmark snapshot trend --manager platform_manager --metric satisfaction
```

Compare two snapshots to see what changed:

```sh
npx fit-landmark snapshot compare --manager platform_manager --from 2025-Q3 --to 2025-Q4
```

Snapshot views connect subjective experience data (from GetDX surveys) with
objective activity signals, giving a more complete picture than either source
alone.

### Health Views

Get a summary view of team engineering health:

```sh
npx fit-landmark health --manager platform_manager
```

The health view combines multiple signals — evidence coverage, practice
patterns, snapshot trends — into an overview that highlights areas of strength
and areas that need attention. It presents system-level observations, not
individual performance judgments.

## Product Position

Landmark works within a clear separation of responsibilities:

- **Map** owns data ingestion and storage — it imports from GitHub, GetDX, and
  organizational sources
- **Landmark** owns analysis and presentation — it reads from Map and produces
  views
- **Guide** interprets artifacts against markers — when you need contextual
  reasoning, Guide provides it

Landmark focuses on what the data shows. Guide focuses on what the data means.

## Related Documentation

- [CLI Reference](/docs/reference/cli/) — complete command documentation for
  `fit-landmark`
- [Authoring Frameworks](/docs/guides/authoring-frameworks/) — how to define the
  skills and markers that Landmark analyzes
