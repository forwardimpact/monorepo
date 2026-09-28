# Plan 2350-a Part 02: The gate in `kata-agent` and its test workflow

The action half of [design-a.md](design-a.md): the classify step, the nested
measurement, the verdict step, the actor hand-off, the inputs with one home, the
`app-slug` removal, and the workflow that proves the three outcomes.

Depends on: nothing. Route: `staff-engineer`.

## Step 1: The actor rule

One file holds the rule. The classify step runs it. The test workflow runs it
against six fixtures.

Created: `products/kata/actions/kata-agent/classify-actor.sh`

```bash
#!/usr/bin/env bash
# Classify the acting account of a GitHub event payload against the App slug
# the run's own token mint yielded. Prints two GITHUB_OUTPUT lines, or nothing
# when the payload names no issue and no pull request. The rule has one home:
# this file. The task composer renders the class it is handed.
#
# Usage: classify-actor.sh <event-path> <app-slug>
set -euo pipefail
event="$1"
slug="$2"
# No artifact: a manual or bridge dispatch. The gate does not apply.
if ! jq -e '.issue // .pull_request' "$event" > /dev/null; then
  exit 0
fi
login=$(jq -r '.sender.login // ""' "$event")
type=$(jq -r '.sender.type // ""' "$event")
[ -n "$login" ] || { echo "::error::payload carries no sender.login" >&2; exit 2; }
# GitHub spells one App three ways: slug[bot], slug, app/slug.
normalized="${login%\[bot\]}"
normalized="${normalized#app/}"
if [ -n "$slug" ] && [ "$normalized" = "$slug" ]; then
  class=self
elif [ "$type" = "User" ]; then
  class=human
else
  class=bot
fi
printf 'actor-class=%s\nactor-login=%s\n' "$class" "$login"
```

Verify: step 4's `classify` job is green on the pull request.

## Step 2: The gate in `action.yml`

Add the two inputs and four outputs, drop `app-slug`, insert three steps between
the stamp and the checkout, hand the actor to the harness, and gate every later
step on `stood-down`.

Modified: `products/kata/actions/kata-agent/action.yml`

Inputs. Remove `app-slug`. Add after `killswitch`:

```yaml
# --- Dispatch gate ---
# The one home of the budget and the window. No workflow, template, or CLI
# flag carries these values.
dispatch-budget:
  description: >
    Per-counter budget a self-caused run measures against before checkout. A
    counter at or above it stands the run down.
  required: false
  default: "24"
dispatch-window-hours:
  description: The window the gate's four counters cover, in hours.
  required: false
  default: "2"
```

Outputs. Add:

```yaml
actor-class:
  description:
    "`human`, `self`, or `bot`; empty when the run has no artifact event"
  value: ${{ steps.actor.outputs.actor-class }}
actor-login:
  description: The acting account's login as the payload spells it
  value: ${{ steps.actor.outputs.actor-login }}
dispatch-verdict:
  description:
    The measurement's verdict on a self-caused run; empty when none ran
  value: ${{ steps.budget.outputs.verdict }}
stood-down:
  description: "`true` when a self-caused run stood down at the gate"
  value: ${{ steps.gate.outputs.stood-down }}
```

Steps. Insert after `Stamp installation token`:

