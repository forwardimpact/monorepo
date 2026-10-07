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

One number covers every counter. Pick a threshold that is higher than your
largest normal batch, such as a full scheduled session, one weekly dependency
run, or one merge queue drain. Every repository has its own baselines, so the
command ships no default.

The window is the tick interval times the number of ticks you accept missing. A
five-minute schedule with a 2-hour window holds 24 ticks. The watchdog queues on
the same runner pool as the runs it measures, so a flood that holds the pool
delays the tick that would stop it. The dispatch gate below acts in-band, at the
start of each self-caused run and before its checkout.

## `assess`

`assess` only measures. It reads the repository and writes nothing.

```sh
npx gemba-watchdog assess --threshold 32 --window-hours 2 \
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
watchdog|issues=47/32|comments=38/32|2026-09-02T16:49:00.000Z
```

`assess` exits 0 on every outcome, so a breach never turns the measurement job
red.

## `engage`

`engage` writes the latch. Run it only after `assess` reports a breach.

```sh
npx gemba-watchdog engage --variable MY_KILLSWITCH \
  --reason "$REASON" --window-hours 2
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
every run that an artifact event starts. After it mints its token, it
classifies the acting account as `human`, `self`, or `bot`. The account is
`self` when `sender.login` equals the App slug that the mint yielded, after the
action strips a `[bot]` suffix or an `app/` prefix. A `self` run measures the
same four counters over the action's `dispatch-window-hours` against its
`dispatch-budget`. A counter at or above the budget stands the run down before
checkout. The run writes one summary line, exits zero, and sets no latch. A
measurement that the run cannot complete also stands the run down. The budget
releases itself as the window slides. Human and bot actors never enter the
gate, and neither do runs with no artifact. The action's inputs are the one
home of the two numbers. Their defaults set a budget below the latch threshold
over the watchdog's window.

Each row replays one incident's recovered event timestamps against the rule it
names. Escaped counts artifacts created before the rule engaged plus a 45-minute
tail for sessions already in flight.

| Rule | Engages | Escaped: issues, PRs, comments |
| ---- | ------- | ------------------------------ |
| Nothing | never | 416, 142, about 2,300 |
| Watchdog, 32 per counter, 2 h, 15-minute tick | 15:15Z tick | 111, 36, 444 |
| Watchdog, 32 per counter, 2 h, 5-minute tick | 15:05Z tick | 95, 34, 380 |
| Gate, budget 24 per counter, 2 h, at run start | 15:01Z | 95, 34, 370 |

The task the lead receives opens with the actor's class and login. A
self-caused or bot-caused task asks the lead to stand down when the body hands
no new work.
[Coordinate an Agent Team](/docs/coordinate-team/#end-the-session) carries the
line and the verdict.

## CI wiring

Measurement and engagement run as separate jobs. Measurement is read-only and
mints no privileged token, so a quiet run never touches the write credential.

```yaml
name: "Watchdog"

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:

permissions:
  contents: read

env:
  WATCHDOG_THRESHOLD: "32"
  WATCHDOG_WINDOW_HOURS: "2"
  WATCHDOG_VARIABLE: MY_KILLSWITCH

jobs:
  assess:
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
          killswitch-value: ${{ vars[env.WATCHDOG_VARIABLE] }}
          token: ${{ secrets.GITHUB_TOKEN }}

  engage:
    needs: assess
    if: needs.assess.outputs.verdict == 'engage'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - uses: forwardimpact/gemba-watchdog@v1
        with:
          mode: engage
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          variable: ${{ env.WATCHDOG_VARIABLE }}
          reason: ${{ needs.assess.outputs.reason }}
          app-id: ${{ secrets.MY_APP_ID }}
          app-private-key: ${{ secrets.MY_APP_PRIVATE_KEY }}
```

Copy the workflow shape, but pin the action to a commit SHA that you reviewed.

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
