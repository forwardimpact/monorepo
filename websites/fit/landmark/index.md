---
title: Landmark
description: Show engineering progress and do not make individuals feel surveilled. Use evidence, trends, and engineer voice grounded in your engineering standard.
layout: product
toc: false
hero:
  image: /assets/scene-landmark.svg
  alt: An engineer, an AI robot, and a business professional stand on a rocky outcrop, scanning the horizon for signals
  subtitle: Check the cairn. Landmark shows what the signals say about how engineering functions. It shows marker evidence, practice patterns, and snapshot trends that Guide assesses against your engineering standard.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/landmark
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/landmark
      secondary: true
---

Quarterly review is due and the only data is ticket counts. Ticket counts
single out individuals. They do not illuminate the system. Career conversations
feel subjective with no shared evidence base. Landmark resolves both. It
surfaces marker evidence alongside developer-experience outcomes. Guide
assesses that evidence against your engineering standard. Landmark presents it
and does not blame individuals.

## What becomes possible

### For Engineering Leaders

Demonstrate engineering progress and do not make individuals feel surveilled.
See system-level trends that show direction. Tell whether culture investments
work before the next budget cycle. Ground quarterly reviews in evidence rather
than impressions.

- Team health dashboards that combine evidence, driver scores, and engineer
  voice
- GetDX snapshot trends and quarterly comparisons
- Practice pattern analysis that shows which skills are actively exercised

### For Empowered Engineers

See what your recent work demonstrates against the standard. See how it adds
up over time. When Guide recommends a growth area, Landmark is where the proof
of progress shows up.

- Marker evidence that links GitHub artifacts to skill definitions
- Promotion readiness and growth timeline views
- Skill coverage analysis against standard markers

---

## How Landmark Works

### Audience Model

| Audience                | Views                                                                         | Privacy                                   |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| **Engineer** (own data) | `evidence`, `readiness`, `timeline`, `coverage`, `sources`, `voice --email`   | Full individual detail                    |
| **Manager** (1:1 tool)  | `health`, `readiness`, `timeline`, `practiced`, `practice`, `voice --manager` | Individual specificity for direct reports |
| **Director** (planning) | `snapshot`, `practiced`, `practice`, `voice --manager`                        | Aggregated team views                     |

### Commands

#### Organization

```sh
npx fit-landmark org show                    # Full organization directory
npx fit-landmark org team --manager <email>  # Hierarchy under a manager
```

#### Snapshots

```sh
npx fit-landmark snapshot list
npx fit-landmark snapshot show --snapshot <id> [--manager <email>]
npx fit-landmark snapshot trend --item <item_id> [--manager <email>]
npx fit-landmark snapshot compare --snapshot <id> [--manager <email>]
```

#### Evidence & Readiness

```sh
npx fit-landmark evidence [--skill <id>] [--email <email>]
npx fit-landmark marker <skill> [--level <level>]
npx fit-landmark readiness --email <email> [--target <level>]
npx fit-landmark timeline --email <email> [--skill <id>]
npx fit-landmark coverage --email <email>
npx fit-landmark practiced --manager <email>
npx fit-landmark practice [--skill <id>] [--manager <email>]
```

#### Engineer Data

```sh
npx fit-landmark sources [--email <email>]
```

Inventory of activity row classes Landmark retains about an engineer. It is a
transparency view for the engineer who asks what data the system holds.

#### Health

```sh
npx fit-landmark health [--manager <email>]
npx fit-landmark health [--manager <email>] --verbose
```

Default output is a compact table of drivers with one anchor per row. Pass
`--verbose` for the full per-driver paragraph layout. That layout includes all
percentile anchors, GetDX comments, and contributing-skill evidence.

Sample default output:

```text
  Team — health view

  Drivers (6)
  ────────────────────────────────────────────────────────────
  #  Driver          Percentile  vs_org   More
  1  Quality         42nd        -10      +4 anchors via --verbose
  2  Reliability     n/a         n/a      -
  …
```

#### Engineer Voice

```sh
npx fit-landmark voice --manager <email>   # Themed team comments
npx fit-landmark voice --email <email>     # Individual comment timeline
```

All commands support `--format text|json|markdown`.

### Prerequisites

- **GetDX account** with API access configured
- **Map** with the activity schema migrated (`npx fit-map activity migrate`)
- **Standard data** with drivers and markers authored in your capability YAML

### Data Flow

Landmark reads from Map's activity layer:

1. `organization_people` for hierarchy and team slices
2. `github_artifacts` + `evidence` for marker analysis. Guide assesses
   artifacts against your standard's markers and writes results to Map
3. `getdx_snapshots` + `getdx_snapshot_team_scores` for quarterly outcomes
4. `getdx_snapshot_comments` for engineer voice

```text
GitHub + GetDX → Map (ingest + store) → Landmark (present)
                       ↑                       ↑
              Guide (marker analysis)    Summit (recommendations)
```

Health works without Summit. It shows driver scores, evidence, and comments.
Growth recommendations appear after you install Summit.

---

## Getting Started

```sh
npm install @forwardimpact/landmark @forwardimpact/map
npx fit-map init                            # seed ./data/pathway/ with the starter standard
npx fit-landmark marker task-completion     # reference view — no Supabase required
```

The rest of Landmark (`health`, `voice`, `snapshot`, `evidence`, …) reads
from Map's activity layer. Walk that setup in the per-persona guides below.

<div class="grid">

<!-- part:card:../docs/getting-started/leaders/landmark -->

<!-- part:card:../docs/getting-started/engineers/landmark -->

</div>

---
