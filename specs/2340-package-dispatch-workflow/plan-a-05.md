# Plan 2340-a Part 05: Acceptance run and the reference consumer

Both steps run after [part 03](plan-a-03.md) merges. Step 1 needs an HTTPS
endpoint whose request log a person can read, so pair with an operator for it.
Step 2 needs the rewritten template that part 03 lands.

## Step 1: Accept the packaged dispatch

Files modified: none.

Exercise both dispatch paths. They differ: on a `workflow_dispatch` the bridge
inputs carry values, and on an issue or PR event `inputs` is null, so the mode
expression falls to `facilitate` and the action's callback step skips.

1. **Bridge path.** Stand up any HTTPS endpoint whose request log you can read,
   or point `callback_url` at a deployed `ghbridge` or `msbridge` instance. Run
   `gh workflow run "Kata: Dispatch"` with a `prompt` and that `callback_url`.
2. **Event path.** Comment on an open issue, or add an `agent:` label to one,
   so the `if:` predicate fires a run with no dispatch inputs.

Verify: both runs show the cost table on their run summary while
`.github/workflows/kata-dispatch.yml` carries no cost step (success criterion
7). The bridge run's endpoint log shows exactly one terminal payload, which is
design-a.md § Test strategy's manual acceptance. The event run reaches the
facilitator, posts no callback, and pushes the wiki. Without a readable
endpoint, the cost half still verifies and the payload half stays unverified;
say so rather than claiming the criterion.

## Step 2: The reference consumer

Repository: `forwardimpact/bionova-apps-v2`. File modified:
`.github/workflows/agent-dispatch.yml`. Bring the repository into the session
with `add_repo`, then open a pull request against it, per
[references/CLAUDE.md § Keep a reference current](../../references/CLAUDE.md).

Read the file first. Build the replacement from
[`workflow-dispatch.md`](../../.claude/skills/kata-setup/references/workflow-dispatch.md)
as part 03 rewrote it, not from the consumer's shift workflow: the shift shape
carries none of the dispatch semantics. Pin
`forwardimpact/kata-agent@<sibling-v1.0.10-sha> # v1.0.10`.

The one step must carry every key below. A step that drops them still passes
criterion 10's `rg 'uses:'` check while running a default `run`-mode agent with
no bridge contract.

| Key                                                     | Value                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `app-id`, `app-private-key`, `anthropic-api-key`        | The consumer's existing secret names                              |
| `app-slug`                                              | The consumer's App slug. Omitting it takes `kata-agent`'s `kata-agent-team` default, which rewrites the bot git identity on every commit the run makes. |
| `killswitch`                                            | `${{ vars.KATA_KILLSWITCH }}`                                     |
| `mode`                                                  | `${{ inputs.discussion_id != '' && 'discuss' \|\| 'facilitate' }}` |
| `task-event`                                            | `${{ github.event_path }}`                                        |
| `lead-profile`, `agent-profiles`, `agent-model`, `lead-model`, `max-turns`, `timeout-minutes` | Carried over from its current `gemba-harness` step |
| `wiki`                                                  | `"true"` when its current workflow checks out and pushes the wiki, otherwise `"false"`. `gemba-harness` declares no such input, so read it from the bootstrap `token:` and the wiki-push step. |
| `bun-version`                                           | The version its current bootstrap step passes                     |
| `callback-url`, `correlation-id`, `discussion-id`, `resume-context`, `inbox-url` | Mapped from `inputs.*`                           |

Its `workflow_dispatch` block must declare the six bridge inputs the template
declares. Add any it lacks.

Keep, unchanged, everything spec.md § Excluded leaves in the workflow:

| Element                       | Why it stays                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| The `on:` block and the `if:` | The trigger surface and its predicate are the consumer's policy.  |
| Its `concurrency` group       | It measured `queue: max`. This change does not reconcile the two. |
| Its job `timeout-minutes`     | A composite action cannot declare it.                             |

Remove its seven steps, its `bun-version` comment, and its 64 KiB redirect
comment. Part 02 step 6 moved that comment's reasoning into `kata-agent`'s own
cost step, so it leaves this file without leaving the tree.

The consumer tracks the missing `bun-version` input as an open issue
(spec.md § What the bypass costs). Adding the input here closes it, and its
three other `kata-agent` workflows can take the input too. Note both on the
pull request.

`references/bionova-apps/` in this repository needs no edit. Its record names
`kata-setup` as a hard gate and never restates the workflow body.

Verify: in that repository, `rg 'uses:' .github/workflows/agent-dispatch.yml`
returns one line naming `forwardimpact/kata-agent@` (success criterion 10), the
step carries every key in the table above, and one dispatched run reaches the
facilitator.