```yaml
# --- The dispatch gate ---
# Three steps before checkout; the README describes them. The measurement
# step continues on error so a self-caused run whose measurement never ran
# stands down green, with the summary line, instead of reddening the run.
- name: Classify the actor
  id: actor
  if: inputs.task-event != ''
  shell: bash
  env:
    TASK_EVENT: ${{ inputs.task-event }}
    APP_SLUG: ${{ steps.ci-app.outputs.app-slug }}
  run: |
    bash "$GITHUB_ACTION_PATH/classify-actor.sh" "$TASK_EVENT" "$APP_SLUG" >> "$GITHUB_OUTPUT"

# This pin moves by hand. Dependabot does not scan this directory.
- name: Measure the dispatch budget
  id: budget
  if: steps.actor.outputs.actor-class == 'self'
  continue-on-error: true
  uses: forwardimpact/gemba-watchdog@21c6268a8326e9ba52e82ac463b30d8995610fd3 # v1.0.0
  with:
    mode: assess
    threshold: ${{ inputs.dispatch-budget }}
    window-hours: ${{ inputs.dispatch-window-hours }}
    token: ${{ steps.ci-app.outputs.token }}

- name: Stand down on a breach
  id: gate
  if: steps.actor.outputs.actor-class == 'self'
  shell: bash
  env:
    VERDICT: ${{ steps.budget.outputs.verdict }}
  run: |
    set -euo pipefail
    if [ "$VERDICT" = "quiet" ]; then
      echo "stood-down=false" >> "$GITHUB_OUTPUT"
    else
      echo "stood down: self-caused run, verdict ${VERDICT:-unmeasured}" >> "$GITHUB_STEP_SUMMARY"
      echo "stood-down=true" >> "$GITHUB_OUTPUT"
    fi
```

Later steps. Each `if:` below is the whole condition.

| Step                    | `if:`                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| `actions/checkout`      | `steps.gate.outputs.stood-down != 'true'`                                      |
| `gemba-bootstrap`       | `steps.gate.outputs.stood-down != 'true'`                                      |
| Refresh wiki (pre-run)  | `inputs.wiki == 'true' && steps.gate.outputs.stood-down != 'true'`             |
| Assess and Act          | `steps.gate.outputs.stood-down != 'true'`                                      |
| Deliver callback        | unchanged                                                                      |
| Refresh wiki (post-run) | `always() && inputs.wiki == 'true' && steps.gate.outputs.stood-down != 'true'` |
| Push wiki changes       | `always() && inputs.wiki == 'true' && steps.gate.outputs.stood-down != 'true'` |
| Report run cost         | `always() && steps.gate.outputs.stood-down != 'true'`                          |

Two further edits:

- The `gemba-bootstrap` step reads
  `app-slug: ${{ steps.ci-app.outputs.app-slug }}`.
- The `Assess and Act` step env gains, beside `GH_TOKEN`:

  ```yaml
  # The actor class and login the classify step derived. The composer
  # renders them as the task's first line and classifies nothing.
  KATA_ACTOR_CLASS: ${{ steps.actor.outputs.actor-class }}
  KATA_ACTOR_LOGIN: ${{ steps.actor.outputs.actor-login }}
  ```

The description block at the top names the gate between the stamp and the
checkout.

Verify: `rg -n 'app-slug' products/kata/actions/kata-agent/action.yml` prints
the classify step's `APP_SLUG` line and the bootstrap line only, and step 4's
workflow is green.

## Step 3: The README and the conventions row

Document the inputs, the outputs, and the lifecycle. The guides document the
rule, the calibration, and the actor line.

Modified: `products/kata/actions/kata-agent/README.md`, `.github/CLAUDE.md`

