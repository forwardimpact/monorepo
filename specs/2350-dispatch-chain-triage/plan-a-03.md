# Plan 2350-a Part 03: Watchdog tick, setup template, guides, and catalog

The rollout and prose half of [design-a.md](design-a.md): the tick tightens,
`kata-setup` emits the watchdog, the two guides document the gate and the
verdict, and every remaining home of "recursion guard" outside parts 01 and 04
changes.

Depends on: part 04 tier 3, for the merge only. Route: `technical-writer`. One
pull request. Writes under `.claude/skills/` go through
`echo … | bunx gemba-selfedit <path>` on the branch.

## Step 1: The monorepo watchdog ticks every five minutes

Modified: `.github/workflows/watchdog.yml`

```yaml
on:
  schedule:
    - cron: "*/5 * * * *"
```

The two `gemba-watchdog` pin comments read `# v1.0.0`, the tag the SHA carries,
as the nested pin in `kata-agent` does.

Verify: the file carries `*/5 * * * *`, `WATCHDOG_THRESHOLD: "32"`, and
`WATCHDOG_WINDOW_HOURS: "2"`.

## Step 2: The action README's usage block

Modified: `products/gemba/actions/gemba-watchdog/README.md`

The usage YAML's cron line becomes `- cron: "*/5 * * * *"`. Nothing else
changes.

Verify: `rg -n '\*/15' products/gemba/actions/gemba-watchdog/README.md` prints
nothing.

## Step 3: The guard-activity guide

Teach the tick, the pool, the gate, and the calibration. The verdict and the
actor line have one home, the coordinate-team guide (step 4).

Modified: `websites/gemba/docs/guard-activity/index.md`

