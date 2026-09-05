# Spec 2340: Package the dispatch workflow as a `kata-agent` consumer

**Classification:** product-aligned. The change lands on the published
`kata-agent` composite action under `products/kata/actions/` and on the
`kata-setup` skill that documents how a team wires it. The monorepo's own
`kata-dispatch.yml`, the `libharness` callback verb, and the reference
consumer's workflow follow as consumers of that surface
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team, the Little Hire in [JTBD.md](../../JTBD.md): onboard a Kata installation
that runs the Plan-Do-Study-Act loop without per-team prompt engineering. The
dispatch workflow is the one Kata surface that still asks each team to assemble
the run by hand.

## Problem

Kata ships four event surfaces as GitHub Actions workflows: shift, storyboard,
coaching, and dispatch. Three of them are one step. Each calls the published
`kata-agent` action. The action runs the killswitch first, mints the App token,
checks out the repository, bootstraps the environment, refreshes the wiki before
and after the run, pushes the wiki, and reports the run cost last. The consumer
passes inputs and gets every built-in.

Dispatch is the exception. It calls the lower-level `gemba-harness` action
directly and rebuilds the lifecycle around it as inline steps.

| Workflow          | Repository                            | Steps | Distinct actions the consumer pins | Lines |
| ----------------- | ------------------------------------- | ----- | ---------------------------------- | ----- |
| `kata-shift`      | monorepo                              | 1     | 1                                  | 54    |
| `kata-storyboard` | monorepo                              | 1     | 1                                  | 37    |
| `agent-shift`     | reference consumer (bionova-apps-v2)  | 1     | 1                                  | 52    |
| `kata-dispatch`   | monorepo                              | 9     | 5                                  | 240   |
| `agent-dispatch`  | reference consumer (bionova-apps-v2)  | 7     | 5                                  | 131   |

### Root cause

`kata-agent` accepts a task as `task-text` or `task-file`. It does not accept
`task-event`. The `gemba-harness` action it wraps does accept `task-event`, and
the harness composes the task from the native GitHub event payload. Dispatch
needs that composition, so it bypasses `kata-agent`. The `kata-setup` dispatch
reference states the reason in one sentence: the workflow uses `gemba-harness`
rather than `kata-agent` so it can pass `task-event`.

### What the bypass costs

| Cost                                   | Evidence                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-ins become hand copies.          | The monorepo dispatch and the reference consumer's dispatch each re-implement the killswitch, the token mint, the checkout, the bootstrap, the wiki push, and the cost report as inline steps. Neither refreshes the wiki.                                                                                                                       |
| Cost reporting depends on the copy.    | Every `kata-agent` run appends the cost table to its run summary because the action does it. A dispatch run appends it only where the consumer copied the step. The `kata-setup` dispatch template carries the cost report as a comment that points to another reference, not as a step.                                                          |
| The template is not complete.          | The same template carries the killswitch as a comment. A team that copies the template literally gets a dispatch workflow with no killswitch and no cost report. The template also pins `actions/create-github-app-token@v3` and `actions/checkout@v4` by mutable tag, which the skill's own READ-DO checklist forbids.                            |
| The skill carries exceptions.          | Two `kata-setup` DO-CONFIRM items and one Step 2 paragraph exist only to carve dispatch out of the rule that every workflow gates on the killswitch through the action.                                                                                                                                                                          |
| Fixes do not propagate.                | The reference consumer fixed three things in its own dispatch workflow: a Bun version passthrough to the bootstrap, a job timeout, and a seven-line comment that protects the cost step's `>>` redirect from a 64 KiB pipe truncation. A `kata-agent` consumer receives such fixes through one Dependabot SHA bump. A dispatch consumer receives them by reading another repository's diff. |
| Three dispatch workflows have diverged. | The monorepo's carries a token freshness stamp, a bridge callback, and an inbox URL. The reference consumer's carries a queue depth, a job timeout, and the Bun version. The template carries none of these.                                                                                                                                       |
| The token stamp reaches one surface.   | Every agent profile loads the auth-anomaly playbook, which reads `KATA_GH_TOKEN_STAMP`. Only the monorepo dispatch sets it. Shift, storyboard, and coaching mint their token inside `kata-agent`, where no stamp exists, so the playbook treats them as stampless surfaces.                                                                        |

## Proposal

Make `kata-agent` able to run a dispatch. Then every dispatch workflow becomes
one `kata-agent` step, and the setup template says so literally.

1. **`kata-agent` accepts an event.** The action gains a `task-event` input
   alongside `task-text` and `task-file`. It hands the event to the harness,
   which composes the task. The workflow does no prompt assembly, as today.