| Location                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README intro paragraph                  | Add: "On an artifact event it classifies the acting account before checkout, stands a self-caused run down when the repository is over its dispatch budget, and names the actor in the task."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| README › Inputs › Authentication        | Drop the `app-slug` row. Add a sentence under the table: "The git identity takes the App slug from the token mint."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| README › Inputs › Dispatch gate         | New table: `dispatch-budget` (No, `24`, per-counter budget a self-caused run measures against) and `dispatch-window-hours` (No, `2`, the window the four counters cover).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| README › Outputs                        | New section with `trace-file`, `trace-dir`, `case`, `actor-class`, `actor-login`, `dispatch-verdict`, and `stood-down`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| README › Event mode › The dispatch gate | New subsection, action-specific only. The step order: killswitch, mint, stamp, classify, measure, verdict, then checkout and the rest. A stood-down run writes one summary line with the raw verdict, skips every later step but the callback, exits zero, and costs the killswitch step, one mint, one binary download, and four REST reads; a measurement that never ran stands down the same way with `unmeasured`. The nested `gemba-watchdog` pin moves by hand. The classification rule and the calibration are documented in [Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/#the-dispatch-gate); the actor line and the verdict in [Coordinate an Agent Team](https://www.gemba.team/docs/coordinate-team/#end-the-session). |
| `.github/CLAUDE.md` third-party table   | The `kata-agent` row reads "Kata run from text, file, or event (auth, stamp, gate, checkout, bootstrap, harness, wiki, callback)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Verify: `bunx jidoka instructions` passes (`.github/CLAUDE.md` gains one word
against its 768 cap), and the README inputs table matches `action.yml` input for
input.

## Step 4: The test workflow

Prove the six classifications and the three gate outcomes from the checkout,
with no release.

Created: `.github/workflows/check-kata-agent.yml`

