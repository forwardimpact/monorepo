# Plan 2360-a Part 01: Watchdog tick, window, threshold, and the sizing rule

Part A of [spec.md](spec.md): the monorepo watchdog ticks on its counted events
at 48 over 8 hours, the `kata-setup` template and the guide carry the same
shape, and every prose home states the delivered-gap rule.

Depends on: spec 2350 part 03 merged. Route: `staff-engineer`. One pull request.
It touches the watchdog surface, so it merges only on a trusted human's explicit
signal pinned to its head.

## Step 1: The monorepo watchdog

Tick on the counted events, bound the ticks, and move the numbers.

Modified: `.github/workflows/watchdog.yml` (whole file)

- Keep the pinned SHA. Its comment names the tag it carries, `v1.0.1`, even if
  plan 2350-a part 03 wrote `# v1.0.0`.
- Copy the `dry-run` description's line breaks from the file on `main`.

```yaml
name: "Watchdog"

# Repository CI, not a Kata surface. This workflow runs no agent, so it does
# not gate on KATA_KILLSWITCH. It must keep running after it engages the
# variable, and its name stays outside the kata-* glob so the "every kata-*
# workflow gates on the killswitch" contract stays true as written.
#
# GitHub delivers scheduled runs hours late under load, so the schedule is the
# fallback clock. The four counters' own events start a tick when activity
# happens. The schedule covers activity made with the runner's own token, which
# starts no workflow, and it records the latch value on a quiet repository.
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
  # The base context: the default branch's workflow file and secrets, and no
  # checkout. `pull_request` would run a branch's own copy of this file.
  pull_request_target:
    types: [opened]
    branches: ["main"]
  push:
    branches: ["main"]

permissions: {}

# One tick runs and one waits. A new event replaces the waiting tick. The
# running tick is never cancelled, so an engage write always completes.
concurrency:
  group: watchdog
  cancel-in-progress: false

# The threshold and the window each appear once, and both jobs read them from
# here. The variable name appears here and once more as the `vars` literal in
# the assess job.
env:
  WATCHDOG_THRESHOLD: "48"
  WATCHDOG_WINDOW_HOURS: "8"
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
        uses: forwardimpact/gemba-watchdog@437b84d56a5036d618ce35bcfbda4d03103d66e2 # v1.0.1
        with:
          mode: assess
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          # The literal, not `vars[env.WATCHDOG_VARIABLE]`: a dynamic index
          # that fails to resolve yields an empty string, which the summary
          # renders as a cleared latch. The name's second occurrence buys a
          # containment control that cannot go quietly wrong.
          killswitch-value: ${{ vars.KATA_KILLSWITCH }}
          # A literal, not `github.event.repository.default_branch`: the
          # schedule event's payload is not documented to carry one, and a
          # workflow_dispatch rehearsal always does, so a dispatch could
          # never detect the empty case before the schedule hit it.
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
        uses: forwardimpact/gemba-watchdog@437b84d56a5036d618ce35bcfbda4d03103d66e2 # v1.0.1
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

Verify: `rg -c '"48"|"8"|\*/5' .github/workflows/watchdog.yml` reports 3;
`git diff origin/main -- products/gemba/actions/gemba-watchdog/action.yml`
prints nothing, so the action's inputs stay required and default-free; the file
name is unchanged and carries no `killswitch:` input.

## Step 2: The watchdog template

Give every installation the same shape, with a hosted variant that measures and
fails red.

Modified: `.claude/skills/kata-setup/references/workflow-watchdog.md` (whole
file)

````markdown
# Workflow Template: Activity Watchdog

The watchdog counts default-branch commits, pull requests created, issues
created, and conversation comments created over one window. It engages
`KATA_KILLSWITCH` when any count reaches the threshold. File name:
`watchdog.yml`.

It ticks on a schedule and on the four counters' own events, because GitHub
delivers scheduled runs late under load. One tick runs and one waits. The name
stays outside the `Agent:` family, and the workflow never gates on the variable
it writes. The self-hosted block names the variable twice, in `env` and as the
`vars` literal, because a dynamic index that fails to resolve reads as a cleared
latch.

## Placeholders

| Placeholder                 | Resolve with                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `{{WATCHDOG_CRON}}`         | `*/5 * * * *`                                                     |
| `{{WATCHDOG_THRESHOLD}}`    | `48`                                                              |
| `{{WATCHDOG_WINDOW_HOURS}}` | `8`                                                               |
| `{{DEFAULT_BRANCH}}`        | `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` |
| `{{GEMBA_WATCHDOG_REF}}`    | Per [`action-refs.md`](action-refs.md)                            |

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
             echo "::error::Breach: $REASON. Engage needs the App key, so set KATA_KILLSWITCH by hand."
             exit 1
   ```
