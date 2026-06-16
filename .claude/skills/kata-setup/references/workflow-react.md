# Workflow Template: Event-Driven React

Responds to PR comments, issue comments, new issues, and discussions. The
product-manager facilitates and routes to the best-suited agent. File name:
`kata-dispatch.yml`. Replace `{{AGENT_LIST}}` (all agents except product-manager
and improvement-coach), `{{MODEL}}`, and `{{FIT_EVAL_REF}}` (resolved at
generation time — see
[`workflow-agent.md` § Resolving action refs](workflow-agent.md#resolving-action-refs)).

The block below is the **self-hosted** variant. For the **hosted** control
plane (see [`SKILL.md`](../SKILL.md) `--hosted`), apply the hosted delta
under [§ Hosted variant](#hosted-variant) — no `KATA_APP_PRIVATE_KEY`.

## Template (Self-Hosted)

```yaml
name: "Agent: React"
on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  discussion:
    types: [created]
  discussion_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      prompt:
        description: "Ad-hoc prompt for the facilitator"
        required: true
        type: string
permissions:
  contents: write
jobs:
  kata:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      github.event_name == 'issues' ||
      github.event_name == 'issue_comment' ||
      (github.event_name == 'pull_request_review_comment' &&
       github.event.comment.in_reply_to_id != null) ||
      github.event_name == 'pull_request_review' ||
      github.event_name == 'discussion' ||
      github.event_name == 'discussion_comment'
    runs-on: ubuntu-latest
    steps:
      # Killswitch: fail fast when the KATA_KILLSWITCH variable holds a truthy
      # value, so an operator can halt every kata workflow from one place
      # without disabling each one. Keep it the first step so the run fails
      # before any token minting, checkout, or agent work.
      - name: Kata killswitch
        shell: bash
        env:
          KATA_KILLSWITCH: ${{ vars.KATA_KILLSWITCH }}
        run: |
          case "$(printf '%s' "${KATA_KILLSWITCH:-}" | tr '[:upper:]' '[:lower:]')" in
            ""|0|false|no|off) echo "Kata killswitch not engaged; proceeding." ;;
            *) echo "::error::KATA_KILLSWITCH engaged (value: ${KATA_KILLSWITCH}). Failing fast." >&2; exit 1 ;;
          esac
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
      - name: Compose task
        id: task
        env:
          EVENT: ${{ github.event_name }}
          DP: ${{ inputs.prompt }}
          PN: ${{ github.event.issue.number || github.event.pull_request.number }}
          IT: ${{ github.event.issue.title }}
          DNUM: ${{ github.event.discussion.number }}
          DNID: ${{ github.event.discussion.node_id }}
          DTIT: ${{ github.event.discussion.title }}
          DCAT: ${{ github.event.discussion.category.name }}
          IPR: ${{ github.event.issue.pull_request != null }}
          AU: ${{ github.event.comment.user.login || github.event.review.user.login || github.event.discussion.user.login || github.event.issue.user.login || github.actor }}
          URL: ${{ github.event.comment.html_url || github.event.review.html_url || github.event.discussion.html_url || github.event.issue.html_url || '' }}
        run: |
          set -euo pipefail
          t="pull_request"; n="${PN:-}"
          case "$EVENT" in
            issues) t="issue"; ctx="New issue \"$IT\" (#$n) by @$AU. $URL"; act="assess the issue." ;;
            discussion) t="discussion"; n="$DNUM"; ctx="New discussion \"$DTIT\" (#$n, $DCAT) by @$AU. $URL Node: $DNID."; act="assess. Reply via gh api graphql (addDiscussionComment)." ;;
            discussion_comment) t="discussion"; n="$DNUM"; ctx="Comment on \"$DTIT\" (#$n) by @$AU. $URL Node: $DNID."; act="assess. Reply via gh api graphql (addDiscussionComment, pass replyToId)." ;;
            workflow_dispatch) t=""; n="" ;;
            issue_comment) if [ "$IPR" = "true" ]; then ctx="Comment on PR #$n by @$AU. $URL"; act="assess."; else t="issue"; ctx="Comment on \"$IT\" (#$n) by @$AU. $URL"; act="assess."; fi ;;
            *) ctx="Comment on PR #$n by @$AU. $URL"; act="assess." ;;
          esac
          if [ "$EVENT" = "workflow_dispatch" ]; then prefix="$DP"; else prefix="$ctx As facilitator, route to the best-suited agent to $act"; fi
          task="$prefix
          Recursion guard: if the latest activity is already an agent response, stop."
          { echo "target-type=$t"; echo "target-number=$n"; echo "task<<EOF"; echo "$task"; echo "EOF"; } >> "$GITHUB_OUTPUT"
      - name: Assess and Act
        uses: forwardimpact/fit-eval@{{FIT_EVAL_REF}}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          mode: "facilitate"
          lead-profile: "product-manager"
          agent-profiles: "{{AGENT_LIST}}"
          agent-model: "{{MODEL}}"
          lead-model: "{{MODEL}}"
          task-text: ${{ steps.task.outputs.task }}
```

Uses `fit-eval` (not `kata-agent`) because the task text is
composed dynamically between checkout and eval. The `if:` filters
`pull_request_review_comment` to thread replies only. The recursion guard
prevents loops when agents respond to each other. The `fit-eval` ref is
SHA-pinned at generation time, never the mutable `v1` tag — pair it with
the Dependabot config from `SKILL.md` Step 2.

## Hosted Variant

This workflow mints its own App token via `actions/create-github-app-token`
rather than passing `app-private-key` to the action, so the hosted delta
differs from the agent workflow:

1. Add `id-token: write` to `permissions` (keep `contents: write`).
2. Replace the `Generate token` (`actions/create-github-app-token`) step
   with the OIDC mint step from
   [`workflow-agent.md` § Template (hosted)](workflow-agent.md).
3. Change the checkout `token:` and the `Assess and Act` step's `GH_TOKEN:`
   from `${{ steps.ci-app.outputs.token }}` to
   `${{ steps.mint.outputs.token }}`.

Requires the `FIT_OIDC_URL` repository variable.
