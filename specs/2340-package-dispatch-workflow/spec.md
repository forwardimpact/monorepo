# Spec 2340: Package the dispatch workflow as a `kata-agent` consumer

**Classification:** product-aligned. The change lands on the published
`kata-agent` action under `products/kata/actions/` and on the `kata-setup`
skill that documents it
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team, the Little Hire in [JTBD.md](../../JTBD.md): onboard a Kata installation
that runs the Plan-Do-Study-Act loop without per-team prompt engineering. The
dispatch workflow is the one Kata surface that still asks each team to assemble
the run by hand.

## Problem

Kata ships four workflows: shift, storyboard, coaching, and dispatch. Three of
them are one step. Each calls the published `kata-agent` action. The action runs
the killswitch first and mints the App token. It checks out the repository and
bootstraps the environment. It refreshes the wiki before and after the run,
pushes the wiki, and reports the run cost last. The consumer passes inputs and
gets every built-in.

Dispatch is the exception. It calls the lower-level `gemba-harness` action
directly and rebuilds the lifecycle around it as workflow steps.

| Workflow           | Repository                           | Steps | Distinct actions the consumer pins | Lines |
| ------------------ | ------------------------------------ | ----- | ---------------------------------- | ----- |
| `kata-shift`       | monorepo                             | 1     | 1                                  | 54    |
| `kata-storyboard`  | monorepo                             | 1     | 1                                  | 37    |
| `kata-coaching`    | monorepo                             | 1     | 1                                  | 38    |
| `agent-shift`      | reference consumer (bionova-apps-v2) | 1     | 1                                  | 52    |
| `agent-storyboard` | reference consumer (bionova-apps-v2) | 1     | 1                                  | 43    |
| `agent-coaching`   | reference consumer (bionova-apps-v2) | 1     | 1                                  | 46    |
| `kata-dispatch`    | monorepo                             | 9     | 5                                  | 240   |
| `agent-dispatch`   | reference consumer (bionova-apps-v2) | 7     | 5                                  | 131   |

### Root cause

`kata-agent` accepts a task as `task-text` or `task-file`. It does not accept
`task-event`. The `gemba-harness` action it wraps does accept `task-event`, and
the harness composes the task from the native GitHub event payload. Dispatch
needs that composition, so it bypasses `kata-agent`. The `kata-setup` dispatch
reference gives two reasons for the bypass: the workflow can pass `task-event`,
and it can select `mode` per event. `kata-agent` already declares a `mode`
input, so only the first reason still holds.

### What the bypass costs

| Cost                                    | Evidence                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-ins become copies.                | The monorepo dispatch and the reference consumer's dispatch each carry the token mint, the checkout, the bootstrap, and the wiki push as their own steps of the published actions. Each carries the killswitch and the cost report as inline shell. Neither refreshes the wiki.                    |
| Cost reporting depends on the copy.     | Every `kata-agent` run appends the cost table to its run summary because the action does it. A dispatch run appends it only where the consumer copied the step. The `kata-setup` dispatch template carries the cost report as a comment that points to another reference. It carries no cost step. |
| The template is not complete.           | The same template carries the killswitch as a comment. A team that copies the template literally gets a dispatch workflow with no killswitch and no cost report. The template pins `actions/create-github-app-token@v3` and `actions/checkout@v4` by mutable tag. The skill's own READ-DO checklist forbids mutable tags. |
| The skill carries an exception.         | One `kata-setup` DO-CONFIRM sentence and one Step 2 sentence exist only to exempt dispatch from the rule that every workflow gates on the killswitch through the action.                                                                                                                            |
| A protective fix stays local.           | The reference consumer added a seven-line comment to its dispatch workflow. The comment protects the cost step's `>>` redirect from a 64 KiB pipe truncation. Inside `kata-agent` the same step is written once, and a Dependabot SHA bump carries every fix to every consumer.                     |
| An input needs a private step.          | The reference consumer passes its Bun version to the bootstrap step inside its dispatch workflow. Its three `kata-agent` workflows cannot, because the action exposes no such input. The consumer tracks that gap as an open issue.                                                                 |
| Three dispatch workflows have diverged. | The monorepo's carries a token freshness stamp, a bridge callback, and an inbox URL. The reference consumer's carries a queue depth, a job timeout, and the Bun version. The template carries none of these.                                                                                        |
| The token stamp reaches one surface.    | Every agent profile loads the auth-anomaly playbook, which reads `KATA_GH_TOKEN_STAMP`. Only the monorepo dispatch sets it. Shift, storyboard, and coaching mint their token inside `kata-agent`, where no stamp exists, so the playbook treats them as stampless surfaces.                          |