````

Verify, from the repository root:

```sh
awk '/^## Template \(Self-Hosted\)/{f=1} f&&/^```yaml/{y=1;next} y&&/^```/{exit} y' \
  .claude/skills/kata-setup/references/workflow-watchdog.md > /tmp/t.yml
grep -vE '^\s*#' .github/workflows/watchdog.yml | sed -E 's/ +# v[0-9.]+$//' > /tmp/w.yml
diff -B /tmp/t.yml /tmp/w.yml
```

The diff shows eight lines on each side and nothing else: the cron, the two
`branches:` lines, the two `env` numbers, the two `uses:` lines, and
`default-branch`.
Render the hosted variant by hand into `/tmp/h.yml` (the block with the three
changes applied); `rg -n 'app-id|app-private-key|KATA_APP|engage:' /tmp/h.yml`
prints nothing and `rg -c 'exit 1' /tmp/h.yml` reports 1.
`bunx jidoka instructions` passes with the file at 126 lines.

## Step 3: The guard-activity guide

Teach the delivered-gap rule with this repository's figures, and make the CI
wiring the template with example values.

Modified: `websites/gemba/docs/guard-activity/index.md`

| Location                             | Change                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| § The threshold and the window       | Replace the whole section body with the text below.                                                                                                                                                                          |
| § `assess`, command                  | `npx gemba-watchdog assess --threshold 48 --window-hours 8 \` then `--default-branch main`.                                                                                                                                |
| § `assess`, reason sample            | The reason sample below.                                                                                                                                                                                                     |
| § `engage`, command                  | `--reason "$REASON" --window-hours 8`.                                                                                                                                                                                       |
| § The dispatch gate, first paragraph | Replace the sentence that says the inputs "default to a budget below the latch threshold over the watchdog's window" with: "The action's inputs are the one home of the two numbers. The gate's window is shorter than the watchdog's, so the gate bounds a burst rate and the latch bounds sustained volume." Match by meaning if the merged wording differs from plan 2350-a part 03. |
| § The dispatch gate, calibration | Delete the two rows whose rule starts "Watchdog, 32 per counter". They replay a default this spec retires. The "Nothing" and "Gate" rows stay. |
| § CI wiring, prose before the block  | Keep the first paragraph. Add the paragraph below.                                                                                                                                                                           |
| § CI wiring, YAML block | The Step 2 template's self-hosted YAML with `{{WATCHDOG_CRON}}` as `*/5 * * * *` and `{{DEFAULT_BRANCH}}` as `main` inside their quotes, the two numbers as `48` and `8` inside theirs, `{{GEMBA_WATCHDOG_REF}}` as `v1`, and every `KATA_` name as `MY_`. |
| § CI wiring, after the block         | "Copy the workflow shape, but pin the action to a commit SHA that you reviewed, and write your default branch in its three places." The naming paragraph is unchanged.                                                     |

Reason sample, in § `assess` here and in Step 6:

```text
watchdog|issues=51/48|comments=63/48|2026-01-15T09:30:00.000Z
```

§ The threshold and the window:

```markdown
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

| Delivered gap between ticks, 34 gaps | Hours |
| ------------------------------------ | ----- |
| Shortest                             | 2.1   |
| Median                               | 4.0   |
| 90th percentile                      | 5.4   |
| Longest                              | 5.7   |

