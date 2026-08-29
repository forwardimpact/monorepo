---
title: Demonstrate Engineering Progress
description: Walk into a quarterly review with system-level trends, marker evidence, and engineer voice. Demonstrate progress and do not single out individuals.
---

The quarterly review is due and the only data is ticket counts. Ticket counts
single out individuals. They do not describe the system. This guide shows
how to prepare a quarterly presentation with Landmark. The presentation uses
system-level trends, marker evidence, and engineer voice. These show direction
and do not name individuals.

## Prerequisites

- [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/) --
  install Map, migrate the activity schema, load your roster, and sync GetDX
  data.
- [Getting Started: Landmark for Leaders](/docs/getting-started/leaders/landmark/)
  -- install Landmark and confirm you can run `npx fit-landmark org show`.
- [Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/)
  -- define drivers and markers in your standard data. Landmark's health,
  evidence, and readiness views require drivers in `drivers.yaml` and markers in
  your capability YAML files.

The rest of this guide assumes Map's activity layer runs and holds data.
If you want to explore with synthetic data first, see
[Trying the activity layer with synthetic data](/docs/getting-started/leaders/map/#trying-the-activity-layer-with-synthetic-data)
in the Map guide.

## Confirm your data is ready

Before you build views for a quarterly review, confirm that the standard data,
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

If any errors appear, resolve them with the guidance in
[Authoring Agent-Aligned Engineering Standards](/docs/products/authoring-standards/).

Confirm that you loaded the roster and that the team hierarchy is visible:

```sh
npx fit-landmark org team --manager alice@example.com
```

```text
  Team under alice@example.com

    Alice Smith           alice@example.com    Software Engineering / J080 (manager)
    Bob Chen              bob@example.com      Software Engineering / J060
    Carol Davis           carol@example.com    Software Engineering / J070
    Dan Park              dan@example.com      Data Engineering / J060
```

If the output is empty, re-run `npx fit-map people push roster.csv` with your
current roster file.

Confirm that snapshot data is available:

```sh
npx fit-landmark snapshot list
```

```text
  GetDX Snapshots

    MjUyNbaY                        2025-03-15   completed
    NzE4MmRk                        2025-06-14   completed
```

The third column is the snapshot status (`completed` or `pending`). The
date is the snapshot's `scheduled_for` value.

If the output is empty, run `npx fit-map getdx sync`. Then run
`npx fit-map activity transform` to ingest the latest GetDX data.

## See system-level trends across snapshots

Quarterly reviews need context. The context says whether a score improves,
declines, or stays flat. Before you open the health view, check how a
specific driver moved over time.

Track a driver's trend across snapshots, scoped to your team:

```sh
npx fit-landmark snapshot trend --item code-review --manager alice@example.com
```

```text
  Trend for code-review

    2025-03-15       72
    2025-06-14       78
    2025-09-13       81
```

The output shows the driver's score at each snapshot date. That makes the
direction visible. Replace `code-review` with any driver ID from your
`drivers.yaml`. The starter data includes `code-review`, `incident-response`,
and `deep-work`.

Compare the latest snapshot against organizational benchmarks:

```sh
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager alice@example.com  # ID from 'snapshot list'
```

```text
  Snapshot snap_2025_Q3

    Code Review        78    vs_prev: +6, vs_org: +8, vs_50th: +8, vs_75th: -2, vs_90th: -10
    Incident Response  65    vs_prev: -3, vs_org: -3, vs_50th: -3, vs_75th: -11, vs_90th: -19
    Deep Work          82    vs_prev: +1, vs_org: +10, vs_50th: +10, vs_75th: +1, vs_90th: -8
```

Each row shows the team's score. Signed deltas follow it. The deltas compare
against the previous snapshot (`vs_prev`), the organization median
(`vs_org`), and the 50th/75th/90th percentiles. Use the snapshot ID from
`npx fit-landmark snapshot list`.

## Build the health view

The health view is the core of Landmark's quarterly presentation. It
joins driver scores, contributing-skill evidence, engineer voice comments, and
growth recommendations into a single picture. It scopes that picture to a
manager's team.

Run the health view for your team:

```sh
npx fit-landmark health --manager alice@example.com
```

```text
  alice@example.com team — health view

  Drivers (2)
  ────────────────────────────────────────────────────────────
  #  Driver             Percentile  vs_org  More
  1  code-review        72nd        +5      -
  2  incident-response  48th        -3      -

  Recommendations (1 unique)
  ────────────────────────────────────────────────────────────
  - Carol Davis (working) could develop planning — for code-review (high)
```

The default output is a compact table organized by driver, followed by deduped
growth recommendations. Each row shows:

- **Driver name** -- the driver ID from your `drivers.yaml`.
- **Percentile** -- the team's GetDX score position relative to the
  organization (e.g. `72nd`).
- **vs_org** -- the signed delta against the org median (e.g. `+5`).
- **More** -- a hint when additional per-driver anchors are available through
  `--verbose`.

Landmark populates the Recommendations table at the end of the output when
the installation includes Summit. It dedupes the table per
`(candidate, skill)`. Each line
names the individual who could develop the skill. It also names their current
proficiency and the driver the development serves.

Pass `--verbose` to switch to a per-driver paragraph layout. That layout
discloses all percentile anchors, contributing skills, evidence counts, and
the two most recent GetDX comments per driver:

```sh
npx fit-landmark health --manager alice@example.com --verbose
```

```text
  alice@example.com team — health view

    Driver: code-review (72nd percentile)
      Anchors: percentile=72, vs_org=+5
      Contributing skills: task-completion, planning
      Evidence: 12 artifacts for task-completion, 8 artifacts for planning
      GetDX comments: "We've been catching more issues in review lately"
                      "Design docs are getting better but still inconsistent"

      ⮕ Recommendation: Carol Davis (working) could develop planning.
        (Summit growth alignment: high)
```

### What the health view shows

The health view supports conversations about the system. It does not support
conversations about individuals.

Driver scores are team-level aggregates from
GetDX. Evidence counts show how many artifacts across the team match a skill's
markers. They do not show which individual produced them. Landmark surfaces
comments by keyword relevance to the driver. It does not attribute them to
specific respondents.

When you present health data in a quarterly review, the narrative names where
the system is strong. It names the trend. It reports what engineers say about
the system. The data supports that narrative. Nobody has to name names.

## Hear what engineers say

GetDX snapshot comments contain direct engineer feedback. Landmark surfaces
these comments in two modes, both useful for quarterly preparation.

See comments themed by topic across your team:

```sh
npx fit-landmark voice --manager alice@example.com
```

```text
  alice@example.com team — engineer voice

    Most discussed themes:
      incident              3 comments   "On-call handoffs are still rough", "Runbook coverage is improving but gaps remain"
      planning              2 comments   "Sprint planning feels more realistic this quarter", "Design docs are getting better but still inconsistent"
      testing               1 comments   "Integration tests saved us twice this month"

    Below-50th driver alignment:
      incident-response (48th percentile) — 3 incident comments
```

The manager view buckets comments by theme. It counts how many comments
mention each theme. It shows the two most recent snippets inline per theme. It
also highlights drivers that score below the 50th percentile where engineer
comments align. There, sentiment matches the quantitative data.

This view helps a quarterly review because it grounds numerical scores in
the team's own words. A low `incident-response` score paired with three
incident comments is clearer than the score alone.

## Check where evidence supports the standard

Evidence coverage shows whether the team's actual work produces artifacts that
match your standard's markers. Two views help here. The first shows practice
patterns across the team. The second shows the gap between derived and
evidenced capability.

See practice patterns for your team:

```sh
npx fit-landmark practice --manager alice@example.com
```

```text
  Practice patterns

    task-completion       matched: 12  unmatched: 4   total: 16
    planning              matched: 8   unmatched: 2   total: 10
    incident-response     matched: 4   unmatched: 6   total: 10
    sre_practices         matched: 2   unmatched: 5   total: 7
```

Each row shows how many marker-matched artifacts exist for the skill, how many
unmatched candidates remain, and the total considered. Skills with high
`matched:` counts have strong evidence. Rows with low matched and high
unmatched signal where the evidence pipeline is light. Filter to a specific
skill for detail:

```sh
npx fit-landmark practice --skill task-completion --manager alice@example.com
```

Compare what the standard predicts the team should be capable of against what
evidence actually shows:

```sh
npx fit-landmark practiced --manager alice@example.com
```

```text
  Practiced capability — alice@example.com (4 members)

    Task Completion       derived: practitioner   evidenced: 18 evidence rows
    Planning              derived: working        evidenced: 7 evidence rows
    Incident Response     derived: working        evidenced: 0 ← on paper only
    SRE Practices         derived: working        evidenced: 0 ← on paper only
    Architecture Design   derived: practitioner   evidenced: 0 ← on paper only
```

Each row aggregates across the team. The `derived:` value is the highest
proficiency the team's role definitions imply for the skill. The `evidenced:`
value counts the marker-matched evidence rows behind it.

Rows that trail
`← on paper only` flag skills that the standard predicts but that evidence
does not yet cover. The inverse marker `← evidenced beyond role` marks skills
whose evidence outruns the derived role profile. This can mean the evidence
pipeline has a gap. It can also highlight an opportunity to coach.
Either way, the information is worth a mention in a quarterly review. It
shows where the organization's definitions and actual practice diverge.

## Verify

You demonstrate engineering progress without surveillance when:

1. **Health view renders with data.** `npx fit-landmark health --manager
   alice@example.com` shows at least one driver with a score, contributing
   skills, and evidence counts. No "No GetDX snapshot data available" messages.

2. **Trends show direction.**
   `npx fit-landmark snapshot trend --item code-review --manager alice@example.com`
   shows scores across multiple snapshots. That makes the trajectory visible.

3. **Landmark surfaces engineer voice.** `npx fit-landmark voice --manager
   alice@example.com` shows themed comments with counts. Comments align to
   drivers. Landmark does not attribute them to specific individuals.

4. **Evidence backs the story.** `npx fit-landmark practiced --manager
   alice@example.com` shows where the team's actual work matches the standard
   and where it does not. The result is system-level insight. It is not
   individual performance data.

All commands accept `--format text`, `--format json`, or `--format markdown`.
Use `--format markdown` to produce output you can share in documents and
presentations.

## What's next

<div class="grid">

<!-- part:card:culture-investments -->
<!-- part:card:../growth-areas -->

</div>