## Proposal

Make `kata-agent` able to run a dispatch. Then every dispatch workflow becomes
one `kata-agent` step, and the setup template says so literally.

1. **`kata-agent` accepts an event.** The action gains a `task-event` input
   alongside `task-text` and `task-file`. It hands the event to the harness,
   which composes the task. The workflow does no prompt assembly, as today.
2. **`kata-agent` carries the bridge contract.** The action gains
   `callback-url`, `correlation-id`, and `inbox-url` inputs. The
   `discussion-id` and `resume-context` inputs already exist. The run reads the
   three new values during a `discuss` session, as the monorepo dispatch
   provides them today. After the run the action delivers the run's conclusion
   to `callback-url`. It delivers on success, on failure, and when the run
   produced no trace. The GitHub Discussions and Microsoft Teams bridges
   dispatch these inputs today. The dispatch template declares the six
   `workflow_dispatch` inputs the bridges send: `prompt`, `callback_url`,
   `correlation_id`, `discussion_id`, `resume_context`, and `inbox_url`. A team
   that deploys a bridge then gets the callback with no extra step.
3. **The no-trace case belongs to the callback verb.** When the run produced no
   trace, `gemba-harness callback` posts the failure placeholder itself. No
   workflow and no action carries the placeholder as inline shell.
4. **`kata-agent` stamps the token it mints.** The stamp travels with the token
   into the agent run. Every `kata-agent` surface then carries the stamp the
   auth-anomaly playbook reads.
5. **`kata-agent` forwards the Bun version.** The action gains a `bun-version`
   input that it hands to the bootstrap. The reference consumer keeps the input
   it relies on today.
6. **The dispatch template is literal.** The `kata-setup` dispatch reference
   carries one complete, copy-ready workflow with one step. The cost report, the
   killswitch, and the wiki push are inside the action, so no comment points
   elsewhere for a step. The reference resolves one action ref, the same
   `{{KATA_AGENT_REF}}` every other template resolves. The "Inline steps"
   recipe, the three `gemba-*` ref placeholders, and the two dispatch exception
   sentences leave the skill.
7. **The monorepo dispatch is a thin wrapper.** `kata-dispatch.yml` keeps what a
   composite action cannot declare: the trigger surface, the `if:` predicate,
   the concurrency group, the permissions, the job timeout, and the dispatch
   inputs. It keeps the mode selection and the step inputs: profiles, models,
   turn limits, and secrets. The lifecycle moves into the action.
8. **The reference consumer adopts the template.** The `agent-dispatch.yml` in
   bionova-apps-v2 becomes one `kata-agent` step, the same shape as its shift,
   storyboard, and coaching workflows.

**Compatibility stance:** clean break. The `gemba-harness`, `gemba-bootstrap`,
and `gemba-wiki` actions keep their interfaces, because Gemba consumers call
them directly. `gemba-bootstrap` gains one semantic: an empty `bun-version`
selects its default, and a caller that passes a version sees no change. The
dispatch workflow, the dispatch template, and the "Inline steps" recipe stop
calling them. Old-path removal is a success criterion.

**Accepted regression.** The hosted dispatch variant mints its own token in the
workflow today. After this change it is one `kata-agent` step, so it depends on
the `installation-token` input that the hosted shift, storyboard, and coaching
templates already presume and that `kata-agent` does not yet declare. Every
hosted `kata-agent` workflow then waits on the same follow-up, named in
§ Excluded.