Every gap was longer than 2 hours, so a 2-hour window never saw a burst that
crossed the threshold and drained inside one gap. An 8-hour window is 1.4 times the
longest gap. On three of the four counters, the busiest legitimate work one
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
acts in-band, before a run holds a runner.
```

§ CI wiring, new paragraph:

```markdown
One tick runs and one waits. A new event replaces the waiting tick, and it can
replace a waiting manual dry run too, so dispatch that again. The pull-request
tick uses `pull_request_target`: it runs the default branch's workflow file with
that branch's secrets and checks nothing out. A `pull_request` trigger would run
a branch's own copy of the file.
```

Verify: `bunx fit-doc build --src=websites/gemba --out=dist` passes;
`rg -n -i 'run interval|tick interval|missed runs|ticks you accept|\*/15|15-minute|32 per counter|threshold 32|window-hours 2\b' websites/gemba/docs/guard-activity/index.md`
prints nothing; the guide's block matches the workflow:

```sh
awk '/^## CI wiring/{f=1} f&&/^```yaml/{y=1;next} y&&/^```/{exit} y' \
  websites/gemba/docs/guard-activity/index.md | sed 's/MY_/KATA_/g' > /tmp/g.yml
diff -B /tmp/g.yml /tmp/w.yml
```

The diff shows the two `uses:` lines only.

## Step 4: The action README

Drop the second copy of the workflow and state the sizing rule.

Modified: `products/gemba/actions/gemba-watchdog/README.md`

| Location                       | Change                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| § Purpose, the "documented once" sentence | "The counters, the threshold and window, the latch contract…" becomes "The counters, the worked sizing example, the latch contract…". |
| § Prerequisites, `assess` item | "…`secrets.GITHUB_TOKEN` with the job permissions below is enough." becomes "…`secrets.GITHUB_TOKEN` with read access to those three is enough." |
| § Usage                        | Delete the YAML block and the sentence before it. The section reads as below.                                                                       |
| § Containment residual, item 3 | "visible within one interval" becomes "visible at the next tick".                                                                                   |
| § Exit codes, last paragraph   | "A scheduled caller sees it every interval." becomes "A caller sees it on every tick."                                                              |

§ Usage:

```markdown
## Usage

Measurement and engagement are separate jobs, so the write credential never
appears on a quiet run. The workflow ticks on a schedule and on the four
counted events, with one tick running and one waiting. The CI wiring section of
[Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md)
carries the workflow to copy.

Size the window to the longest gap between the scheduled runs your repository
receives, because GitHub delivers them late under load. Size the threshold to
one window's legitimate work. The guide works through both with real figures.

Give the workflow a name outside the family your latch gates. The watchdog must
keep running after it engages, so it never gates on the variable it writes.
```

Verify:
`` rg -n '```yaml|\*/15|"32"|below is enough|interval' products/gemba/actions/gemba-watchdog/README.md ``
prints nothing.

## Step 5: The CLI help

State the sizing rule where an operator reads the option, and move the
examples.

Modified: `products/gemba/bin/gemba-watchdog.js` (three option descriptions
and the `examples` array)

| Option                  | New description                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `assess --threshold`    | "Breach threshold, one number for every counter. Size it to one window's legitimate work"        |
| `assess --window-hours` | "Window the counters cover, in hours. Size it to the longest gap between the scheduled runs"      |
| `engage --window-hours` | "Window the resume rule measures, in hours. Use the assess window"                                |

```js
  examples: [
    "gemba-watchdog assess --threshold 48 --window-hours 8 --default-branch main",
    "gemba-watchdog assess --threshold 48 --window-hours 8 --default-branch main --format json",
    'gemba-watchdog engage --variable MY_KILLSWITCH --reason "$REASON" --window-hours 8',
    "gemba-watchdog engage --variable MY_KILLSWITCH --reason watchdog --window-hours 8 --dry-run",
  ],
```

Verify:
`bun products/gemba/bin/gemba-watchdog.js --help | rg -c 'window-hours 8'`
reports 4, and `bun products/gemba/bin/gemba-watchdog.js assess --help` prints
"longest gap between the scheduled runs".

