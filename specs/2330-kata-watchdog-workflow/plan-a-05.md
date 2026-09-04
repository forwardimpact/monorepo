# Plan 2330-a Part 05: The watchdog workflow

The scheduled workflow, its two jobs, its literal numbers, and the `KATA.md`
paragraph that names it.

Depends on: part 04, and part 06 step 4. Route: `staff-engineer`.

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
          # Declared required on the action. The engage step consumes none of
          # it, and it costs no second copy: the value comes from the one env
          # home above.
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          reason: ${{ needs.assess.outputs.reason }}
          dry-run: ${{ inputs.dry-run || 'false' }}
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Replace `<sha>` with the commit SHA part 06 step 4 tags as `v1`. The action
already carries the real `gear-release` default from part 03 step 1, so this
workflow passes none.

The assess job passes no `variable`, which the action declares optional. Both
jobs pass `threshold` and `window-hours`, which the action declares required.
Neither passes `gear-release` or `installer-sha256`: part 03 step 1 carries both
as real defaults. The action forwards to each subcommand only the options that
subcommand declares.

`vars[env.WATCHDOG_VARIABLE]` is this repository's only dynamic `vars` index.
If it does not evaluate, fall back to the literal `${{ vars.KATA_KILLSWITCH }}`
and accept the second occurrence of the name; the summary is the only consumer.

The workflow adds no `concurrency` group. Two engage jobs racing is harmless:
the second reads a truthy value and skips.

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

Prove the read path in CI and the write path by hand, before the brake matters.

Modified: nothing.

Steps 1 and 2 run after the pull request merges. GitHub serves
`workflow_dispatch` only from the default branch, so they are the one
verification in this plan that cannot run on its own head.

1. Dispatch the workflow. The assess job reports four counts, the killswitch's
   current value, and a verdict, inside the 5-minute timeout.
2. Confirm neither job checked the repository out and neither used an
   agent-running action.
3. Prove the write path outside the workflow, because the engage job is gated on
   a real breach and no dispatch can force one. An operator runs the CLI locally
   with the App token against a throwaway variable name, never the killswitch:

   ```sh
   gemba-watchdog engage --repo <owner>/<repo> --variable WATCHDOG_SMOKE \
     --reason "watchdog|smoke=1/1|$(date -u +%FT%TZ)" --window-hours 2
   ```

   It must exit 1, write the reason verbatim, and leave `KATA_KILLSWITCH`
   untouched. Re-running it must exit 0 and skip, because the effective value is
   now truthy. Delete `WATCHDOG_SMOKE` afterwards.

Verify: the dispatched run finishes green, `gh variable list` shows
`KATA_KILLSWITCH` unchanged throughout, and step 3 leaves no `WATCHDOG_SMOKE`
behind.
