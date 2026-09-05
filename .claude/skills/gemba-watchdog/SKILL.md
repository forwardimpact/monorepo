---
name: gemba-watchdog
description: >
  Bound an agent team's output volume with a deterministic brake a human
  clears. Use when an agent event chain creates issues, pull requests, or
  comments faster than a human can read them, when you need a scheduled
  guardrail that engages an operator latch on a breach, or when you wire the
  activity watchdog into CI.
---

# Activity Watchdog

`gemba-watchdog` counts repository activity over a window. It compares each
count against one threshold. Any breach engages an operator latch variable
that stops the team's workflows.

The command engages the latch. **It never clears it.** A human clears it.

## When to Use

**Measure the current activity:**

- Report the four counts and the verdict —
  `npx gemba-watchdog assess --threshold 32 --window-hours 2 --default-branch main`
- Get the verdict as JSON — add `--format json`

**Engage the latch after a breach:**

- Write the latch —
  `npx gemba-watchdog engage --variable MY_KILLSWITCH --reason "$REASON" --window-hours 2`
- Read both scopes and write nothing — add `--dry-run`

Use this for _"is the team creating work faster than a human can read it?"_.
Do not use it for _"who created this work and why?"_. The watchdog compares
counts. It makes no judgment about the author or the intent.

## The Four Counters

| Counter | What it counts |
| ------- | -------------- |
| `commits` | Commits on the default branch |
| `pulls` | Pull requests created |
| `issues` | Issues created, excluding pull requests |
| `comments` | Issue and pull-request conversation comments created |

Every counter reads the same cutoff and carries the same threshold. Inline
review comments are out: one review panel legitimately posts many.

## CLI Reference

### `assess`

Read-only. It writes no variable and exits 0 on every outcome.

| Option | Role |
| ------ | ---- |
| `--threshold` | Breach threshold, one number for every counter. Required |
| `--window-hours` | Window the counters cover. Required |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--default-branch` | Branch the commit counter reads. Required |
| `--killswitch-value` | Your own latch reading, for the summary only |

Under GitHub Actions it appends the counts to `$GITHUB_STEP_SUMMARY` and
writes `verdict` (`engage` or `quiet`) and `reason` to `$GITHUB_OUTPUT`.

### `engage`

| Option | Role |
| ------ | ---- |
| `--variable` | Latch variable name. Required |
| `--reason` | Value to write. Required. An empty value is refused |
| `--window-hours` | Window the resume rule measures. Required |
| `--repo` | `owner/repo`. Falls back to `$GITHUB_REPOSITORY` |
| `--dry-run` | Read both scopes and write nothing |

It skips when the effective value is already truthy, and for one window after
a human clears the repository value.

## The Reason Grammar

The written value names the writer, every breached counter with its count and
threshold, and the time:

```text
watchdog|issues=47/32|comments=38/32|2026-09-02T16:49:00.000Z
```

`unreadable` and `uncovered` breaches lead the line.

## Rules

- **Never write the latch variable yourself.** The watchdog is the only
  automatic writer.
- **A human clears the latch by writing a falsy value** (`""`, `0`, `false`,
  `no`, `off`). Deleting the variable is not clearing it, and it earns no
  quiet window.
- **Doubt stops the line.** A counter the command cannot read reports
  `unreadable`. A response that cannot cover the window reports `uncovered`.
  Both engage.
- **Pick the threshold from your own baselines.** It must clear the largest
  legitimate batch the repository produces. The command ships no default.
- **Keep the workflow outside the family your latch gates.** The watchdog must
  keep running after it engages, so it never gates on the variable it writes.

## Exit Codes

| Code | Outcome |
| ---- | ------- |
| 0 | `assess` on any verdict. `engage` on a skip or a dry run |
| 1 | `engage` wrote the latch, refused an empty reason, or could not read or write it |
| 2 | A usage error: a missing or invalid option |

## Documentation

- [Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md)
  — The four counters, the threshold and window, the latch contract, the
  clearing rule, the CI wiring, and the exit codes
