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
last, pushes the wiki when `wiki` is `"true"`, and POSTs the run's conclusion
to `callback-url` when a caller names one. The action enables `trace` by
default. Leave it enabled on a bridge path, because the callback reads the
trace to build its payload.

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
        description: "URL to POST the facilitator conclusion to (optional)"
        required: false
        type: string
      correlation_id:
        description: "Correlation ID returned in the callback payload (optional)"
        required: false
        type: string
      discussion_id:
        description: "Stable identifier for the threaded conversation (carried through traces)"
        required: false
        type: string
      resume_context:
        description: "Serialized prior state for a resumed recessed run (JSON string)"
        required: false
        type: string
      inbox_url:
        description: "Long-poll URL to inject messages into a live run (optional)"
        required: false
        type: string

permissions:
  contents: write

# Coalesce simultaneous events on one target so the recursion guard sees a
# stable thread. `cancel-in-progress: false` is load-bearing. Runs last 30+
# minutes, and a new label or comment mid-run must not cancel that work.
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
          # Facilitator sessions outlast the action's 200-turn / 45-minute
          # defaults. Raise both, as the shift template does.
          max-turns: "1500"
          timeout-minutes: "300"
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

Apply
[`workflow-shift.md` § Template (Hosted)](workflow-shift.md#template-hosted) to
the block above. Its three deltas are the whole hosted recipe, and it owns them.

Its third delta adds `installation-token`. Confirm the `kata-agent` release you
pin declares that input. A hosted dispatch that pins a release without it mints
no token and fails at run time.