2. **`kata-agent` carries the bridge contract.** The action gains
   `callback-url`, `correlation-id`, and `inbox-url` inputs. The `discussion-id`
   and `resume-context` inputs already exist. When a caller sets `callback-url`,
   the action delivers the run's conclusion to it after the run. It delivers on
   success, on failure, and when the run produced no trace. The GitHub
   Discussions and Microsoft Teams bridges dispatch these inputs today, so a
   team that deploys a bridge gets the callback with no extra step.
3. **The no-trace case belongs to the callback verb.** When the run produced no
   trace, `gemba-harness callback` posts the failure placeholder itself. The
   action step is one command. No workflow and no action carries the placeholder
   as inline shell.
4. **`kata-agent` stamps the token it mints.** The stamp travels with the token
   into the agent run. Every `kata-agent` surface then carries the stamp the
   auth-anomaly playbook reads, not only dispatch.
5. **`kata-agent` forwards the Bun version.** The action gains a `bun-version`
   input that it hands to the bootstrap. The reference consumer keeps the knob
   it relies on today.
6. **The dispatch template is literal.** The `kata-setup` dispatch reference
   carries one complete, copy-ready workflow with one step. The cost report, the
   killswitch, and the wiki push are inside the action, so no comment points
   elsewhere for a step. The reference resolves one action ref, the same
   `{{KATA_AGENT_REF}}` every other template resolves. The "Inline steps"
   section and the three `gemba-*` ref placeholders leave the skill. The two
   DO-CONFIRM carve-outs and the Step 2 exception paragraph leave the skill.
7. **The monorepo dispatch is a thin wrapper.** `kata-dispatch.yml` keeps what a
   composite action cannot declare: the trigger surface, the `if:` predicate,
   the concurrency group, the permissions, the dispatch inputs, and the mode
   selection expression. Everything else moves into the action.
8. **The reference consumer adopts the template.** The `agent-dispatch.yml` in
   bionova-apps-v2 becomes one `kata-agent` step, the same shape as its shift,
   storyboard, and coaching workflows.

**Compatibility stance:** clean break. The `gemba-harness`, `gemba-bootstrap`,
and `gemba-wiki` actions keep their interfaces, because Gemba consumers call
them directly. The dispatch workflow, the dispatch template, and the "Inline
steps" recipe stop calling them. Old-path removal is a success criterion.

**Rollout constraint.** The monorepo pins the published sibling by SHA, and the
action source lives in the monorepo. So the sibling release that carries
`task-event` must exist before any workflow pins it. `.github/CLAUDE.md`
already states the rule: change and tag a sibling's interface before the
consumer.

## Scope

### Included

