# Plan 2340-a Part 03: Wrapper, template, and instruction surfaces

The repository's own pins and the instruction layers that describe them. It
merges only after part 04 tier 3 tags `kata-agent`. Read that tag's SHA from
`main` and write it as `<tier-3-sha> # v1.0.10` wherever this part says so.

This part modifies nine files: four workflows, three `kata-setup` files,
`.claude/agents/x-auth-anomaly.md`, and `.github/CLAUDE.md`.

## Step 1: `kata-dispatch.yml` becomes one `kata-agent` step

Files modified: `.github/workflows/kata-dispatch.yml`.

Keep the whole file above `steps:` byte for byte: the `on:` block with its
`pull_request_review_comment` NOTE, the six `workflow_dispatch` inputs, the
`permissions` block, the `concurrency` block with its comments, and the job's
`if:` predicate with its label-scope, PR-close, and trigger-surface comments.
Add no job-level `timeout-minutes`. The file declares none today, and the run
limits ride the step.

Replace all nine steps with one:

```yaml
    steps:
      # kata-agent runs the killswitch first and reports run cost last. It
      # mints the token, stamps it, checks out, bootstraps, refreshes and
      # pushes the wiki, and delivers the callback when the caller names one.
      #
      # Select discuss mode when the caller supplies a discussion_id. That is
      # the bridge path, which resumes or starts a threaded conversation.
      # Otherwise run a one-shot facilitate.
      #
      # libharness composes the task (libraries/libharness/src/events/
      # github.js). This workflow hands the runner's native event JSON to the
      # action and assembles no prompt. The runner exports GITHUB_EVENT_NAME
      # automatically, so the composer picks the right template with no extra
      # wiring. Untrusted dispatch inputs (discussion_id, resume_context,
      # dispatch prompt) flow as `with:` inputs. The action env-wraps them
      # before they reach any shell, so this surface keeps the same
      # template-injection-safe contract.
      #
      # On issue and PR events `inputs` is null, so every bridge input is empty
      # and the action's callback step skips.
      - uses: forwardimpact/kata-agent@<tier-3-sha> # v1.0.10
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          killswitch: ${{ vars.KATA_KILLSWITCH }}
          mode: ${{ inputs.discussion_id != '' && 'discuss' || 'facilitate' }}
          task-event: ${{ github.event_path }}
          agent-profiles: release-engineer,product-manager,security-engineer,staff-engineer,technical-writer,improvement-coach
          max-turns: "1500"
          timeout-minutes: "300"
          callback-url: ${{ inputs.callback_url }}
          correlation-id: ${{ inputs.correlation_id }}
          discussion-id: ${{ inputs.discussion_id }}
          resume-context: ${{ inputs.resume_context }}
          inbox-url: ${{ inputs.inbox_url }}
```

Verify: `rg 'uses:' .github/workflows/kata-dispatch.yml` returns one line
naming `forwardimpact/kata-agent@`, and `rg -e gemba-harness -e
gemba-bootstrap -e gemba-wiki -e gemba-trace -e create-github-app-token -e
actions/checkout .github/workflows/kata-dispatch.yml` returns nothing (success
criterion 6). `rg curl .github/workflows/kata-dispatch.yml
products/kata/actions/kata-agent/action.yml` returns nothing, which completes
success criterion 3. `rg KATA_GH_TOKEN_STAMP .github/workflows/` returns
nothing, which completes success criterion 4.

## Step 2: Repin the other three `kata-agent` workflows

Files modified: `.github/workflows/kata-shift.yml`,
`.github/workflows/kata-storyboard.yml`,
`.github/workflows/kata-coaching.yml`.

