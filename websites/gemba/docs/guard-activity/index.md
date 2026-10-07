---
title: Guard an Agent Team's Activity
description:
  Bound an agent team's output volume with a deterministic brake. Four counters
  over one window set an operator latch that only a human clears.
---

An agent team that answers repository events can feed itself. A run posts a
comment, files an issue, or opens a pull request, and that output is itself an
event that starts the next run. `gemba-watchdog` bounds the volume. It counts
repository activity over a window and sets an operator latch when any counter
crosses its threshold.

The command only sets the latch. A human clears it.

## Prerequisites

- Node.js 22+
- The `gemba-watchdog` command. Run it with `npx gemba-watchdog`, or install
  the command family with `npm install -g @forwardimpact/gemba`
- A token in `GH_TOKEN` with read access to contents, issues, and pull
  requests. `engage` also needs write access to the latch variable
- A repository Actions variable the token may write

## The four counters

Each counter reads one signal against the same cutoff:

| Counter | What it counts |
| ------- | -------------- |
| `commits` | Commits on the default branch |
| `pulls` | Pull requests created |
| `issues` | Issues created, excluding pull requests |
| `comments` | Issue and pull-request conversation comments created |

Inline review comments are not counted. One review panel posts many of them,
so counting them would stop the team during normal review activity.

## The threshold and the window

One number covers every counter. Pick a threshold above the legitimate work one
window holds, such as two scheduled shifts, one weekly dependency run, or one
merge queue drain. Every repository has its own baselines, so the command ships
no default.

Size the window to the longest gap between the scheduled runs your repository
receives. GitHub delays scheduled runs under load, and it can drop them, so the
cron interval is only the shortest possible gap. Before you pick a window, read
the gaps between the runs of any scheduled workflow in the repository:
`gh run list --workflow <name> --event schedule`.

The Forward Impact repository is the worked example. Its watchdog ran 35
scheduled times over six days:

| Delivered gap between scheduled runs, 34 gaps | Hours |
| --------------------------------------------- | ----- |
| Shortest | 2.1 |
| Median | 4.0 |
| 90th percentile | 5.4 |
| Longest | 5.7 |

Every gap was longer than 2 hours, so a 2-hour window could not see a burst that
crossed the threshold and drained inside one gap. An 8-hour window is 1.4 times
the longest gap. On three of the four counters, the busiest legitimate work one
window holds is about 27 items, so a threshold of 48 keeps 1.8 times headroom.
The comments counter has no baseline yet.

The watchdog also ticks on the four counters' own events: an issue opens, a
conversation comment lands, a pull request opens, or the default branch
receives a push. A tick then lands when activity happens, which is the only time
a breach can exist. The schedule stays as the fallback. It covers activity made
with the runner's own token, which starts no workflow, and it records the latch
value on a quiet repository.

The watchdog queues on the same runner pool as the runs it measures, so a flood
that holds the pool delays the tick that would stop it. The dispatch gate below
acts in-band, at the start of each self-caused run and before its checkout.

## `assess`

`assess` only measures. It reads the repository and writes nothing.

```sh
npx gemba-watchdog assess --threshold 48 --window-hours 8 \
  --default-branch main
```

| Option | Role |
| ------ | ---- |
| `--threshold` | The breach threshold, one number for every counter. Required |
| `--window-hours` | The window the counters cover. Required |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--default-branch` | The branch the commit counter reads. Required |
| `--killswitch-value` | Your own reading of the latch, for the summary only |

Under GitHub Actions it appends a table of every count to
`$GITHUB_STEP_SUMMARY` and writes two values to `$GITHUB_OUTPUT`:

- `verdict`: `engage` when any counter breached, `quiet` otherwise
- `reason`: the encoded reason, empty on a quiet run

The reason gives the writer, every breached counter with its count and
threshold, and the time:

```text
watchdog|issues=51/48|comments=63/48|2026-01-15T09:30:00.000Z
```

`assess` exits 0 on every outcome, so a breach never turns the measurement job
red.

## `engage`

`engage` writes the latch. Run it only after `assess` reports a breach.

```sh
npx gemba-watchdog engage --variable MY_KILLSWITCH \
  --reason "$REASON" --window-hours 8
```

| Option | Role |
| ------ | ---- |
| `--variable` | The latch variable's name. Required |
| `--reason` | The value to write. Required. An empty value is refused |
| `--window-hours` | The window the resume rule measures. Required |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--dry-run` | Read both variable scopes and write nothing |

It reads the repository variable first, then the organization listing, in the
same way that every latch reader resolves the effective value. Two rules make
it skip:

1. The effective value is already truthy. The team is already stopped.
2. A human cleared the repository value inside the window. The burst that
   caused the stop has not yet drained out of the counters, so the command
   waits for one window and the team resumes.

## The latch contract

The command sets the latch and never clears it.

A human clears it by **writing a falsy value**: `""`, `0`, `false`, `no`, or
`off`. Deleting the variable also resumes the team, because every reader
treats an absent variable as falsy. However, deletion loses the quiet window. A
deleted variable has no `updated_at`, so the next breach can stop the team
again at once. Clearing at organization scope loses the quiet window for the
same reason, because the resume rule reads the repository record's own
timestamp.