## Step 6: The `gemba-watchdog` skill

Move the examples and state the same rule.

Modified: `.claude/skills/gemba-watchdog/SKILL.md`

| Location                          | New                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When to Use, assess example       | `npx gemba-watchdog assess --threshold 48 --window-hours 8 --default-branch main`                                                                                                                                                                                                                                                  |
| When to Use, engage example       | `npx gemba-watchdog engage --variable MY_KILLSWITCH --reason "$REASON" --window-hours 8`                                                                                                                                                                                                                                           |
| The Reason Grammar, sample        | The Step 3 reason sample                                                                                                                                                                                                                                                                                                           |
| Rules, the threshold bullet       | Two bullets: "**Size the window to the longest gap between the scheduled runs the repository receives.** GitHub delays scheduled runs under load, so add margin." and "**Size the threshold to one window's legitimate work.** It must clear the largest legitimate output one window holds. The command ships no default for either number." |

Verify: `bunx jidoka instructions` passes and
`rg -n 'threshold 32|window-hours 2\b|/32' .claude/skills/gemba-watchdog/SKILL.md`
prints nothing.

## Step 7: `KATA.md`

Name the new window, threshold, and ticks in the team's own description.

Modified: `KATA.md` (the watchdog paragraph after **Killswitch**)

```markdown
This repository also runs a watchdog that engages the variable automatically.
`.github/workflows/watchdog.yml` counts default-branch commits, pull requests
created, issues created, and conversation comments created over an 8-hour
window. It runs on a five-minute schedule, and it also ticks when an issue
opens, a conversation comment lands, a pull request opens, or `main` receives a
push. GitHub delivers scheduled runs hours late under load, so the window covers
the longest gap between the scheduled runs this repository receives. Any counter
that reaches 48 engages the variable, and so does a counter the watchdog cannot
read or cannot cover. It skips two cases: the variable is already truthy, or a
human cleared it inside the window and the burst has not drained yet. A human
who clears it gets 8 quiet hours. The watchdog only sets the variable. It never
clears the variable. It does not gate on the variable either, because it must
keep running after it engages.
```

Verify: after `bun run check:fix`, the paragraph names `8-hour`, `48`, and the
four events, and `rg -n 'fixed window|fixed schedule' KATA.md` prints nothing.

## Step 8: Checks, criteria, and the follow-up issues

Run the checks and hand the out-of-scope findings to their owners.

Modified: nothing further. Created, unless an open issue already covers it:

- An issue labeled `agent:staff-engineer` that proposes an invariant to hold
  the three workflow copies in step, and the numbers `KATA.md` and the guide
  quote.
- An issue for each spec § Follow-up finding, labeled `agent:staff-engineer`:
  the hosted installation cannot engage (owner surface: the `gemba-watchdog`
  action inputs), and the killswitch gate reads absent and cleared the same
  (owner surface: the `kata-agent` killswitch step).

The pull request body cites each issue.

Verify: `bun run check`, `bun run test`, and `bunx jidoka invariants` pass, and
`rg -n -i --hidden 'run interval|tick interval|missed runs|runs you accept|ticks you accept' -g '!specs/**' -g '!wiki/**' -g '!.git/**'`
prints nothing. The `kata-workflows` topic in
`.jidoka/invariants/enumeration-drift.topics.yml` is unchanged.

## After merge

| Check                               | Evidence                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event ticks fire (criterion 2)      | Within a day, `gh run list --workflow Watchdog --json event --jq '[.[].event] \| unique'` lists `issue_comment` or `issues` beside `schedule`.                                                                                                |
| A flood stays bounded (criterion 3) | Run `gh workflow run Watchdog -f dry-run=true` three times within a few seconds. This starts no other workflow. `gh run list --workflow Watchdog --json status` shows at most one `in_progress` and one `pending` run, and the replaced run ends `cancelled`. |

Record the run URLs in the weekly log and on the pull request.

— Staff Engineer 🛠️
