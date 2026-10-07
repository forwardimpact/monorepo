# Workflow Template: Activity Watchdog

The watchdog counts default-branch commits, pull requests created, issues
created, and conversation comments created over one window. It engages
`KATA_KILLSWITCH` when any count reaches the threshold. File name:
`watchdog.yml`. Resolve every placeholder from
[`parameters-guard.md`](parameters-guard.md), and `{{GEMBA_WATCHDOG_REF}}` per
[`action-refs.md`](action-refs.md).

It ticks on a schedule and on the four counters' own events, because GitHub
delivers scheduled runs late under load. One tick runs and one waits. The name
stays outside the `Agent:` family, and the workflow never gates on the variable
it writes. The self-hosted block names the variable twice, in `env` and as the
`vars` literal, because a dynamic index that fails to resolve reads as a cleared
latch.

## Template (Self-Hosted)

```yaml
name: "Watchdog"

on:
  schedule:
    - cron: "{{WATCHDOG_CRON}}"
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
    branches: ["{{DEFAULT_BRANCH}}"]
  push:
    branches: ["{{DEFAULT_BRANCH}}"]

permissions: {}

concurrency:
  group: watchdog
  cancel-in-progress: false

env:
  WATCHDOG_THRESHOLD: "{{WATCHDOG_THRESHOLD}}"
  WATCHDOG_WINDOW_HOURS: "{{WATCHDOG_WINDOW_HOURS}}"
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

## Template (Hosted)

A hosted installation holds no App key, so it cannot engage. Change the
self-hosted template in three ways:

1. Delete the `engage` job.
2. Delete the `inputs:` block under `workflow_dispatch:`, so the trigger stays
   bare, and the `WATCHDOG_VARIABLE` line under `env:`.
3. Append this step to the `assess` job, so a breach turns the run red:

   ```yaml
         - name: Fail on a breach
           if: steps.assess.outputs.verdict == 'engage'
           env:
             REASON: ${{ steps.assess.outputs.reason }}
           run: |
             echo "::error::Breach: $REASON. Engage needs the App key, so set KATA_KILLSWITCH by hand. Ticks stay red until the counts drain."
             exit 1
   ```
