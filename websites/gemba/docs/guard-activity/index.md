---
title: Guard an Agent Team's Activity
description:
  Bound an agent team's output volume with a deterministic brake. Four counters
  over one window engage an operator latch that only a human clears.
---

An agent team that answers repository events can feed itself. A run posts a
comment, files an issue, or opens a pull request, and that output is itself an
event that starts the next run. `gemba-watchdog` bounds the volume: it counts
repository activity over a window and engages an operator latch when any
counter crosses its threshold.

The command engages the latch. It never clears it. A human clears it.

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

Inline review comments are out. One review panel legitimately posts many, so
counting them would stop the team on ordinary review activity.

## The threshold and the window

One number covers every counter. Pick a threshold that clears your largest
legitimate batch: a full scheduled session, one weekly dependency run, one
merge queue drain. Every repository has its own baselines, so the command
ships no default.

The window is the run interval times the number of runs you accept missing. A
15-minute schedule with a 2-hour window keeps a breach observable across seven
missed runs.

## `assess`

`assess` measures. It reads the repository and writes nothing.

```sh
npx gemba-watchdog assess --threshold 32 --window-hours 2
```

| Option | Role |
| ------ | ---- |
| `--threshold` | The breach threshold, one number for every counter |
| `--window-hours` | The window the counters cover |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--default-branch` | The branch the commit counter reads. Default `main` |
| `--killswitch-value` | Your own reading of the latch, for the summary only |

Under GitHub Actions it appends a table of every count to
`$GITHUB_STEP_SUMMARY` and writes two values to `$GITHUB_OUTPUT`:

- `verdict` — `engage` when any counter breached, `quiet` otherwise
- `reason` — the encoded reason, empty on a quiet run

The reason names the writer, every breached counter with its count and
threshold, and the time:

```text
watchdog|issues=47/32|comments=38/32|2026-09-02T14:49:00.000Z
```

`assess` exits 0 on every outcome, so a breach never reddens the measurement
job.

## `engage`

`engage` writes. Run it only after `assess` reports a breach.

```sh
npx gemba-watchdog engage --variable MY_KILLSWITCH \
  --reason "$REASON" --window-hours 2
```

| Option | Role |
| ------ | ---- |
| `--variable` | The latch variable's name. Required |
| `--reason` | The value to write. An empty value is refused |
| `--window-hours` | The window the resume rule measures |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--dry-run` | Read both variable scopes and write nothing |

It reads the repository variable first, then the organization listing, the way
every latch reader resolves the effective value. Two rules make it skip:

1. The effective value is already truthy. The team is already stopped.
2. A human cleared the repository value inside the window. The burst that
   caused the stop has not drained out of the counters yet, so the command
   yields for one window and the team resumes.

## The latch contract

The command sets the latch. It never clears it.

A human clears it by **writing a falsy value**: `""`, `0`, `false`, `no`, or
`off`. Deleting the variable is not clearing it. A deleted variable leaves no
timestamp, so it earns no quiet window and the next breach stops the team
again. Clearing at organization scope earns no quiet window either, because
the resume rule reads the repository record's own `updated_at`.

## Fail safe

Doubt stops the line. Two readings engage besides a count over the threshold:

- **`unreadable`** — the counter could not be read. Retries with exponential
  backoff absorb a transient failure first.
- **`uncovered`** — the response cannot cover the whole window. A full page of
  results held inside the window hides older items, so the count is a floor
  rather than a total.

An unnecessary stop costs idle agent time until a human clears it. A silent
brake costs an unbounded spend.

## CI wiring

Measurement and engagement run as separate jobs. Measurement is read-only and
mints no privileged token, so a quiet run never touches the write credential.

```yaml
name: "Watchdog"

on:
  schedule:
    - cron: "*/15 * * * *"
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
          default-branch: ${{ github.event.repository.default_branch }}
          token: ${{ secrets.GITHUB_TOKEN }}

  engage:
    needs: assess
    if: needs.assess.outputs.verdict == 'engage'
    runs-on: ubuntu-latest
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

Copy the shape, not the pin. Pin the action to a commit SHA you reviewed.

Give the workflow a name outside your agent workflows' own naming pattern, so
the "every agent workflow gates on the latch" contract stays true. The
watchdog must keep running after it engages.

## Exit codes

| Code | Outcome |
| ---- | ------- |
| 0 | `assess` on any verdict. `engage` on a skip or a dry run |
| 1 | `engage` wrote the latch, refused an empty reason, or could not read or write it |
| 2 | A usage error: a missing or invalid option |

An engaging run exits 1 on purpose. It stands out red in the run list, and the
reason it wrote names the cause.