```yaml
name: "Check: Kata Agent"

# Exercises the dispatch gate of the kata-agent action. The classify job runs
# the actor rule against six senders and needs no secret. The gate job runs
# the action from this checkout under the repository's App, so its `if:`
# admits same-repository, non-Dependabot pull requests and manual dispatch.
# Two of its three cases reach the harness step for a few read-only turns. No
# job passes `killswitch`, because this repository's variable may be engaged.
on:
  pull_request:
    branches: [main]
    paths:
      - "products/kata/actions/kata-agent/**"
      - ".github/workflows/check-kata-agent.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: check-kata-agent-${{ github.ref }}
  cancel-in-progress: true

jobs:
  classify:
    name: "Classify ${{ matrix.login }}"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - { login: "acme-team[bot]", type: Bot, expected: self }
          - { login: "acme-team", type: Bot, expected: self }
          - { login: "app/acme-team", type: Bot, expected: self }
          - { login: "alice", type: User, expected: human }
          - { login: "dependabot[bot]", type: Bot, expected: bot }
          - { login: "github-actions[bot]", type: Bot, expected: bot }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - name: Classify a sender on an artifact event
        env:
          LOGIN: ${{ matrix.login }}
          TYPE: ${{ matrix.type }}
          EXPECTED: ${{ matrix.expected }}
        run: |
          jq -n --arg l "$LOGIN" --arg t "$TYPE" '{issue:{number:1},sender:{login:$l,type:$t}}' > event.json
          out=$(bash products/kata/actions/kata-agent/classify-actor.sh event.json acme-team)
          test "$out" = "actor-class=${EXPECTED}"$'\n'"actor-login=${LOGIN}"
      - name: A payload with no artifact yields no class
        if: strategy.job-index == 0
        run: |
          jq -n '{sender:{login:"alice",type:"User"}}' > none.json
          test -z "$(bash products/kata/actions/kata-agent/classify-actor.sh none.json acme-team)"

  # The fixture is a hybrid. Under `pull_request` the composer renders the
  # labeled template from `action`, with empty fields on the `none` case;
  # under `workflow_dispatch` it composes no template and runs on
  # `inputs.prompt` alone. Either event name composes. The `self` case takes
  # its login from the mint at run time.
  gate:
    name: "Gate: ${{ matrix.case }}"
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.pull_request.head.repo.full_name == github.repository &&
      github.actor != 'dependabot[bot]')
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - {
              case: self,
              login: self,
              type: Bot,
              artifact: "true",
              expect_class: self,
              expect_verdict: engage,
              expect_stood_down: "true",
            }
          - {
              case: human,
              login: alice,
              type: User,
              artifact: "true",
              expect_class: human,
              expect_verdict: "",
              expect_stood_down: "",
            }
          - {
              case: none,
              login: alice,
              type: User,
              artifact: "false",
              expect_class: "",
              expect_verdict: "",
              expect_stood_down: "",
            }
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - id: app
        if: matrix.case == 'self'
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
      - name: Write the fixture
        env:
          LOGIN: ${{ matrix.login }}
          TYPE: ${{ matrix.type }}
          ARTIFACT: ${{ matrix.artifact }}
          SLUG: ${{ steps.app.outputs.app-slug }}
        run: |
          if [ "$LOGIN" = self ]; then test -n "$SLUG"; LOGIN="${SLUG}[bot]"; fi
          jq -n --arg l "$LOGIN" --arg t "$TYPE" --argjson a "$ARTIFACT" \
            '{action:"labeled",label:{name:"agent:staff-engineer"},inputs:{prompt:"Reply with one word."},sender:{login:$l,type:$t}} + (if $a then {pull_request:{number:1,title:"fixture",html_url:"https://example.invalid/pull/1"}} else {} end)' \
            > "$RUNNER_TEMP/event.json"
      # The session's exit code is not the test. A short run that ends on a
      # tool call exits 1; the assertions read the action's outputs.
      - id: agent
        continue-on-error: true
        uses: ./products/kata/actions/kata-agent
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          task-event: ${{ runner.temp }}/event.json
          mode: run
          agent-profile: technical-writer
          allowed-tools: "Read"
          max-turns: "3"
          wiki: "false"
          case: ${{ matrix.case }}
          # A budget of one over a year: any repository with one commit
          # breaches, so a self actor stands down before checkout.
          dispatch-budget: "1"
          dispatch-window-hours: "8760"
      - name: The outputs match the case
        env:
          EXPECT_CLASS: ${{ matrix.expect_class }}
          EXPECT_VERDICT: ${{ matrix.expect_verdict }}
          EXPECT_STOOD_DOWN: ${{ matrix.expect_stood_down }}
          ACTOR: ${{ steps.agent.outputs.actor-class }}
          VERDICT: ${{ steps.agent.outputs.dispatch-verdict }}
          STOOD_DOWN: ${{ steps.agent.outputs.stood-down }}
          TRACE_FILE: ${{ steps.agent.outputs.trace-file }}
        run: |
          test "$ACTOR" = "$EXPECT_CLASS"
          test "$VERDICT" = "$EXPECT_VERDICT"
          test "$STOOD_DOWN" = "$EXPECT_STOOD_DOWN"
          if [ "$EXPECT_STOOD_DOWN" = true ]; then test -z "$TRACE_FILE"; else test -n "$TRACE_FILE"; fi
      # The caller's checkout is shallow; the action's is `fetch-depth: 0`.
      # The bootstrap is the only step that installs gemba-harness.
      - name: Stood down before checkout and bootstrap
        if: matrix.case == 'self'
        run: |
          test "$(git rev-parse --is-shallow-repository)" = "true"
          if command -v gemba-harness; then exit 1; fi
```

Verify: the `classify` matrix and the three `gate` cases are green on the pull
request, and the `self` case's summary carries `stood down:` with `engage`.

## Step 5: Repository checks

Modified: nothing further.

Verify: `bun run check`, `bun run test`, and `bunx jidoka invariants` pass, and
`rg -n --hidden 'dispatch-budget|dispatch-window-hours' -g '!specs/**' -g '!wiki/**' -g '!.git/**'`
prints lines from `kata-agent/action.yml`, `kata-agent/README.md`, and
`check-kata-agent.yml` only, with `24` and `2` in the first two. After part 03
merges, the guard-activity guide joins that list.

## Step 6: File the `kata-interview` follow-up

Open one issue so the owning agent picks the sibling input up. Do not edit the
spec.

Created: a GitHub issue labeled `needs-spec` only, titled "kata-interview: take
the App slug from the token mint". The body names the input, its default, and
the `kata-agent` change this part's pull request lands.

Verify: the issue exists and the pull request body links it.