| Location                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| § The threshold and the window             | Replace the two-sentence window paragraph with: "The window is the tick interval times the number of ticks you accept missing. A five-minute schedule with a 2-hour window holds 24 ticks. The watchdog queues on the same runner pool as the runs it measures, so a flood that holds the pool delays the tick that would stop it. The dispatch gate below acts in-band, before a run holds a runner."                                                                                                                                                                                                                                                                                                                                                                                                                               |
| § CI wiring                                | The cron line becomes `- cron: "*/5 * * * *"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| New § The dispatch gate, after § Fail safe | "The `kata-agent` action classifies every run an artifact event starts. After it mints its token it classifies the acting account as `human`, `self`, or `bot`: `self` when `sender.login`, with a `[bot]` suffix or an `app/` prefix stripped, equals the App slug the mint yielded. A `self` run measures the same four counters over the action's `dispatch-window-hours` against its `dispatch-budget`. A counter at or above the budget stands the run down before checkout: one summary line, exit zero, no latch. So does a measurement the run cannot complete. The budget self-releases as the window slides. Human and bot actors and runs with no artifact never enter the gate. The action's inputs are the one home of the two numbers; they default to a budget below the latch threshold over the watchdog's window." |
| § The dispatch gate, calibration           | "Each row replays one incident's recovered event timestamps against the rule it names. Escaped counts artifacts created before the rule engaged plus a 45-minute tail for sessions already in flight." Then the table below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| § The dispatch gate, closing sentence      | "The task the lead receives opens with the actor's class and login; a self-caused or bot-caused task asks the lead to stand down when the body hands no new work. [Coordinate an Agent Team](/docs/coordinate-team/#end-the-session) carries the line and the verdict."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

| Rule                                           | Engages     | Escaped: issues, PRs, comments |
| ---------------------------------------------- | ----------- | ------------------------------ |
| Nothing                                        | never       | 416, 142, about 2,300          |
| Watchdog, 32 per counter, 2 h, 15-minute tick  | 15:15Z tick | 111, 36, 444                   |
| Watchdog, 32 per counter, 2 h, 5-minute tick   | 15:05Z tick | 95, 34, 380                    |
| Gate, budget 24 per counter, 2 h, at run start | 15:01Z      | 95, 34, 370                    |

Verify: `bunx fit-doc build --src=websites/gemba --out=dist` passes, and
`rg -n 'seven|\*/15' websites/gemba/docs/guard-activity/index.md` prints
nothing.

## Step 4: The coordinate-team guide and the trace-analysis sample

Document the actor line and the verdict once, and show the overview's new key.

Modified: `websites/gemba/docs/coordinate-team/index.md`,
`websites/gemba/docs/prove-changes/trace-analysis/index.md`

| Location                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| § End the session, `Conclude`                                | "(`success`, `failure`, or `stand_down`)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| § End the session, `Adjourn`                                 | "(`adjourned`, `failed`, or `stand_down`)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| § End the session, new paragraph                             | "`stand_down` means the task asked for nothing. A `--task-event` task opens with an actor line when the caller sets `KATA_ACTOR_CLASS` and `KATA_ACTOR_LOGIN` in the environment: `Caused by: human (@alice).` A `self` or `bot` class adds one sentence that asks the lead to engage nobody unless the body hands new actionable work to a named agent, and to end with `stand_down` otherwise. The composer renders the class it is handed; the caller classifies. Only the lead reads the rule; participants carry no stand-down sentence. `gemba-trace overview` and `gemba-trace cost` report the verdict apart from `success` and `failure`." |
| § End the session, exit code sentence                        | "It is `0` when the lead concluded with `success` or `stand_down`, and `1` otherwise."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| § Run a facilitated session, after the task-source paragraph | New sentence: "A `--task-event` task can open with an actor line, which § End the session describes."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| § Verify, third bullet                                       | Unchanged; § End the session states the exit code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| trace-analysis § Orient with the overview, JSON sample       | The sample gains `"verdict": null` after `summary`, with one sentence: "`verdict` carries the lead's terminal verdict on the combined trace of a coordinated run. A split lane and a single-agent run read `null`."                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Verify: `bunx fit-doc build --src=websites/gemba --out=dist` passes.

## Step 5: The watchdog workflow template

Give every installation the brake.

Created: `.claude/skills/kata-setup/references/workflow-watchdog.md`
Modified: `.claude/skills/kata-setup/references/action-refs.md`

````markdown
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
latch. In hosted mode the engage job holds no App key: on a breach it fails at
its token mint, so the run is red and nothing is written.

## Placeholders

| Placeholder              | Resolve with                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{GEMBA_WATCHDOG_REF}}` | Per [`action-refs.md`](action-refs.md) |
| `{{DEFAULT_BRANCH}}`     | `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`                                                                             |

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
          only when the assess job reports a breach, so on a quiet repository a
          dispatch exercises the counters alone.
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
````

The block above is reflowed by this repository's formatter. Copy the `dry-run`
description's line breaks from `.github/workflows/watchdog.yml`, not from the
block.

In `action-refs.md`, add one row to the placeholder table:
`{{GEMBA_WATCHDOG_REF}}` resolves from `forwardimpact/gemba-watchdog`.

Verify: `diff` between the template's YAML and `.github/workflows/watchdog.yml`
shows comment lines and the three placeholder lines (two `uses:` and the
`default-branch`) only;
`rg -n GEMBA_WATCHDOG_REF .claude/skills/kata-setup/references/action-refs.md`
prints one row; `bunx jidoka instructions` and `bunx jidoka invariants` pass.

## Step 6: The setup skill

Emit the watchdog, verify it, and drop the guard wording. The line budget is
inclusive and the file sits one line under it; the edits net minus two lines
after `rumdl fmt` reflows them.

Modified: `.claude/skills/kata-setup/SKILL.md`

