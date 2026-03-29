---
title: Landmark Internals
description: "Analysis pipeline — data inputs, query contracts, and product position in the suite."
---

## Overview

Landmark is the analysis layer for engineering-system signals. It combines
objective marker evidence from GitHub artifacts with subjective outcomes from
GetDX snapshots, then presents team-level and individual views grounded in your
framework.

Landmark has no LLM calls -- it queries, aggregates, and explains.

---

## Data Inputs

Landmark reads these Map activity contracts:

| Contract                     | What Landmark uses it for                      |
| ---------------------------- | ---------------------------------------------- |
| `organization_people`        | Person lookup, discipline/level for derivation |
| `github_artifacts`           | Artifact metadata for evidence context         |
| `evidence`                   | Skill marker evidence written by Guide         |
| `getdx_snapshots`            | Snapshot metadata for trend analysis           |
| `getdx_snapshot_team_scores` | Aggregated driver scores per team per snapshot |
| `getdx_teams`                | Team hierarchy for manager-scoped views        |

All data is read through Map's query functions in `activity/queries/`. Landmark
never writes to Map tables.

---

## Team Scope

Team scope is derived from the manager hierarchy:

- **Root** = manager `github_username`
- **Team** = all descendants in the `manager_email` reporting tree

This means Landmark views are always scoped to a manager and their full
reporting chain. The same query functions used by other consumers
(`getTeam(managerEmail)`) provide the team boundary.

---

## Core Views

### Personal Evidence

Artifact-linked marker evidence for an individual engineer, filtered by skill.

### Practice Patterns

Aggregated marker evidence across a manager-defined team, showing which skills
have the strongest evidence patterns and where gaps exist.

### Snapshot Trends

Quarterly GetDX snapshot trends and comparisons, showing driver score
trajectories over time with comparative metrics (`vs_prev`, `vs_org`, `vs_50th`,
`vs_75th`, `vs_90th`).

### Health Views

Joined analysis combining objective marker evidence with subjective GetDX
snapshot outcomes. This is where driver `contributingSkills` and
`contributingBehaviours` connect the two data sources -- Landmark juxtaposes a
driver's GetDX score with evidence for its contributing skills.

---

## Product Position

Map owns ingestion, storage, and shared data contracts. Landmark analyzes and
presents.

```
GetDX + GitHub -> Map (ingest + store) -> Landmark (analyze + present)
```

- **Map** stores raw events, normalized artifacts, evidence, snapshots, and
  organization data. Map validates and enforces schema quality.
- **Guide** reads artifacts from Map, interprets them against skill markers, and
  writes evidence back to Map.
- **Landmark** reads the stored data and presents analysis views. It never
  modifies Map data.

This separation means Landmark can be rebuilt or extended without affecting data
integrity -- it is a pure consumer of Map contracts.

---

## Related Documentation

- [Map Internals](/docs/internals/map/) -- Data contracts and query functions
- [Engineering Signals Guide](/docs/guides/engineering-signals/) -- User-facing
  signal analysis documentation
