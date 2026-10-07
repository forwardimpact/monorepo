# Workflow Template: Agent Shift

One workflow (`agent-shift.yml`) runs the whole roster. The matrix is the
roster, and `max-parallel: 1` serializes it. Resolve every placeholder from
[`parameters-agents.md`](parameters-agents.md), and `{{KATA_AGENT_REF}}` per
[`action-refs.md`](action-refs.md). `{{AGENT_MATRIX}}` is one
`- { name: <agent> }` line per roster agent, and `{{SHIFT_CRONS}}` is three
`- cron:` lines from `schedules.md`. `kata-agent` runs the killswitch gate first
and reports cost last. Emit the self-hosted or hosted block per the
control-plane step in `SKILL.md`.

## Template (Self-Hosted)

```yaml
name: "Agent: Shift"

on:
  schedule:
    {{SHIFT_CRONS}}
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

permissions:
  contents: write

jobs:
  agent:
    name: ${{ matrix.agent.name }}
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1
      fail-fast: false
      matrix:
        agent:
          {{AGENT_MATRIX}}
    steps:
      # kata-agent runs the killswitch first and reports run cost last.
      - uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}
        id: agent
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          killswitch: ${{ vars.KATA_KILLSWITCH }}
          agent-profile: ${{ matrix.agent.name }}
          agent-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          case: ${{ matrix.agent.name }} # disambiguates the per-cell trace artifact
          task-text: >-
            Assess the current state of your domain and act on the
            highest-priority finding.
          task-amend: ${{ inputs.task-amend }}
```

## Template (Hosted)

Change the self-hosted template in three ways (the **canonical** hosted recipe):

1. Add `id-token: write` to `permissions`. Keep `contents: write`.
2. Insert this OIDC mint step as the **first** step, before `kata-agent`:

   ```yaml
         - name: Mint installation token via Forward Impact OIDC
           id: mint
           env:
             OIDC_REQUEST_TOKEN: ${{ env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }}
             OIDC_REQUEST_URL: ${{ env.ACTIONS_ID_TOKEN_REQUEST_URL }}
             OIDC_HOST: ${{ vars.FIT_OIDC_URL }}
           run: |
             set -euo pipefail
             sep=$(printf '%s' "$OIDC_REQUEST_URL" | grep -q '?' && printf '&' || printf '?')
             ACT_TOKEN=$(curl -sf -H "Authorization: bearer $OIDC_REQUEST_TOKEN" \
               "${OIDC_REQUEST_URL}${sep}audience=fit-ghserver" | jq -r .value)
             RESP=$(curl -sf -X POST -H "Authorization: bearer $ACT_TOKEN" "${OIDC_HOST}/token")
             INSTALL_TOKEN=$(printf '%s' "$RESP" | jq -r .installation_token)
             printf '::add-mask::%s\n' "$INSTALL_TOKEN"
             printf 'token=%s\n' "$INSTALL_TOKEN" >> "$GITHUB_OUTPUT"
   ```

3. In the `kata-agent` step, drop `app-id`/`app-private-key`. Add
   `installation-token: ${{ steps.mint.outputs.token }}`. Keep `killswitch:`.

`FIT_OIDC_URL` is the hosted OIDC service URL, a repository **variable** that is
masked in logs. Hosted needs a `kata-agent` SHA that takes `installation-token`.
