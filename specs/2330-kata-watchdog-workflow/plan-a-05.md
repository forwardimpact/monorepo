# Plan 2330-a Part 05: The watchdog workflow

The scheduled workflow, its two jobs, its literal numbers, and the `KATA.md`
paragraph that names it.

Depends on: part 04, and part 06 step 2. Route: `staff-engineer`.

## Step 1: Write the workflow

Run the brake every 15 minutes, measure without a token, and engage with one.

Created: `.github/workflows/watchdog.yml`

```yaml
name: "Watchdog"

# Repository CI, not a Kata surface. This workflow runs no agent, so it does
# not gate on KATA_KILLSWITCH. It must keep running after it engages the
# variable, and its name stays outside the kata-* glob so the "every kata-*
# workflow gates on the killswitch" contract stays true as written.
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:
    inputs:
      dry-run:
        description: "Read both killswitch scopes and write nothing"
        required: false
        type: boolean
        default: false

permissions:
  contents: read

# The threshold, the window, and the variable name each appear once. Both jobs
# read them from here, so no second copy exists.
env:
  WATCHDOG_THRESHOLD: "32"
  WATCHDOG_WINDOW_HOURS: "2"
  WATCHDOG_VARIABLE: KATA_KILLSWITCH

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
        uses: forwardimpact/gemba-watchdog@<sha> # v1
        with:
          mode: assess
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          variable: ${{ env.WATCHDOG_VARIABLE }}
          killswitch-value: ${{ vars.KATA_KILLSWITCH }}
          default-branch: ${{ github.event.repository.default_branch }}
          token: ${{ secrets.GITHUB_TOKEN }}

  engage:
    name: Engage
    needs: assess
    if: needs.assess.outputs.verdict == 'engage'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - uses: forwardimpact/gemba-watchdog@<sha> # v1
        with:
          mode: engage
          variable: ${{ env.WATCHDOG_VARIABLE }}
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          reason: ${{ needs.assess.outputs.reason }}
          dry-run: ${{ inputs.dry-run || 'false' }}
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Replace `<sha>` with the commit SHA part 06 step 2 tags as `v1` on
`forwardimpact/gemba-watchdog`. Set the action's `gear-release` default, in
part 03 step 1, to the release part 06 step 2 cuts, or pass it here.

The workflow adds no `concurrency` group. Each job times out at 5 minutes, and
the schedule fires every 15, so a run cannot overlap its successor.

Verify: `bunx jidoka invariants` passes with no change to the `kata-workflows`
enumeration topic, and a `workflow_dispatch` run with `dry-run: true` reports
four counts and writes nothing.

## Step 2: Name the watchdog in `KATA.md`

Tell the reader what now writes the variable a human used to write by hand.

Modified: `KATA.md`

In § Killswitch, change the final sentence "Clear or unset it to resume." to
"Write a falsy value to resume. Deleting the variable is not clearing it." Then
add one paragraph after it:

> This repository also runs a watchdog that engages the variable
> automatically. `.github/workflows/watchdog.yml` counts default-branch
> commits, pull requests created, issues created, and conversation comments
> created over a 2-hour window, every 15 minutes. Any counter that reaches 32
> engages the variable, and so does a counter the watchdog cannot read or
> cannot cover. The watchdog only sets the variable. It never clears it, and it
> does not gate on it, because it must keep running after it engages.

Verify: `bunx jidoka instructions` passes, `bunx jidoka invariants` passes, and
`rg 'unset it' KATA.md` returns nothing.

## Step 3: Confirm the brake end to end

Prove the two paths before the first unattended run.

Modified: nothing.

1. Dispatch the workflow with `dry-run: true`. The assess job reports four
   counts and a quiet or engage verdict. The engage job, when it runs, reports
   both killswitch scopes and writes nothing.
2. Read the assess run summary. It carries every count obtained, the
   killswitch's current value, and the verdict.
3. Confirm neither job checked the repository out and neither used an
   agent-running action.

Verify: both runs finish inside the 5-minute timeout, and
`gh variable list` shows `KATA_KILLSWITCH` unchanged.
