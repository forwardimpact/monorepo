---
title: "Surface Capability Gaps"
description: "See capability gaps before they become incidents. Summit shows structural risks, coverage trends, and growth opportunities."
---

You need to find capability gaps in your team before someone gets set up to
fail. Do not wait for a post-mortem to reveal them. This guide walks through
three complementary views: structural risks, coverage trajectory, and growth
alignment.

## Prerequisites

Complete
[Make Staffing Decisions You Can Defend](/docs/products/team-capability/) first.
That guide covers roster setup, role requirements, coverage analysis, and
what-if simulations. The steps below build on that foundation.

## Detect structural risks

The `risks` command surfaces three categories of structural weakness in your
team's composition:

```sh
npx fit-summit risks platform --roster ./summit.yaml
```

Expected output:

```text
  platform team — structural risks

  Single points of failure:
    infrastructure — only alice.chen holds practitioner level [low]
    incident-response — only bob.kumar holds working level [low]

  Critical gaps:
    observability — no engineer at working level
      core skill for software-engineering discipline.
    capacity_planning — no engineer at working level
      broad skill for software-engineering discipline.

  Concentration risks:
    delivery skills — 3 of 5 engineers at J060 working level
```

Each category tells you something different:

- **Single points of failure** name skills where exactly one engineer holds
  working-level proficiency or higher. If that person is unavailable, the
  capability disappears.
- **Critical gaps** name skills that the team's disciplines and tracks require
  but no one covers at the working level. These are the gaps that surface in
  post-mortems.
- **Concentration risks** flag groups of engineers clustered at the same level
  and proficiency in the same capability area. The group becomes a bottleneck
  because everyone has the same ceiling.

When a single point of failure involves a part-time allocation below 1.0,
Summit raises the severity. A `[high]` severity means the sole holder works
less than half-time for the team.

## Track coverage over time

A point-in-time risk snapshot tells you what is fragile now. The `trajectory`
command shows how coverage changed across quarters. It reveals whether gaps
form or close:

```sh
npx fit-summit trajectory platform --roster ./summit.yaml --quarters=4
```

Expected output:

```text
  platform team — capability trajectory

  Roster changes:
    2025-Q2: 5 engineers (no changes)
    2025-Q1: 5 engineers (dana.wu joined)
    2024-Q4: 4 engineers (no changes)
    2024-Q3: 4 engineers (eve.park left)

  Coverage evolution:
    skill                   2024-Q3 2024-Q4 2025-Q1 2025-Q2 trend
    api_design              3       3       4       4       improving
    capacity_planning       0       0       0       0       stable
    incident-response       1       1       1       1       stable
    infrastructure          1       1       1       1       stable
    observability           0       0       0       0       stable
    system_design           2       2       3       3       improving
    task_decomposition      2       2       3       3       improving

  Persistent gaps: capacity_planning, observability
```

The **persistent gaps** line names skills that had zero depth across every
quarter shown. These gaps are not new and they do not trend toward resolution.
They are the most likely to cause failures.

Trajectory requires a version-controlled `summit.yaml` so Summit can read
historical roster snapshots from git.

## Compare teams to find relative weaknesses

When you lead multiple teams, a gap on one team may have coverage on another
team:

```sh
npx fit-summit compare platform delivery --roster ./summit.yaml
```

Expected output:

```text
  Comparison: Platform vs Delivery

  Skill                 Platform depth   Delivery depth   Delta
  task_decomposition    3                4                -1
  estimation            2                1                +1
  incident-response     1                3                -2
  system_design         3                1                +2
  api_design            4                2                +2

  Risks unique to Platform:  infrastructure (single point of failure)
  Risks unique to Delivery:  estimation (single point of failure)
```

Address unique risks first. No other team compensates for them. When both teams
share the same gap, the problem is organizational and not specific to one team.

## Identify growth opportunities that close gaps

The `growth` command names the team members in the best position to close the
gaps you found:

```sh
npx fit-summit growth platform --roster ./summit.yaml
```

```text
  platform team — growth opportunities

  High impact (addresses critical gaps):
    observability
      dana.wu (J060, foundational) or carlos.ruiz (J060, foundational) could develop this skill.

  Medium impact (reduces single points of failure):
    infrastructure
      bob.kumar (J060, awareness) or dana.wu (J060, awareness) could develop this skill.

  Low impact (strengthens existing coverage):
    incident-response
      carlos.ruiz (J060, foundational) or dana.wu (J060, foundational) could develop this skill.
```

Summit groups the recommendations by impact. High-impact items address critical
gaps, where nobody covers the skill. Medium-impact items reduce single points
of failure. Low-impact items add depth and strengthen existing coverage.

Each recommendation names the team members closest to the target proficiency.
The path from `foundational` to `working` is shorter than the path from
`awareness`.

## Strip names for broader audiences

When you share risk or growth reports beyond the direct team, use the
`--audience` flag to control individual-level detail:

```sh
npx fit-summit risks platform --roster ./summit.yaml --audience director
```

```text
  Single Points of Failure:
    infrastructure            1 engineer (practitioner)
    incident-response         1 engineer (working)

  Critical Gaps:
    observability             No engineer at working+
```

Summit replaces names with aggregate counts. The structural findings remain the
same.

## Verify

You complete this guide when you can answer these questions from your Summit
output:

- **What are the team's structural risks right now?** You ran
  `npx fit-summit risks`. You can name the single points of failure, critical
  gaps, and concentration risks.
- **Do gaps form or close?** You ran
  `npx fit-summit trajectory`. You can identify persistent gaps and coverage
  trends.
- **Which gaps are unique to this team?** If you lead multiple teams, you ran
  `npx fit-summit compare`. You can distinguish team-specific risks from
  organizational ones.
- **Who is in the best position to close the gaps?** You ran
  `npx fit-summit growth`. You can name the recommended growth paths for
  high-impact gaps.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../evaluate-candidate -->

</div>