**Rollout constraint.** Three sibling releases stand between the source change
and the repin. The `libharness` callback change ships in a `gear` release.
`gemba-bootstrap` repins that gear release and cuts its own release.
`kata-agent` repins that bootstrap release, gains its inputs, and cuts its
release. Only then may a workflow pin the `kata-agent` SHA. `.github/CLAUDE.md`
states the rule: change and tag a sibling's interface before the consumer.

## Scope

### Included

| Surface                                                     | Change                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products/kata/actions/kata-agent/action.yml`               | New inputs `task-event`, `callback-url`, `correlation-id`, `inbox-url`, and `bun-version`. The token stamp. Delivery of the callback after the run, on success and on failure, when `callback-url` is set.                      |
| `products/kata/actions/kata-agent/README.md`                | Document the event mode, the bridge contract, the stamp, and the Bun version input.                                                                                                                                              |
| `libraries/libharness/` (`gemba-harness callback`)          | `--trace-file` becomes optional. An absent or empty trace path posts the failure placeholder and exits zero. The existing callback test gains the absent-trace path and drops the required-flag assertion.                       |
| `products/gemba/actions/gemba-bootstrap/action.yml`         | An empty `bun-version` selects the pinned default, so a wrapper can forward the input verbatim. The default literal keeps one home.                                                                                                                             |
| `.github/workflows/kata-dispatch.yml`                       | Thin wrapper: trigger surface, `if:`, concurrency, permissions, dispatch inputs, mode expression, one `kata-agent` step.                                                                                                        |
| `.claude/skills/kata-setup/references/workflow-dispatch.md` | One complete single-step template that declares the six bridge `workflow_dispatch` inputs, with the self-hosted block and the hosted delta.                                                                                     |
| `.claude/skills/kata-setup/references/workflow-shift.md`    | Remove § Inline steps. Remove the `gemba-*` siblings from § Resolving action refs.                                                                                                                                              |
| `.claude/skills/kata-setup/SKILL.md`                        | Remove the dispatch exception sentence from the killswitch DO-CONFIRM item and from the Step 2 killswitch paragraph. Step 2 resolves one placeholder.                                                                            |
| `.claude/agents/x-auth-anomaly.md`                          | State that every `kata-agent` surface carries the stamp.                                                                                                                                                                        |
| `.github/CLAUDE.md`                                         | The `kata-agent` row names the event mode.                                                                                                                                                                                      |
| bionova-apps-v2 `.github/workflows/agent-dispatch.yml`      | One `kata-agent` step, pinned to the release that carries `task-event`. The consumer repository lands it after the sibling release.                                                                                             |

### Excluded

| Item                                                                  | Why                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The trigger surface and the `if:` predicate                           | Which events fire a run is a separate policy. This spec moves no trigger and changes no predicate.                                                                                                                                                                                            |
| The concurrency policy                                                | The monorepo runs `cancel-in-progress: false`. The reference consumer measured a change to `queue: max`. Both live in the workflow, where the packaging cannot reach. A separate change may reconcile them.                                                                                   |
| Job-level `timeout-minutes`                                           | A composite action cannot set it. Each consumer picks its own value in the workflow.                                                                                                                                                                                                          |
| A hosted-mode `installation-token` input on `kata-agent`              | The hosted templates already presume the input, and the wiki steps inside `kata-agent` mint from the App key that hosted mode does not hold. Hosted `kata-agent` support is one change across the action and the wiki action. It is its own spec, and § Accepted regression names the cost.  |
| The `gemba-bootstrap` default Bun version                             | The reference consumer tracks the upstream bump. This spec forwards the input instead and does not change the literal.                                                                                                                                                                       |
| The `gemba-harness` action interface and the libharness task composer | Both stay as they are. `task-event` and the event templates already exist there.                                                                                                                                                                                                              |
| The bridge services `ghbridge` and `msbridge`                         | They dispatch the same `workflow_dispatch` inputs before and after.                                                                                                                                                                                                                           |
| `references/bionova-apps/`                                            | The record already names `kata-setup` as a hard gate it never restates. It needs no change.                                                                                                                                                                                                   |
| A new `kata-dispatch` composite action                                | One input and one gated step do not justify an eighth sibling repository.                                                                                                                                                                                                                     |
| The `kata-interview` action                                           | It mints its own token and carries its own lifecycle copy. It stays stampless after this change. Folding it onto `kata-agent` is its own change.                                                                                                                                             |
| A toggle for the wiki refresh steps                                   | Dispatch gains the two storyboard refreshes every other `kata-agent` run has, one issue listing each. The wiki push already runs on every dispatch. No consumer asked to switch the refresh off.                                                                                              |

## Success criteria

Criteria 1 to 5, 8, 9, and 12 verify in the implementation pull request.
Criteria 6, 7, 10, and 11 verify after the sibling releases and the repin.

| #  | Claim                                                              | Verification                                                                                                                                                                                                                                                                                                         |
| -- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `kata-agent` runs from an event.                                   | `rg 'task-event' products/kata/actions/kata-agent/` matches `action.yml` and `README.md`.                                                                                                                                                                                                                            |
| 2  | `kata-agent` carries the bridge contract.                          | `rg -e 'callback-url' -e 'correlation-id' -e 'inbox-url' products/kata/actions/kata-agent/action.yml` matches all three, and the callback delivery runs on success and on failure only when `callback-url` is set.                                                                                                  |
| 3  | The no-trace placeholder is a tested CLI path.                     | The `libharness` callback test drives an absent trace path and asserts one POST with `verdict: failed` and a zero exit, and `rg curl .github/workflows/kata-dispatch.yml products/kata/actions/kata-agent/action.yml` returns nothing.                                                                                |
| 4  | Every `kata-agent` run exposes the token stamp to the agent.       | `rg KATA_GH_TOKEN_STAMP products/kata/actions/kata-agent/action.yml` matches, and `rg KATA_GH_TOKEN_STAMP .github/workflows/` returns nothing.                                                                                                                                                                        |
| 5  | The Bun version input survives.                                     | `rg 'bun-version' products/kata/actions/kata-agent/action.yml` matches an input and its forwarding.                                                                                                                                                                                                                   |
| 6  | The monorepo dispatch is one step.                                 | `rg 'uses:' .github/workflows/kata-dispatch.yml` returns one line that names `forwardimpact/kata-agent@`, and `rg -e gemba-harness -e gemba-bootstrap -e gemba-wiki -e gemba-trace -e create-github-app-token -e actions/checkout .github/workflows/kata-dispatch.yml` returns nothing.                              |
| 7  | Every dispatch run reports cost with no cost step in the workflow. | The run summary of one `workflow_dispatch` run of `kata-dispatch.yml` shows the cost table, and criterion 6 holds.                                                                                                                                                                                                    |
| 8  | The dispatch template is complete and literal.                     | The `workflow-dispatch.md` template block has one `uses:` line, `forwardimpact/kata-agent@{{KATA_AGENT_REF}}`, declares the six bridge `workflow_dispatch` inputs, and `rg '@v[0-9]' .claude/skills/kata-setup/references/workflow-dispatch.md` returns nothing.                                                      |
| 9  | The skill carries no dispatch exception.                           | `rg -i -e 'inline steps' -e 'harness-based' .claude/skills/kata-setup/` returns nothing, and `rg '\{\{GEMBA_' .claude/skills/kata-setup/` returns nothing.                                                                                                                                                            |
| 10 | The reference consumer's dispatch is one step.                     | In bionova-apps-v2, `rg 'uses:' .github/workflows/agent-dispatch.yml` returns one line that names `forwardimpact/kata-agent@`, verified in that repository's pull request.                                                                                                                                            |
| 11 | The rollout order holds.                                           | `gh api repos/forwardimpact/kata-agent/tags` lists a release tag at the SHA `kata-dispatch.yml` pins, and `action.yml` at that SHA declares `task-event`.                                                                                                                                                             |
| 12 | Repository checks stay green.                                      | `bun run check` and `bun run test` pass with the `kata-workflows` and `sibling-composite-actions` enumerations unchanged.                                                                                                                                                                                             |
