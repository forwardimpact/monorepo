---
title: "Tell Whether Culture Investments Are Working"
description: "Track an initiative's impact on engineering outcomes by reading driver-score trends across the snapshots that straddle its completion date — and assemble a readout that holds up under VP scrutiny."
---

Budget season is the week after the quarterly review and the question is the
same every year: did last year's culture investments actually move anything?
This guide shows how to read driver-score change across the snapshots that
straddle an initiative's completion date, ground the delta in engineer voice
and organizational benchmarks, and assemble a readout that distinguishes good,
mixed, and failed investments before the next budget cycle.

## Prerequisites

Complete
[Demonstrate Engineering Progress](/docs/products/engineering-outcomes/) first.
That guide covers installing Landmark, validating standard data, confirming
your roster, and running the health view. The steps below assume Map's
activity layer is populated and you have at least two GetDX snapshots —
ideally one before the initiative began and one after it completed.

You also need to know which initiatives you ran and when they completed.
Landmark does not surface initiatives directly through the CLI; bring the
initiative name, owner, completion date, and intended driver from your GetDX
workspace or your team's planning notes.

## Match each initiative to its intended driver

A culture investment is hired to move a specific outcome. Before reading any
data, write down what each initiative was *supposed* to change:

| Initiative                       | Owner       | Completed   | Intended driver  |
| -------------------------------- | ----------- | ----------- | ---------------- |
| `init_007` Deep Work remediation | you         | 2025-02-28  | `deep_work`      |
| `init_029` One BioNova           | you         | 2025-08-15  | `code_review`    |

Initiative IDs and completion dates come from GetDX. Driver IDs come from
your `drivers.yaml` — list them with `npx fit-pathway driver --list` if you
need to look them up. If you cannot name the intended driver for an
initiative, the readout will not have a place to land; pause and resolve that
before continuing.

## Read the driver trend across the initiative window

For each initiative, read the driver's score across the snapshots that
straddle its completion date:

```sh
npx fit-landmark snapshot trend --item deep_work --manager you@example.com
```

```text
  Trend: deep_work (Your team)

    2024-12-15   58
    2025-03-15   71
    2025-06-14   74
    2025-09-13   76
```

`init_007` completed 2025-02-28 — between the 2024-12-15 and 2025-03-15
snapshots. The driver moved from 58 to 71 (+13) across that boundary, then
held above 70 through subsequent snapshots. That is the shape of an
investment that landed: a step change across the completion window that
persisted rather than reverting.

Repeat for the second initiative:

```sh
npx fit-landmark snapshot trend --item code_review --manager you@example.com
```

```text
  Trend: code_review (Your team)

    2025-03-15   76
    2025-06-14   78
    2025-09-13   77
    2025-12-12   78
```

`init_029` completed 2025-08-15 — between the 2025-06-14 and 2025-09-13
snapshots. The driver moved from 78 to 77 (-1), inside the noise of the
prior quarter's variation. That is the shape of an investment that did not
move the outcome it was hired for.

Pass `--format markdown` on either command to produce output you can paste
directly into a planning document or a VP-facing slide.

## Compare against the organization to rule out drift

A driver score can rise across a window because the organization as a whole
moved, not because the initiative did anything. Use `snapshot compare` to
check whether the change is specific to your team:

```sh
npx fit-landmark snapshot compare --snapshot NzE4MmRk --manager you@example.com
```

```text
  Snapshot comparison: NzE4MmRk (Your team vs organization)

    Driver          Team   p50   p75   p90
    deep_work         74    65    73    82
    code_review       78    70    80    88
    incident_response 65    68    76    84
```

If the organization-wide median moved with your team, the initiative may not
be responsible for the gain — environmental factors lift everyone. If the
team's percentile rose relative to the organization across the snapshot
boundary, the investment is more credibly the cause. Use the snapshot ID
that immediately follows the initiative's completion date — find it with
`npx fit-landmark snapshot list`.

## Ground the delta in engineer voice

A score change is more defensible when engineers say the system changed.
Surface comments for the driver in question:

```sh
npx fit-landmark voice --manager you@example.com
```

```text
  Voice: Your team (latest snapshot)

    focus       4 comments
      "No-meeting Wednesdays actually stuck this quarter"
      "Deep work blocks make a real difference"
      "Fewer interrupts during the afternoon stretch"
      "Meeting load is more reasonable than it was"

    Below-50th driver alignment:
      incident_response (48th percentile) — 3 incident comments
```

When themed comments line up with the intended driver — focus comments
clustering after a Deep Work initiative — the qualitative evidence backs the
quantitative shift. When comments cluster on a different theme, or fall
silent on the driver entirely, the readout should say so.

## Assemble the readout

For each initiative, write one of three verdicts grounded in what you saw:

- **Worked.** Driver moved across the completion window, team's percentile
  rose relative to the organization, and engineer voice aligns with the
  intended driver. Example: *"`init_007` (Deep Work remediation, completed
  2025-02-28) tracked with `deep_work` moving from 58 to 71 across the
  Q4→Q1 snapshot boundary. The team's Q1 percentile placed it above the
  organizational median, and engineer comments that quarter clustered on
  focus and meeting load. Recommend continuing the policy."*
- **Mixed.** Driver moved but the organization moved with it, or engineer
  voice doesn't corroborate. Surface both the score change and the caveats.
- **Did not land.** Driver did not move across the completion window — or
  moved within the prior quarter's range of variation — and engineer voice
  does not align. Recommend not renewing the spend without redesign.

The VP-facing version of each verdict is two sentences: the initiative and
its intended driver, then the observed change and how confident the
evidence is. Avoid stronger language than the data supports — culture
investments interact, and Landmark surfaces correlation across a snapshot
boundary, not causation.

## Verify

You have a defensible culture-investment readout when you can answer these
questions:

- **Did the intended driver move?** You have run
  `npx fit-landmark snapshot trend --item <driver>` for every initiative
  and can name the snapshot pair that straddles its completion date.
- **Is the change specific to your team?** You have run
  `npx fit-landmark snapshot compare --snapshot <id>` for the snapshot
  immediately after each initiative and can say whether the team's
  percentile rose or moved with the organization.
- **Does engineer voice agree?** You have run `npx fit-landmark voice
  --manager <email>` and can point to themed comments that align with the
  intended driver — or note their absence.
- **Have you classified each initiative?** Every initiative on your list
  carries a *worked*, *mixed*, or *did not land* verdict with the score
  delta and the qualitative evidence behind it.

If any verdict rests only on a score change without comparison or
corroborating voice, treat it as provisional and say so in the readout.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
