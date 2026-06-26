# Workflow Template: Event-Driven Dispatch

Responds to issue and PR events. The product-manager facilitates and routes to
the best-suited agent. File name: `agent-dispatch.yml`. Replace `{{AGENT_LIST}}`
(all agents except product-manager and improvement-coach), `{{MODEL}}`, and the
`{{FIT_HARNESS_REF}}` / `{{FIT_WIKI_REF}}` action refs (resolved at generation
time — see
[`workflow-shift.md` § Resolving action refs](workflow-shift.md#resolving-action-refs)).

The workflow does **no prompt assembly**. It hands the runner's native event
payload to the action via `task-event: ${{ github.event_path }}`; the action
composes the task — context, routing instruction, and recursion guard — from the
event, so untrusted event fields never touch a shell here.

The block below is **self-hosted**. For the **hosted** control plane (see
[`SKILL.md`](../SKILL.md) `--hosted`), apply the delta under
[§ Hosted variant](#hosted-variant) — no `KATA_APP_PRIVATE_KEY`.

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
  # plus one `pull_request_review.submitted` at once. They share the per-target
  # group below; with cancel-in-progress: false the racing pending runs cancel
  # each other. The `submitted` payload already carries every inline comment.
  pull_request_review:
    types: [submitted]
  workflow_dispatch:
    inputs:
      prompt:
        description: "Ad-hoc prompt for the facilitator"
        required: true
        type: string
      discussion_id:
        description: "Stable id for a threaded conversation (bridge path)"
        required: false
        type: string

permissions:
  contents: write

# Coalesce simultaneous events on one target so the recursion guard sees a stable
# thread. cancel-in-progress: false is load-bearing — runs last 30+ minutes and a
# new label or comment mid-run must not cancel that work.
concurrency:
  group: agent-dispatch-${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: false

jobs:
  kata:
    # Only react to labels carrying routing (`agent:*`) or approval (`*:approved`)
    # semantics; classification labels add no request. PR `closed` only on merge.
    if: >-
      github.event_name == 'workflow_dispatch'
      || (github.event_name == 'issues' && (github.event.action == 'opened' || (github.event.action == 'labeled' && (startsWith(github.event.label.name, 'agent:') || endsWith(github.event.label.name, ':approved')))))
      || github.event_name == 'issue_comment'
      || (github.event_name == 'pull_request_target' && ((github.event.action == 'labeled' && (startsWith(github.event.label.name, 'agent:') || endsWith(github.event.label.name, ':approved'))) || (github.event.action == 'closed' && github.event.pull_request.merged == true)))
      || github.event_name == 'pull_request_review'
    runs-on: ubuntu-latest
    steps:
      # First step: copy the `Kata killswitch` step verbatim from workflow-shift.md.
      - name: Generate token
        id: ci-app
        uses: actions/create-github-app-token@v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ steps.ci-app.outputs.token }}
      - name: Assess and Act
        id: assess
        uses: forwardimpact/fit-harness@{{FIT_HARNESS_REF}}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          # discuss resumes a thread; otherwise one-shot facilitate.
          mode: ${{ inputs.discussion_id != '' && 'discuss' || 'facilitate' }}
          task-event: ${{ github.event_path }}
          lead-profile: "product-manager"
          agent-profiles: "{{AGENT_LIST}}"
          agent-model: "{{MODEL}}"
          lead-model: "{{MODEL}}"
          discussion-id: ${{ inputs.discussion_id }}
      # Copy the `Report run cost` step from workflow-shift.md (read trace-file
      # from `steps.assess`).
      # fit-harness does not push wiki itself, so push memory with a fresh token.
      # Drop this step when wiki is disabled.
      - name: Push wiki changes
        if: always()
        uses: forwardimpact/fit-wiki@{{FIT_WIKI_REF}}
        with:
          command: push
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Uses `fit-harness` (not `kata-agent`) so the workflow can pass `task-event` and
select `mode` per event. The `if:` must stay aligned with the `on:` block. The
recursion guard lives in the action's task composition, not here. The `fit-harness`
and `fit-wiki` refs are SHA-pinned at generation time — pair them with the
Dependabot config from `SKILL.md` Step 2.

## Hosted Variant

This workflow mints its own App token, so the hosted delta differs from the shift
workflow:

1. Add `id-token: write` to `permissions` (keep `contents: write`).
2. Replace the `Generate token` step with the OIDC mint step from
   [`workflow-shift.md` § Template (hosted)](workflow-shift.md).
3. Change the checkout `token:` and the `Assess and Act` `GH_TOKEN:` from
   `${{ steps.ci-app.outputs.token }}` to `${{ steps.mint.outputs.token }}`.

`Push wiki changes` keeps minting from the App secrets, so it is unchanged.
Requires the `FIT_OIDC_URL` repository variable.
