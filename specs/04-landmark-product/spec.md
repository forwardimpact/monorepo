# Landmark

Thin analysis of engineering-system signals from Map.

```
@forwardimpact/landmark    CLI: fit-landmark
```

## Why

Landmark answers one question: **what do the signals say about how engineering
is functioning?**

It does this by querying Map, where operational and framework data are already
stored.

Key simplification:

- We continue using **GetDX** as the survey platform.
- Map ingests GetDX snapshot aggregates.
- Map also stores GitHub activity/evidence used for marker analysis.
- Landmark analyzes and presents; it does not collect surveys.

## Scope

### In scope

- Read `Organization` data (flat people list) from Map.
- Derive team membership from manager hierarchy.
- Read GetDX snapshot aggregates from Map.
- Read GitHub artifact/evidence data from Map for marker analysis.
- Provide trend, comparison, and team-slice analytics.

### Out of scope

- Survey distribution or response collection.
- Owning ingestion pipelines.
- Owning roster data structures.

## Data Contracts

Landmark consumes:

- `activity.organization_people`
  - `name`
  - `email`
  - `github_username`
  - `manager`
- `activity.getdx_teams`
- `activity.getdx_snapshots`
- `activity.getdx_snapshot_team_scores`
- `activity.github_events`
- `activity.github_artifacts`
- `activity.evidence`

Team semantics:

- A team is defined by a manager root.
- Team members are everyone in that manager’s reporting hierarchy.

## Product Behavior

### Organization views

- Show full organization directory.
- Show hierarchy under a manager.

### Snapshot views

- List available snapshots.
- Show factor/driver scores for a snapshot.
- Compare against prior snapshot and benchmarks (`vs_prev`, `vs_org`, `vs_50th`,
  `vs_75th`, `vs_90th`).

### Marker evidence views

- Show marker-linked evidence by skill.
- Show practice-pattern aggregates for manager-defined teams.
- Show joined health views where objective marker evidence is compared to GetDX
  snapshot outcomes.

### Trend views

- Track item trend across quarterly snapshots.
- Slice trends by manager-defined team.

## CLI

```
Landmark — analysis on top of Map snapshot data.

Usage:
  fit-landmark org show
  fit-landmark org team --manager <github_username>
  fit-landmark snapshot list
  fit-landmark snapshot show --snapshot <id> [--manager <github_username>]
  fit-landmark snapshot trend --item <item_id> [--manager <github_username>]
  fit-landmark snapshot compare --snapshot <id> [--manager <github_username>]
  fit-landmark evidence [--skill <skill_id>] [--manager <github_username>]
  fit-landmark practice [--skill <skill_id>] [--manager <github_username>]
  fit-landmark health [--manager <github_username>]
```

Removed from Landmark:

- `survey create|distribute|close`
- `roster sync`
- ingestion/replay commands

## Positioning

```
GetDX + GitHub ──> Map (ingest + store) ──> Landmark (analyze + present)
```

Landmark stays intentionally small: query, aggregate, explain.

## Summary

| Attribute     | Value                                     |
| ------------- | ----------------------------------------- |
| Package       | `@forwardimpact/landmark`                 |
| CLI           | `fit-landmark`                            |
| Role          | Thin analysis layer on Map                |
| Survey source | GetDX (external platform)                 |
| Data store    | Map (single source of truth)              |
| Org model     | `Organization` people + manager hierarchy |
| Team model    | Derived from manager subtree              |