Each file carries one `kata-agent` pin at
`ae8d86f64ae7a8edaba059d1314e97e4dc652d35 # v1.0.9`. Move all three to
`<tier-3-sha> # v1.0.10`. Change nothing else in these files. These pins
carry the token stamp to shift, storyboard, and coaching, which step 5's
playbook sentence then describes truthfully. See
[plan-a.md § Scope notes](plan-a.md#scope-notes-for-the-approver).

Verify: `rg 'kata-agent@' .github/workflows/` returns four lines at one SHA.

## Step 3: Rewrite the dispatch template

Files modified: `.claude/skills/kata-setup/references/workflow-dispatch.md`.

Replace the whole file with the body inside the fence below. Write the body
alone: the outer four-backtick fence marks the boundary and is not part of the
file. The template block is complete and literal, with one `uses:` line, no
comment that points to another reference for a step, and no mutable tag. It
resolves `{{AGENT_LIST}}`, `{{MODEL}}`, `{{WIKI}}`, and `{{KATA_AGENT_REF}}`.
Its hosted heading is `## Template (Hosted)`, which matches
`workflow-shift.md` and the block name `SKILL.md` Step 3 tells the generator
to emit.

````markdown
# Workflow Template: Event-Driven Dispatch

This workflow responds to issue and PR events, and to a bridge that dispatches
it. The product-manager facilitates and routes to the best-suited agent. File
name: `agent-dispatch.yml`. Replace `{{AGENT_LIST}}` (all agents except
product-manager and improvement-coach), `{{MODEL}}`, `{{WIKI}}`, and
`{{KATA_AGENT_REF}}`. Resolve the ref at generation time. See
[`workflow-shift.md` § Resolving action refs](workflow-shift.md#resolving-action-refs).

The workflow does **no prompt assembly**. It hands the runner's native event
payload to the action (`task-event: ${{ github.event_path }}`). The action
composes the task from context, routing, and the recursion guard. So untrusted
fields never hit a shell. `kata-agent` runs the killswitch first, reports cost
last, pushes the wiki, and POSTs the run's conclusion to `callback_url` when a
caller names one. Keep `trace` enabled on a bridge path, because the callback
reads the trace to build its payload.

## Template (Self-Hosted)

```yaml
name: "Agent: Dispatch"

on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]
  pull_request_target:
    types: [labeled, closed]
  # No `pull_request_review_comment` trigger: a review fires N comment events
  # plus one `pull_request_review.submitted`, which already carries every
  # inline comment; they share the per-target group below
  # (cancel-in-progress: false).
  pull_request_review:
    types: [submitted]
  workflow_dispatch:
    inputs:
      prompt:
        description: "Ad-hoc prompt for the facilitator"
        required: true
        type: string
      callback_url:
        description: "URL that receives the run's conclusion (optional)"
        required: false
        type: string
      correlation_id:
        description: "Correlation id echoed in the callback payload (optional)"
        required: false
        type: string
      discussion_id:
        description: "Stable id for a threaded conversation (bridge path)"
        required: false
        type: string
      resume_context:
        description: "Serialized prior state for a resumed run (JSON string)"
        required: false
        type: string
      inbox_url:
        description: "Long-poll URL that injects messages into a live run"
        required: false
        type: string

permissions:
  contents: write

# Coalesce simultaneous events on one target so the recursion guard sees a
# stable thread. cancel-in-progress: false is load-bearing — runs last 30+
# minutes and a new label or comment mid-run must not cancel that work.
concurrency:
  group: agent-dispatch-${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: false

jobs:
  kata:
    # Only react to labels carrying routing (`agent:*`) or approval
    # (`*:approved`) semantics; classification labels add no request. PR
    # `closed` only on merge.
    if: >-
      github.event_name == 'workflow_dispatch'
      || (github.event_name == 'issues' && (github.event.action == 'opened' || (github.event.action == 'labeled' && (startsWith(github.event.label.name, 'agent:') || endsWith(github.event.label.name, ':approved')))))
      || github.event_name == 'issue_comment'
      || (github.event_name == 'pull_request_target' && ((github.event.action == 'labeled' && (startsWith(github.event.label.name, 'agent:') || endsWith(github.event.label.name, ':approved'))) || (github.event.action == 'closed' && github.event.pull_request.merged == true)))
      || github.event_name == 'pull_request_review'
    runs-on: ubuntu-latest
    steps:
      - uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          killswitch: ${{ vars.KATA_KILLSWITCH }}
          # discuss resumes a thread; otherwise one-shot facilitate.
          mode: ${{ inputs.discussion_id != '' && 'discuss' || 'facilitate' }}
          task-event: ${{ github.event_path }}
          lead-profile: "product-manager"
          agent-profiles: "{{AGENT_LIST}}"
          agent-model: "{{MODEL}}"
          lead-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          callback-url: ${{ inputs.callback_url }}
          correlation-id: ${{ inputs.correlation_id }}
          discussion-id: ${{ inputs.discussion_id }}
          resume-context: ${{ inputs.resume_context }}
          inbox-url: ${{ inputs.inbox_url }}
```

Keep `if:` aligned with `on:`. On issue and PR events `inputs` is null, so
every bridge input is empty and the action's callback step skips. Set a job
`timeout-minutes` if your runs need a cap above the step's own.

## Template (Hosted)

The hosted delta equals the shift delta. Apply
[`workflow-shift.md` § Template (Hosted)](workflow-shift.md) verbatim: add
`id-token: write` to `permissions`, insert the OIDC mint step first, and on the
`kata-agent` step drop `app-id`/`app-private-key` and add
`installation-token: ${{ steps.mint.outputs.token }}`. Hosted needs a
`kata-agent` SHA that takes `installation-token`, and the `FIT_OIDC_URL`
repository variable.
````

Verify: the template block has one `uses:` line naming
`forwardimpact/kata-agent@{{KATA_AGENT_REF}}`, it declares the six
`workflow_dispatch` inputs, and `rg '@v[0-9]'
.claude/skills/kata-setup/references/workflow-dispatch.md` returns nothing
(success criterion 8).

## Step 4: Strip the dispatch exception from the skill

Files modified: `.claude/skills/kata-setup/references/workflow-shift.md`,
`.claude/skills/kata-setup/SKILL.md`.

| File                | Target                     | Change                                                                                                                                                                                                  |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-shift.md` | § Placeholders prose       | Drop `and add no inline steps` from the killswitch sentence. It ends at `killswitch: ${{ vars.KATA_KILLSWITCH }}`.                                                                                       |
| `workflow-shift.md` | § Inline steps             | Delete the whole section: heading, prose, and YAML block.                                                                                                                                                |
| `workflow-shift.md` | § Resolving Action Refs    | Drop the parenthetical that names `gemba-bootstrap`, `gemba-harness`, and `gemba-wiki` for `workflow-dispatch.md`. The sentence names `kata-agent` alone.                                               |
| `SKILL.md`          | DO-CONFIRM killswitch item | Becomes: "Every generated workflow gates on the killswitch. Each passes `killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which runs the gate as its first internal step."                       |
| `SKILL.md`          | Step 2, ref resolution     | Resolve one placeholder: "Resolve the `{{KATA_AGENT_REF}}` placeholder per [`workflow-shift.md` § Resolving action refs](references/workflow-shift.md#resolving-action-refs)."                          |
| `SKILL.md`          | Step 2, killswitch prose   | Replace "The `kata-agent` workflows (shift, storyboard, coaching) pass" with "Every generated workflow passes", because dispatch is now a `kata-agent` workflow too.                                    |
| `SKILL.md`          | Step 2, killswitch prose   | Delete the one sentence that begins "The harness-based dispatch workflow mints its own token". Keep the sentence after it about the switch starting unset.                                              |

Verify: `rg -i -e 'inline steps' -e 'harness-based' .claude/skills/kata-setup/`
returns nothing, and `rg '\{\{GEMBA_' .claude/skills/kata-setup/` returns
nothing (success criterion 9). `rg 'shift, storyboard, coaching'
.claude/skills/kata-setup/SKILL.md` returns nothing.

## Step 5: The playbook states which surfaces carry the stamp

Files modified: `.claude/agents/x-auth-anomaly.md`.

State a rule rather than an inventory. The playbook ships to installations this
repository never sees, and four `eval-*` workflows here call `gemba-harness`
directly with no stamp, so any list of stampless surfaces is wrong on arrival.

In the paragraph that introduces the stamp, add one sentence after the first:

    Every `kata-agent` surface carries it, because the action stamps the token
    it mints.

In § Stampless surfaces, add one sentence after the first:

    A surface that runs an agent without `kata-agent`, or outside GitHub
    Actions, has no stamp.

Verify: `rg 'kata-agent surface' .claude/agents/x-auth-anomaly.md` matches, the
file names no specific workflow, and `bunx jidoka instructions` passes.

## Step 6: The actions table names the event mode, within budget

Files modified: `.github/CLAUDE.md`.

The file sits at exactly 768 of its 768-word cap, so this edit must free at
least as many words as it adds. Make all three changes together.

1. The `kata-agent` row's Purpose cell becomes one physical line:
   `Kata run from text, file, or event (auth, stamp, checkout, bootstrap, harness, wiki, callback)`
2. Delete the sentence "`kata-agent` delegates to
   gemba-bootstrap/gemba-harness/gemba-wiki internally." The expanded cell now
   carries it.
3. Rewrite "Every workflow calls `gemba-bootstrap@v1` for the environment." as
   "Workflows reach the environment through `gemba-bootstrap@v1`." After this
   part no `kata-*` workflow calls it directly, so the original overstates.

These three land the file back at exactly 768 words, measured. Adding "Full"
to the cell, or keeping either sentence, puts it over.

Leave the `Action (`@v1`)` column untouched. That column is the
`sibling-composite-actions` enumeration source
([`.jidoka/invariants/enumeration-drift.topics.yml`](../../.jidoka/invariants/enumeration-drift.topics.yml)),
so a Purpose edit moves no fence.

Verify: `bunx jidoka instructions` passes, so the file is at or under 768
words. `bun run invariants` passes with the `sibling-composite-actions` and
`kata-workflows` fences unchanged.

## Step 7: Repository checks

Files modified: none.

Run `bun run check`, `bun run test`, and `bunx jidoka instructions`. The third
runs separately, because `bun run check` does not include it and this part
rewrites two skill reference files against the L6 length cap in JIDOKA.md.

Verify: all three exit zero (success criterion 12), and `git diff --stat
origin/main` lists exactly the nine files this part owns.