| Location                       | Old                                                                                                                                                                                                                                                                                                                                                                                                                                      | New                                                                                                                                                                                                                                                             | Lines                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| DO-CONFIRM, dispatch item      | "…The action composes the task, including the recursion guard."                                                                                                                                                                                                                                                                                                                                                                          | "…The action names the actor in the task and runs the dispatch gate before checkout."                                                                                                                                                                           | 3 → 3                           |
| DO-CONFIRM, killswitch item    | "Every generated workflow gates on the killswitch. Each passes `killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which runs the gate as its first internal step."                                                                                                                                                                                                                                                                 | "Every agent workflow passes `killswitch: ${{ vars.KATA_KILLSWITCH }}`. `watchdog.yml` does not, and it carries the template's threshold, window, and tick."                                                                                                    | 3 → 3                           |
| Step 1, question 1             | "…walk through `references/github-app.md`. If the App exists, ask for the App slug."                                                                                                                                                                                                                                                                                                                                                     | "…walk through `references/github-app.md`."                                                                                                                                                                                                                     | 3 → 2                           |
| Step 2, killswitch paragraph   | "Every template gates on the `KATA_KILLSWITCH` repository (or org) Actions variable. The run fails on a truthy value: anything other than empty, `0`, `false`, `no`, or `off`. Every generated workflow passes `killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which gates as its first internal step, before any token mint, checkout, or agent work. The switch starts unset, so it has no effect until an operator sets it." | "Every agent workflow passes `killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which fails the run on a truthy value (anything other than empty, `0`, `false`, `no`, or `off`) before any token mint, checkout, or agent work. The switch starts unset." | 6 → 4                           |
| Step 2, new paragraph after it | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | "Write `.github/workflows/watchdog.yml` from `references/workflow-watchdog.md` in both modes. The reference states what it does and how hosted mode differs."                                                                                                   | 0 → 3, with its blank separator |
| Step 2, hosted-block sentence  | "The other two references carry a self-hosted block plus a hosted delta, which `workflow-facilitate.md` heads `## Hosted Variant`."                                                                                                                                                                                                                                                                                                      | "The dispatch and facilitate references carry a self-hosted block plus a hosted delta, which `workflow-facilitate.md` heads `## Hosted Variant`."                                                                                                               | 2 → 2                           |
| Step 5, two killswitch bullets | "Emergency stop: set `KATA_KILLSWITCH` truthy. Write a falsy value to resume; deleting it is not clearing it" and "The App holds `Variables` read & write (repo) and read-only (org), so a watchdog engages the killswitch, and no `Secrets` grant"                                                                                                                                                                                      | "Emergency stop: set `KATA_KILLSWITCH` truthy; write a falsy value to resume. The watchdog engages it through the App's `Variables` grant"                                                                                                                      | 4 → 2                           |

Verify: `bun run check:fix` reflows the file; then `bunx jidoka instructions`
passes and `wc -l` reports 197 lines, and
`rg -n 'recursion guard|App slug' .claude/skills/kata-setup/SKILL.md` prints
nothing.

## Step 7: The dispatch template's prose

Modified: `.claude/skills/kata-setup/references/workflow-dispatch.md`

| Location                 | Old                                                                                                                   | New                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Intro, second paragraph  | "The action composes the task from context, routing, and the recursion guard. So untrusted fields never hit a shell." | "The action composes the task from the payload, opens it with the actor's class and login, and stands a self-caused run down when the repository is over its dispatch budget. Untrusted fields never hit a shell." |
| YAML concurrency comment | "# Coalesce simultaneous events on one target so the recursion guard sees a\n# stable thread."                        | "# Coalesce simultaneous events on one target so one facilitator sees a\n# stable thread."                                                                                                                         |

Verify: `bunx jidoka instructions` passes (the file stays under 128 lines).

## Step 8: The `libwatchdog` jobs block and the catalog

Modified: `libraries/libwatchdog/package.json`, `libraries/README.md`
(regenerated)

`competesWith` becomes:
`"a stand-down sentence inside an agent task; a spend cap on the LLM platform; a human who notices the sprawl"`.
Then run `bunx jidoka jtbd --fix`, which regenerates the catalog block in
`libraries/README.md`.

Verify: `bunx jidoka jtbd` passes and
`rg -n 'recursion guard' libraries/README.md libraries/libwatchdog` prints
nothing.

## Step 9: Repository checks

Modified: nothing further.

Verify: `bun run check`, `bun run test`, and `bunx jidoka invariants` pass, and
`rg -n --hidden 'recursion guard' -g '!specs/**' -g '!wiki/**' -g '!.git/**'`
prints only `libraries/libharness/test/prompts.test.js` (part 01) and
`.github/workflows/kata-dispatch.yml` (part 04) until those parts land.
