---
title: "Tell Whether Culture Investments Are Working"
description: "Track an initiative's impact on engineering outcomes. Read driver-score trends across the snapshots that straddle its completion date. Assemble a readout that holds up under VP scrutiny."
---

Budget season is the week after the quarterly review. The question is the same
every year. Did last year's culture investments actually move anything? This
guide shows how to read driver-score change across the snapshots that straddle
an initiative's completion date. It shows how to ground the delta in engineer
voice and organizational benchmarks. It also shows how to assemble a readout
that distinguishes good, mixed, and failed investments before the next budget
cycle.

## Prerequisites

Complete
[Demonstrate Engineering Progress](/docs/products/engineering-outcomes/) first.
That guide covers how to install Landmark, validate standard data, confirm
your roster, and run the health view. The steps below assume Map's activity
layer holds data. They also assume you have at least two GetDX snapshots.
Ideally one snapshot comes from before the initiative began and one from after
it completed.

You also need to know which initiatives you ran and when they completed.
Landmark does not surface initiatives directly through the CLI. Bring the
initiative name, owner, completion date, and intended driver. Take them from
your GetDX workspace or your team's planning notes.

## Match each initiative to its intended driver

You hire a culture investment to move a specific outcome. Before you read any
data, write down what each initiative was *supposed* to change:

| Initiative                       | Owner       | Completed   | Intended driver  |
| -------------------------------- | ----------- | ----------- | ---------------- |
| `init_007` Deep Work remediation | you         | 2025-02-28  | `deep-work`      |
| `init_029` One BioNova           | you         | 2025-08-15  | `code-review`    |

Initiative IDs and completion dates come from GetDX. Driver IDs come from
your `drivers.yaml`. List them with `npx fit-pathway driver --list` if you
need to look them up. If you cannot name the intended driver for an
initiative, the readout will not have a place to land. Pause and resolve that
before you continue.

## Read the driver trend across the initiative window

For each initiative, read the driver's score across the snapshots that
straddle its completion date:

```sh
npx fit-landmark snapshot trend --item deep-work --manager you@example.com
```

```text
  Trend: deep-work (Your team)

    2024-12-15   58
    2025-03-15   71
    2025-06-14   74
    2025-09-13   76
```

`init_007` completed 2025-02-28. That date falls between the 2024-12-15 and
2025-03-15 snapshots. The driver moved from 58 to 71 (+13) across that
boundary. It then held above 70 through later snapshots. That is the shape of
an investment that landed. The step change across the completion window
persisted. It did not revert.

Repeat for the second initiative:

```sh
npx fit-landmark snapshot trend --item code-review --manager you@example.com
```

```text
  Trend: code-review (Your team)

    2025-03-15   76
    2025-06-14   78
    2025-09-13   77
    2025-12-12   78
```

`init_029` completed 2025-08-15. That date falls between the 2025-06-14 and
2025-09-13 snapshots. The driver moved from 78 to 77 (-1). That change sits
inside the noise of the prior quarter's variation. That is the shape of an
investment that did not move the outcome you hired it for.

Pass `--format markdown` on either command to produce output you can paste
directly into a planning document or a VP-facing slide.

## Compare against the organization to rule out drift

A driver score can rise across a window because the organization as a whole
moved. The initiative can have no part in that rise. Use `snapshot compare` to
check whether the change is specific to your team:

```sh
npx fit-landmark snapshot compare --snapshot NzE4MmRk --manager you@example.com
```

```text
  Snapshot comparison: NzE4MmRk (Your team vs organization)

    Driver          Team   p50   p75   p90
    deep-work         74    65    73    82
    code-review       78    70    80    88
    incident-response 65    68    76    84
```

If the organization-wide median moved with your team, the initiative may not
be responsible for the gain. Environmental factors lift everyone. If the
team's percentile rose relative to the organization across the snapshot
boundary, the investment is more credibly the cause. Use the snapshot ID
that immediately follows the initiative's completion date. Find it with
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
      incident-response (48th percentile) — 3 incident comments
```

When themed comments line up with the intended driver, the qualitative
evidence backs the quantitative shift. An example is focus comments that
cluster after a Deep Work initiative. When comments cluster on a different
theme, or fall silent on the driver entirely, the readout should say so.

## Assemble the readout

For each initiative, write one of three verdicts grounded in what you saw:

- **Worked.** The driver moved across the completion window. The team's
  percentile rose relative to the organization. Engineer voice aligns with the
  intended driver. Example: *"`init_007` (Deep Work remediation, completed
  2025-02-28) tracked with `deep-work`, which moved from 58 to 71 across the
  Q4→Q1 snapshot boundary. The team's Q1 percentile placed it above the
  organizational median. Engineer comments that quarter clustered on
  focus and meeting load. The recommendation is to continue the policy."*
- **Mixed.** The driver moved, but the organization moved with it. Or engineer
  voice does not corroborate. Surface both the score change and the caveats.
- **Did not land.** The driver did not move across the completion window. Or
  it moved within the prior quarter's range of variation. Engineer voice also
  does not align. Recommend no renewal of the spend without a redesign.

The VP-facing version of each verdict is two sentences. The first names the
initiative and its intended driver. The second gives the observed change and
the confidence in the evidence. Avoid stronger language than the data
supports. Culture investments interact. Landmark surfaces correlation across a
snapshot boundary. It does not surface causation.

## Verify

You have a defensible culture-investment readout when you can answer these
questions:

- **Did the intended driver move?** You ran
  `npx fit-landmark snapshot trend --item <driver>` for every initiative.
  You can name the snapshot pair that straddles its completion date.
- **Is the change specific to your team?** You ran
  `npx fit-landmark snapshot compare --snapshot <id>` for the snapshot
  immediately after each initiative. You can say whether the team's
  percentile rose or moved with the organization.
- **Does engineer voice agree?** You ran `npx fit-landmark voice
  --manager <email>`. You can point to themed comments that align with the
  intended driver. You can also note their absence.
- **Have you classified each initiative?** Every initiative on your list
  carries a *worked*, *mixed*, or *did not land* verdict. The verdict includes
  the score delta and the qualitative evidence behind it.

If a verdict rests only on a score change, with no comparison and no voice to
corroborate it, treat it as provisional. Say so in the readout.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
