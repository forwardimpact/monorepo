---
title: Demonstrate Engineering Progress
description: Walk into a quarterly review with system-level trends, marker evidence, and engineer voice — demonstrating progress without singling out individuals.
---

Quarterly review is due and the only data is ticket counts -- singling out
individuals, not illuminating the system. This guide walks
you through preparing a quarterly presentation with Landmark: system-level
trends, marker evidence, and engineer voice that show direction without naming
individuals.

## Prerequisites

- [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/) --
  install Map, migrate the activity schema, load your roster, and sync GetDX
  data.
- [Getting Started: Landmark for Leaders](/docs/getting-started/leaders/landmark/) --
  install Landmark and confirm you can run `npx fit-landmark org show`.
- [Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/) --
  define drivers and markers in your standard data. Landmark's health, evidence,
  and readiness views require drivers in `drivers.yaml` and markers in your
  capability YAML files.

The rest of this guide assumes Map's activity layer is running and populated.
If you want to explore with synthetic data first, see
[Trying the activity layer with synthetic data](/docs/getting-started/leaders/map/#trying-the-activity-layer-with-synthetic-data)
in the Map guide.

## Confirm your data is ready

Before building views for a quarterly review, confirm that the standard data,
roster, and snapshots are in place.

Validate your standard data against the schema:

```sh
npx fit-map validate
```

Expected output (your counts will reflect your installation's standard):

```text
Validation passed

Data Summary
  Skills       — 12
  Behaviours   — 6
  Disciplines  — 3
  Tracks       — 2
  Levels       — 5
  Drivers      — 4
```

If any errors appear, resolve them using the guidance in
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/).

Confirm that your roster is loaded and the team hierarchy is visible:

```sh
npx fit-landmark org team --manager alice@example.com
```

```text
  Team: Alice Smith (alice@example.com)

    Bob Chen         bob@example.com        Software Engineering  J060
    Carol Davis      carol@example.com      Software Engineering  J070
    Dan Park         dan@example.com        Data Engineering      J060
```

If the output is empty, re-run `npx fit-map people push roster.csv` with your
current roster file.

Confirm that snapshot data is available:

```sh
npx fit-landmark snapshot list
```

```text
  Snapshots

    MjUyNbaY   2025-03-15   Q1 2025
    NzE4MmRk   2025-06-14   Q2 2025
```

If the output is empty, run `npx fit-map getdx sync` followed by
`npx fit-map activity transform` to ingest the latest GetDX data.

## See system-level trends across snapshots

Quarterly reviews need context: is a score improving, declining, or flat? Before
diving into the health view, check how a specific driver has moved over time.

Track a driver's trend across snapshots, scoped to your team:

```sh
npx fit-landmark snapshot trend --item code_review --manager alice@example.com
```

```text
  Trend: code_review (Alice Smith's team)

    2025-03-15   72
    2025-06-14   78
    2025-09-13   81
```

The output shows the driver's score at each snapshot date, making the direction
visible. Replace `code_review` with any driver ID from your `drivers.yaml` --
the starter data includes `code_review`, `incident_response`, and `deep_work`.

Compare the latest snapshot against organizational benchmarks:

```sh
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager alice@example.com  # ID from 'snapshot list'
```

```text
  Snapshot comparison: MjUyNbaY (Alice Smith's team vs organization)

    Driver          Team   p50   p75   p90
    code_review       78    70    80    88
    incident_response 65    68    76    84
    deep_work         82    72    81    90
```

Use the snapshot ID from `npx fit-landmark snapshot list`.

## Build the health view

The health view is the centerpiece of Landmark's quarterly presentation. It
joins driver scores, contributing-skill evidence, engineer voice comments, and
growth recommendations into a single picture scoped to a manager's team.

Run the health view for your team:

```sh
npx fit-landmark health --manager alice@example.com
```

```text
  Health: Alice Smith's team

    code_review (78, 72nd percentile, vs_org: +5)
      Contributing skills: task_completion (12 artifacts), planning (8 artifacts)
      "We've been catching more issues in review lately" — latest snapshot
      "Design docs are getting better but still inconsistent" — latest snapshot
      Recommendation: Carol Davis could develop planning (currently working)

    incident_response (65, 48th percentile, vs_org: -3)
      Contributing skills: incident_response (4 artifacts), sre_practices (2 artifacts)
      "On-call handoffs are still rough" — latest snapshot
```

The output is organized by driver. For each driver you will see:

- **Score and percentile** -- the team's GetDX score with its position relative
  to the organization (e.g. "72nd percentile, vs_org: +5").
- **Contributing skills** -- the skills from your standard that map to this
  driver, listed by ID.
- **Evidence counts** -- how many marker-matched artifacts exist for each
  contributing skill.
- **GetDX comments** -- up to two engineer comments related to the driver's
  contributing skills, surfaced from the latest snapshot.
- **Growth recommendations** -- if Summit is installed, specific individuals who
  could develop a contributing skill, with their current level noted.

### Understanding what the health view shows

The health view is designed for conversations about the system, not about
individuals. Driver scores are team-level aggregates from GetDX. Evidence counts
show how many artifacts across the team match a skill's markers -- not which
individual produced them. Comments are surfaced by keyword relevance to the
driver, not attributed to specific respondents.

When presenting health data in a quarterly review, the narrative is: "Here is
where the system is strong, here is where it is trending, and here is what
engineers are saying about it." The data supports that narrative without
requiring anyone to name names.

## Hear what engineers are saying

GetDX snapshot comments contain direct engineer feedback. Landmark surfaces
these comments in two modes, both useful for quarterly preparation.

See comments themed by topic across your team:

```sh
npx fit-landmark voice --manager alice@example.com
```

```text
  Voice: Alice Smith's team (latest snapshot)

    incident    3 comments
      "On-call handoffs are still rough"
      "Runbook coverage is improving but gaps remain"
      "Incident review meetings have been helpful"

    planning    2 comments
      "Sprint planning feels more realistic this quarter"
      "Design docs are getting better but still inconsistent"

    testing     1 comment
      "Integration tests saved us twice this month"

    Below-50th driver alignment:
      incident_response (48th percentile) — 3 incident comments
```

The manager view buckets comments by theme and counts how many mention each. It
also highlights drivers scoring below the 50th percentile where engineer
comments align -- showing where sentiment matches the quantitative data.

This is valuable for quarterly reviews because it grounds numerical scores in
the team's own words. A low `incident_response` score paired with three
incident comments tells a clearer story than the score alone.

## Check where evidence supports the standard

Evidence coverage shows whether the team's actual work produces artifacts that
match your standard's markers. Two views help here: practice patterns across the
team and the gap between derived and evidenced capability.

See practice patterns for your team:

```sh
npx fit-landmark practice --manager alice@example.com
```

```text
  Practice patterns: Alice Smith's team

    task_completion     12 artifacts   strong
    planning             8 artifacts   moderate
    incident_response    4 artifacts   developing
    sre_practices        2 artifacts   minimal
```

Practice patterns show which skills have strong marker-matched evidence and
which have little or none. Filter to a specific skill for detail:

```sh
npx fit-landmark practice --skill task_completion --manager alice@example.com
```

Compare what the standard predicts the team should be capable of against what
evidence actually shows:

```sh
npx fit-landmark practiced --manager alice@example.com
```

```text
  Practiced vs derived: Alice Smith's team

    Bob Chen
      task_completion    practitioner   evidenced
      planning           working        evidenced
      sre_practices      working        on paper only

    Carol Davis
      task_completion    practitioner   evidenced
      architecture       practitioner   on paper only
```

Skills flagged "on paper only" have derived capability (the team member's role
implies the skill) but no marker evidence. This can mean the evidence pipeline
has a gap, or it can highlight a coaching opportunity. Either way, it is
information worth surfacing in a quarterly review -- it shows where the
organization's definitions and actual practice diverge.

## Verify

You have demonstrated engineering progress without surveillance when:

1. **Health view renders with data.** `npx fit-landmark health --manager
   alice@example.com` shows at least one driver with a score, contributing
   skills, and evidence counts. No "No GetDX snapshot data available" messages.

2. **Trends show direction.** `npx fit-landmark snapshot trend --item code_review
   --manager alice@example.com` shows scores across multiple snapshots, making
   the trajectory visible.

3. **Engineer voice is surfaced.** `npx fit-landmark voice --manager
   alice@example.com` shows themed comments with counts. Comments align to
   drivers without attributing them to specific individuals.

4. **Evidence backs the story.** `npx fit-landmark practiced --manager
   alice@example.com` shows where the team's actual work matches the standard
   and where it does not -- system-level insight, not individual performance
   data.

All commands accept `--format text`, `--format json`, or `--format markdown`.
Use `--format markdown` to produce output suitable for sharing in documents and
presentations.

## What's next

<div class="grid">

<!-- part:card:culture-investments -->
<!-- part:card:../growth-areas -->

</div>
