# Plan 2330-a Part 05: The watchdog workflow

The scheduled workflow, its two jobs, its literal numbers, and the `KATA.md`
paragraph that names it.

Depends on: part 04, and part 06 step 3. Route: `staff-engineer`.

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

# The threshold, the window, and the variable name each appear exactly once.
# Both jobs read them from here, including the `vars` lookup below, which
# indexes with the same env value rather than repeating the name.
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
          killswitch-value: ${{ vars[env.WATCHDOG_VARIABLE] }}
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
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          reason: ${{ needs.assess.outputs.reason }}
          dry-run: ${{ inputs.dry-run || 'false' }}
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Replace `<sha>` with the commit SHA part 06 step 3 tags as `v1`. The action
already carries the real `gear-release` default from part 03 step 1, so this
workflow passes none.

The engage job passes no `threshold`. The action forwards only the options each
subcommand declares, and `engage` declares none.

The workflow adds no `concurrency` group. Two engage jobs racing is harmless:
the second reads a truthy value and skips. Cancelling an in-flight engage would
drop the write, which is the one outcome the brake cannot afford.

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
> created over a fixed window, on a fixed schedule. Any counter that reaches the
> threshold engages the variable, and so does a counter the watchdog cannot read
> or cannot cover. The workflow carries the schedule, the window, and the
> threshold. The watchdog only sets the variable. It never clears it, and it
> does not gate on it, because it must keep running after it engages.

The paragraph names no number. Success criterion 2 requires the threshold and
the window to be written once, and the workflow is that home.

`KATA.md` carries the `sibling-composite-actions` and `kata-workflows` fences
part 03 already reseeded. `watchdog.yml` does not match
`.github/workflows/kata-*.yml`, so the `kata-workflows` topic is unchanged.

Verify: `bunx jidoka instructions` passes, `bunx jidoka invariants` passes, and
`rg 'unset it' KATA.md` returns nothing.

## Step 3: Confirm the brake end to end

Prove the two paths on the first scheduled window after the merge.

Modified: nothing.

This step runs **after** the pull request merges. GitHub serves
`workflow_dispatch` only from the default branch, so it is the one verification
in this plan that cannot run on its own head.

1. Dispatch the workflow with `dry-run: true`. The assess job reports four
   counts and a quiet or engage verdict. The engage job, when it runs, reports
   both killswitch scopes and writes nothing.
2. Read the assess run summary. It carries every count obtained, the
   killswitch's current value, and the verdict.
3. Confirm neither job checked the repository out and neither used an
   agent-running action.

Verify: both runs finish inside the 5-minute timeout, and
`gh variable list` shows `KATA_KILLSWITCH` unchanged.
