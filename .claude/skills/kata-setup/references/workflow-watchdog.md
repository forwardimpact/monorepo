# Workflow Template: Activity Watchdog

The watchdog counts default-branch commits, pull requests created, issues
created, and conversation comments created over one window. It engages
`KATA_KILLSWITCH` when any count reaches the threshold. Generate it for every
installation. File name: `watchdog.yml`. Replace `{{GEMBA_WATCHDOG_REF}}` and
`{{DEFAULT_BRANCH}}` at generation time.

The name stays outside the `Agent:` family. The watchdog must keep running after
it engages the variable, so it never gates on it. The threshold and the window
appear once, in `env`. The variable name appears in `env` and once more as the
`vars` literal, because a dynamic index that fails to resolve reads as a cleared
latch. `default-branch` stays a literal, because the schedule event's payload
is not documented to carry the repository's default branch. In hosted mode the
engage job holds no App key. On a breach it fails at its token mint, so the run
is red and nothing is written.

## Placeholders

| Placeholder              | Resolve with                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `{{GEMBA_WATCHDOG_REF}}` | Per [`action-refs.md`](action-refs.md)                           |
| `{{DEFAULT_BRANCH}}`     | `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` |

## Template

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

permissions: {}

env:
  WATCHDOG_THRESHOLD: "32"
  WATCHDOG_WINDOW_HOURS: "2"
  WATCHDOG_VARIABLE: "KATA_KILLSWITCH"

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
        uses: forwardimpact/gemba-watchdog@{{GEMBA_WATCHDOG_REF}}
        with:
          mode: assess
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          killswitch-value: ${{ vars.KATA_KILLSWITCH }}
          default-branch: "{{DEFAULT_BRANCH}}"
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
        uses: forwardimpact/gemba-watchdog@{{GEMBA_WATCHDOG_REF}}
        with:
          mode: engage
          variable: ${{ env.WATCHDOG_VARIABLE }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          reason: ${{ needs.assess.outputs.reason }}
          dry-run: ${{ inputs.dry-run || 'false' }}
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```
