---
title: Landmark
description: Analysis layer documentation for Landmark — marker evidence, snapshot trends, and manager-scoped team views on Map data.
---

## Overview

Landmark is the analysis layer for engineering-system signals. It reads data
from Map and presents focused views for engineers and leaders.

> See the [Landmark product page](/landmark/) for a high-level overview.

---

## Data Inputs

Landmark reads these Map activity contracts:

- `organization_people`
- `github_artifacts`
- `evidence`
- `getdx_snapshots`
- `getdx_snapshot_team_scores`
- `getdx_teams`

### Team scope

Team scope is derived from manager hierarchy:

- Root = manager `github_username`
- Team = all descendants in the reporting tree

---

## Core Views

### Personal Evidence

Artifact-linked marker evidence for an individual engineer.

```sh
fit-landmark evidence --skill system_design
```

### Practice Patterns

Aggregated marker evidence for a manager-defined team.

```sh
fit-landmark practice --skill system_design --manager platform_manager
```

### Snapshot Trends

Quarterly GetDX snapshot trend and comparison views.

```sh
fit-landmark snapshot trend --item MTQ2 --manager platform_manager
fit-landmark snapshot compare --snapshot MjUyNbaY --manager platform_manager
```

### Health Views

Joined analysis combining objective marker evidence and snapshot outcomes.

```sh
fit-landmark health --manager platform_manager
```

---

## Product Position

Landmark provides analysis and presentation.

Map owns ingestion, storage, and shared data contracts.

```text
GetDX + GitHub -> Map (ingest + store) -> Landmark (analyze + present)
```

---

## Related Documentation

- [Map](/docs/map/) — Data model and storage contracts
- [Core Model](/docs/model/) — Skills, behaviours, and derivation model
- [Pathway](/docs/pathway/) — Presentation and role/agent outputs
