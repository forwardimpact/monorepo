---
title: Landmark
description: Analyze engineering-system signals from Map — marker evidence from GitHub activity and quarterly GetDX snapshot outcomes.
layout: product
toc: false
hero:
  subtitle: Landmark is the analysis layer for engineering-system signals. It reads Map data to show marker evidence, practice patterns, and snapshot trends for manager-defined teams.
  cta:
    - label: For Leadership
      href: /docs/getting-started/leadership/
    - label: For Engineers
      href: /docs/getting-started/engineers/
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/landmark
      secondary: true
---

> Landmark turns shared data into clear analysis. It combines objective marker
> evidence from GitHub artifacts with subjective outcomes from GetDX snapshots,
> then presents team-level and individual views grounded in your framework.

### What you get

- Personal evidence views by skill marker and artifact context
- Practice-pattern summaries across manager-derived team scopes
- Snapshot trend and comparison views from GetDX quarterly results
- Combined health views joining marker evidence and snapshot factors
- Consistent filters by manager hierarchy, skill, and factor

---

### Who it's for

**Engineers** reviewing their own evidence in context of role expectations.

**Engineering leaders** tracking team patterns and DX trends using shared,
manager-scoped views.

---

## Core Views

### Personal Evidence

An engineer reviews recent artifacts linked to specific skill markers.

```
$ fit-landmark evidence --skill system_design

  Your evidence: System Design (working level)

  PR #342 "Redesign authentication flow"
    Design doc with component diagram in PR description. Approved by two
    reviewers without structural rework.
    → relates to: design doc accepted without senior rewrite

  PR #342 review thread
    Resolved caching vs. session debate. Posted trade-off comparison and
    the team converged on session approach.
    → relates to: led a discussion that resolved a design disagreement
```

### Practice Patterns

Engineering leadership sees aggregate marker patterns across a manager-defined
team scope.

```
  $ fit-landmark practice --skill system_design --manager platform_manager

  System Design practice — Platform team (last quarter)

  Strong evidence:
    Design documents in PRs — most feature PRs include architecture sections
    Review quality — review threads regularly discuss design rationale

  Weak evidence:
    Trade-off analysis — few PRs document multiple approaches considered
    Consider: where does design exploration happen in the current workflow?
```

### Snapshot Trends

Quarterly GetDX snapshots show how factors move over time and relative to org
and benchmark comparisons.

```sh
fit-landmark snapshot trend --item MTQ2 --manager platform_manager
fit-landmark snapshot compare --snapshot MjUyNbaY --manager platform_manager
```

---

## How It Works

Landmark queries Map's central store:

1. `organization_people` for hierarchy and team slicing
2. `github_artifacts` + `evidence` for objective marker analysis
3. `getdx_snapshots` + `getdx_snapshot_team_scores` for quarterly outcomes

```
  GetDX + GitHub → Map (ingest + store) → Landmark (analyze + present)
```

---

### Stay Updated

Landmark is currently in development. Product direction is specified in the
Landmark and Map specs under `specs/04-landmark-product` and
`specs/03-map-data-store`.
