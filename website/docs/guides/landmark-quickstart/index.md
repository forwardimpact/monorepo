---
title: Landmark Quickstart
description: Get from zero to a useful health view in minutes.
---

# Landmark Quickstart

This guide walks you from a fresh install to a working `fit-landmark health`
view. By the end you will see driver scores, skill evidence counts, and
(optionally) growth recommendations for a manager-scoped team.

## Prerequisites

- Node.js 18+
- A Supabase project (or `fit-map activity start` for local development)
- A GetDX account with API access

## 1. Install

```sh
npm install -g @forwardimpact/landmark @forwardimpact/map
npx fit-codegen --all
```

## 2. Migrate the activity schema

```sh
npx fit-map activity migrate
```

This creates the `activity` schema tables Landmark reads from:
`organization_people`, `getdx_snapshots`, `github_artifacts`, `evidence`, and
more.

## 3. Configure GetDX credentials

Export the environment variables Map needs to reach your Supabase instance:

```sh
export MAP_SUPABASE_URL="https://your-project.supabase.co"
export MAP_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## 4. Load your roster and sync GetDX data

```sh
npx fit-map people push roster.csv
npx fit-map getdx sync
npx fit-map activity transform
```

This populates `organization_people`, `getdx_snapshots`, and
`getdx_snapshot_team_scores`.

## 5. Author drivers and markers

Landmark's `health`, `readiness`, and `evidence` views require framework data
with **drivers** and **markers** defined. The starter data ships minimal
examples — you should author your own.

**Drivers** in `drivers.yaml` link GetDX scorecard items to contributing skills:

```yaml
- id: quality
  name: Quality
  contributingSkills:
    - task_completion
    - planning
```

**Markers** in capability YAML files define observable indicators per skill and
proficiency level:

```yaml
skills:
  - id: task_completion
    markers:
      working:
        human:
          - Delivered a feature end-to-end with no revision to the initial design
        agent:
          - Completed a multi-file change that passes CI without human rework
```

See the [Authoring Frameworks guide](/docs/guides/authoring-frameworks/) for
vocabulary standards and validation.

Run `npx fit-map validate` to confirm your framework data passes schema
validation.

## 6. Run Landmark

```sh
npx fit-landmark health --manager alice@example.com
```

You should see driver scores, contributing skill evidence counts, and (if Summit
is installed) inline growth recommendations.

## Next steps

- `npx fit-landmark readiness --email engineer@example.com` — promotion
  readiness checklist
- `npx fit-landmark voice --manager alice@example.com` — engineer voice from
  GetDX comments (requires the `getdx_snapshot_comments` table)
- `npx fit-landmark initiative impact` — initiative outcome correlation
  (requires the `getdx_initiatives` table)

See the [Landmark overview](/landmark/) for the full command reference.