## Fail safe

When the command cannot be sure, it stops the team. Two readings set the latch
besides a count over the threshold:

- `unreadable`: the counter could not be read. Retries with exponential
  backoff absorb a transient failure first.
- `uncovered`: the response cannot cover the whole window. A full page of
  results held inside the window hides older items, so the count is only a
  lower bound.

An unnecessary stop costs idle agent time until a human clears it, but a brake
that fails to stop the team can cost an unbounded spend.

## The dispatch gate

The [`kata-agent`](https://github.com/forwardimpact/kata-agent) action checks
every run that an artifact event starts. After it mints its token, it classifies
the acting account as `human`, `self`, or `bot`. The account is `self` when
`sender.login` equals the App slug that the mint yielded, after the action
strips a `[bot]` suffix or an `app/` prefix. Otherwise the account is `human`
when its type is `User`, and `bot` for any other type. A `self` run measures the
same four counters over the action's `dispatch-window-hours` against its
`dispatch-budget`. A counter at or above the budget stands the run down before
checkout. The run writes one summary line, exits zero, and sets no latch. A
measurement that the run cannot complete also stands the run down. The budget
releases itself as the window slides. Human and bot actors never enter the gate,
and neither do runs with no artifact. The action's inputs are the one home of
the two numbers. The gate's window is shorter than the watchdog's, so the gate
bounds a burst rate and the latch bounds sustained volume.

Each row replays one incident's recovered event timestamps against the rule it
names. Escaped counts artifacts created before the rule engaged plus a 45-minute
tail for sessions already in flight.

| Rule | Engages | Escaped: issues, PRs, comments |
| ---- | ------- | ------------------------------ |
| Nothing | never | 416, 142, about 2,300 |
| Gate, budget 24 per counter, 2 h, at run start | 15:01Z | 95, 34, 370 |

The task the lead receives opens with the actor's class and login. A
self-caused or bot-caused task asks the lead to stand down when the body hands
no new work.
[Coordinate an Agent Team](/docs/coordinate-team/#end-the-session) carries the
line and the verdict.

## CI wiring

Measurement and engagement run as separate jobs. Measurement is read-only and
mints no privileged token, so a quiet run never touches the write credential.

One tick runs and one waits. A new event replaces the waiting tick, and it can
replace a waiting manual dry run too, so dispatch the dry run again. The
pull-request tick uses `pull_request_target`: it runs the default branch's
workflow file with the repository's secrets and checks nothing out. A
`pull_request` trigger would run a branch's own copy of the file. An outside
user's issue, comment, or fork pull request can also start a tick. The workflow
reads nothing from the event, so that tick only counts, and a flood of such
events stops the team, which is the safe direction.

```yaml
name: "Watchdog"

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
    inputs:
      dry-run:
        description: >-
          Rehearse the engage job without writing. It reaches the engage job
          only when the assess job reports a breach, so on a quiet repository
          a dispatch exercises the counters alone.
        required: false
        type: boolean
        default: false
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened]
    branches: ["main"]
  push:
    branches: ["main"]

permissions: {}

concurrency:
  group: watchdog
  cancel-in-progress: false

env:
  WATCHDOG_THRESHOLD: "48"
  WATCHDOG_WINDOW_HOURS: "8"
  WATCHDOG_VARIABLE: "MY_KILLSWITCH"

jobs:
  assess:
    name: Measure
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      issues: read
      pull-requests: read
    outputs:
      verdict: ${{ steps.assess.outputs.verdict }}
      reason: ${{ steps.assess.outputs.reason }}
    steps:
      - id: assess
        uses: forwardimpact/gemba-watchdog@v1
        with:
          mode: assess
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          killswitch-value: ${{ vars.MY_KILLSWITCH }}
          default-branch: "main"
          token: ${{ github.token }}

  engage:
    name: Engage
    needs: assess
    if: needs.assess.outputs.verdict == 'engage'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - id: engage
        uses: forwardimpact/gemba-watchdog@v1
        with:
          mode: engage
          variable: ${{ env.WATCHDOG_VARIABLE }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          reason: ${{ needs.assess.outputs.reason }}
          dry-run: ${{ inputs.dry-run || 'false' }}
          app-id: ${{ secrets.MY_APP_ID }}
          app-private-key: ${{ secrets.MY_APP_PRIVATE_KEY }}
```

Copy the workflow shape, but pin the action to a commit SHA that you reviewed.
Write your default branch in its three places. Write your latch variable's name
in its two places, `env` and the `vars` literal. A dynamic `vars[...]` index
that fails to resolve reads as a cleared latch, so the literal stays.

Give the workflow a name that does not match your agent workflows' own naming
pattern, so that the rule "every agent workflow gates on the latch" stays
true. The watchdog must keep running after it engages.

## Exit codes

| Code | Outcome |
| ---- | ------- |
| 0 | `assess` on any verdict. `engage` on a skip or a dry run |
| 1 | `engage` wrote the latch, refused an empty reason, or could not read or write it |
| 2 | A usage error: a missing or invalid option |

An engaging run exits 1 so that it appears red in the run list, and the reason
it wrote explains the cause.
