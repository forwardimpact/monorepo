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

> Landmark answers one question: **what do the signals say about how engineering
> is functioning — and what should we do about it?** It reads Map data, combines
> objective marker evidence with GetDX snapshot outcomes, and presents analysis
> grounded in your framework. No LLM calls — fully deterministic.

---

### Audience Model

| Audience                | Views                                                                | Privacy                                   |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| **Engineer** (own data) | `evidence`, `readiness`, `timeline`, `coverage`, `voice --email`     | Full individual detail                    |
| **Manager** (1:1 tool)  | `health`, `readiness`, `timeline`, `practiced`, `voice --manager`    | Individual specificity for direct reports |
| **Director** (planning) | `snapshot`, `coverage`, `practiced`, `initiative`, `voice --manager` | Aggregated team views                     |

---

## Commands

### Organization

```sh
npx fit-landmark org show                    # Full organization directory
npx fit-landmark org team --manager <email>  # Hierarchy under a manager
```

### Snapshots

```sh
npx fit-landmark snapshot list
npx fit-landmark snapshot show --snapshot <id> [--manager <email>]
npx fit-landmark snapshot trend --item <item_id> [--manager <email>]
npx fit-landmark snapshot compare --snapshot <id> [--manager <email>]
```

### Evidence & Readiness

```sh
npx fit-landmark evidence [--skill <id>] [--email <email>]
npx fit-landmark marker <skill> [--level <level>]
npx fit-landmark readiness --email <email> [--target <level>]
npx fit-landmark timeline --email <email> [--skill <id>]
npx fit-landmark coverage --email <email>
npx fit-landmark practiced --manager <email>
```

### Health

```sh
npx fit-landmark health [--manager <email>]
```

Shows driver scores, contributing skill evidence, engineer voice comments, and
(when Summit is installed) inline growth recommendations.

### Engineer Voice

```sh
npx fit-landmark voice --manager <email>   # Themed team comments
npx fit-landmark voice --email <email>     # Individual comment timeline
```

### Initiatives

```sh
npx fit-landmark initiative list [--manager <email>]
npx fit-landmark initiative show --id <id>
npx fit-landmark initiative impact [--manager <email>]
```

All commands support `--format text|json|markdown`.

---

## Prerequisites

- **GetDX account** with API access configured
- **Map** with the activity schema migrated (`npx fit-map activity migrate`)
- **Framework data** with drivers and markers authored in your capability YAML

---

## How It Works

Landmark reads from Map's activity layer:

1. `organization_people` for hierarchy and team slicing
2. `github_artifacts` + `evidence` for objective marker analysis
3. `getdx_snapshots` + `getdx_snapshot_team_scores` for quarterly outcomes
4. `getdx_snapshot_comments` for engineer voice
5. `getdx_initiatives` for initiative tracking

```
GetDX + GitHub → Map (ingest + store) → Landmark (analyze + present)
                                           ↑
                                       Summit (growth recommendations)
```

Health works without Summit — it shows driver scores, evidence, and comments.
Growth recommendations appear when Summit is installed.

---

See [Landmark Internals](/docs/internals/landmark/) for architecture details.