| Surface                                                        | Change                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products/kata/actions/kata-agent/action.yml`                  | New inputs `task-event`, `callback-url`, `correlation-id`, `inbox-url`, and `bun-version`. The token stamp after the mint. One callback step, gated on a non-empty `callback-url`, that runs on success and on failure.                 |
| `products/kata/actions/kata-agent/README.md`                   | Document the event mode, the bridge contract, the stamp, and the Bun version knob.                                                                                                                                                       |
| `libraries/libharness/` (`gemba-harness callback`)             | Tolerate an absent or empty trace path: post the failure placeholder and exit zero. A unit test covers the present-trace and absent-trace paths.                                                                                         |
| `.github/workflows/kata-dispatch.yml`                          | Thin wrapper: trigger surface, `if:`, concurrency, permissions, dispatch inputs, mode expression, one `kata-agent` step.                                                                                                                 |
| `.claude/skills/kata-setup/references/workflow-dispatch.md`    | One complete single-step template, with the self-hosted block and the hosted delta.                                                                                                                                                      |
| `.claude/skills/kata-setup/references/workflow-shift.md`       | Remove § Inline steps. Remove the `gemba-*` siblings from § Resolving action refs.                                                                                                                                                       |
| `.claude/skills/kata-setup/SKILL.md`                           | Remove the two dispatch carve-outs from the DO-CONFIRM checklist and the Step 2 exception paragraph. Step 2 resolves one placeholder.                                                                                                     |
| `.claude/agents/x-auth-anomaly.md`                             | State that every `kata-agent` surface carries the stamp.                                                                                                                                                                                 |
| `.github/CLAUDE.md`                                            | The `kata-agent` row names the event mode.                                                                                                                                                                                               |
| `references/bionova-apps/`                                     | The record names the `kata-setup` dispatch template as the authority for `agent-dispatch.yml`. It restates nothing.                                                                                                                      |
| bionova-apps-v2 `.github/workflows/agent-dispatch.yml`         | One `kata-agent` step, pinned to the release that carries `task-event`. Delivered in that repository after the sibling release.                                                                                                          |

### Excluded

| Item                                                            | Why                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The trigger surface and the `if:` predicate                     | Which events fire a run is a separate policy. This spec moves no trigger and changes no predicate.                                                                                                                                                                                     |
| The concurrency policy                                          | The monorepo runs `cancel-in-progress: false`. The reference consumer measured a change to `queue: max`. Both live in the workflow, where the packaging cannot reach. A separate change may reconcile them.                                                                            |
| Job-level `timeout-minutes`                                     | A composite action cannot set it. Each consumer picks its own value in the workflow.                                                                                                                                                                                                   |
| A hosted-mode `installation-token` input on `kata-agent`        | The hosted templates for shift, storyboard, and coaching already presume it, and `kata-agent` does not yet declare it. That gap predates this spec and spans every `kata-agent` workflow. The dispatch hosted variant becomes the same delta as the shift one and inherits the same dependency. |
| The `gemba-bootstrap` default Bun version                       | The reference consumer tracks the upstream bump. This spec forwards the knob instead.                                                                                                                                                                                                  |
| The `gemba-harness` action interface and the libharness task composer | Unchanged. `task-event` and the event templates already exist there.                                                                                                                                                                                                             |
| The bridge services `ghbridge` and `msbridge`                   | They dispatch the same `workflow_dispatch` inputs before and after.                                                                                                                                                                                                                    |
| A new `kata-dispatch` composite action                          | One input and one gated step do not justify an eighth sibling repository.                                                                                                                                                                                                              |
| A toggle for the wiki refresh steps                             | Dispatch gains the refresh every other `kata-agent` run has. No consumer asked to switch it off.                                                                                                                                                                                       |

## Success criteria

| #  | Claim                                                              | Verification                                                                                                                                                                                                                                                        |
| -- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `kata-agent` runs from an event.                                   | `action.yml` declares `task-event` and forwards it to the harness. `README.md` documents it. `rg 'task-event' products/kata/actions/kata-agent/` matches both files.                                                                                                |
| 2  | `kata-agent` carries the bridge contract.                          | `action.yml` declares `callback-url`, `correlation-id`, and `inbox-url`. One `always()` step delivers the callback, and it runs only when `callback-url` is non-empty.                                                                                              |
| 3  | The no-trace placeholder is a tested CLI path.                     | A `gemba-harness callback` unit test drives an absent trace path and asserts one POST with `verdict: failed` and a zero exit. `rg 'curl' .github/workflows/kata-dispatch.yml products/kata/actions/kata-agent/action.yml` returns nothing.                          |
| 4  | Every `kata-agent` run carries the token stamp.                    | `action.yml` computes `KATA_GH_TOKEN_STAMP` after the mint and passes it on the harness step env. `rg KATA_GH_TOKEN_STAMP .github/workflows/` returns nothing, because no workflow computes it.                                                                       |
| 5  | The Bun version knob survives.                                     | `action.yml` declares `bun-version` and forwards it to the bootstrap.                                                                                                                                                                                                |
| 6  | The monorepo dispatch is one step.                                 | `rg 'uses:' .github/workflows/kata-dispatch.yml` returns exactly one line, and it names `forwardimpact/kata-agent@`. `rg 'gemba-harness\|gemba-bootstrap\|gemba-wiki\|gemba-trace\|create-github-app-token\|actions/checkout' .github/workflows/kata-dispatch.yml` returns nothing. |
| 7  | Every dispatch run reports cost with no cost step in the workflow. | One `workflow_dispatch` run of `kata-dispatch.yml` after the repin shows the cost table on its run summary. Criterion 6 shows the workflow has no `gemba-trace cost` line.                                                                                             |
| 8  | The dispatch template is complete and literal.                     | The `workflow-dispatch.md` template block has exactly one `uses:` line, `forwardimpact/kata-agent@{{KATA_AGENT_REF}}`. No comment in the block points to another reference for a step. `rg '@v[0-9]' .claude/skills/kata-setup/references/workflow-dispatch.md` returns nothing. |
| 9  | The skill carries no dispatch carve-out.                           | `rg -i 'inline' .claude/skills/kata-setup/` returns nothing. `rg '\{\{GEMBA_' .claude/skills/kata-setup/` returns nothing.                                                                                                                                           |
| 10 | The reference consumer's dispatch is one step.                     | In bionova-apps-v2, `rg 'uses:' .github/workflows/agent-dispatch.yml` returns exactly one line, and it names `forwardimpact/kata-agent@`.                                                                                                                             |
| 11 | The rollout order holds.                                           | The `kata-agent` SHA pinned in `kata-dispatch.yml` is a tagged release on `forwardimpact/kata-agent` whose `action.yml` declares `task-event`.                                                                                                                        |
| 12 | Repository checks stay green.                                      | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. The `kata-workflows` and `sibling-composite-actions` enumerations are unchanged, because no workflow and no action is added or removed.                                                          |
