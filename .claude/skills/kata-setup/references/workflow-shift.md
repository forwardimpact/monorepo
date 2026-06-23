# Workflow Template: Agent Shift

One workflow runs the whole roster. The matrix is the roster — add or remove an
agent by editing one line; `max-parallel: 1` serializes them. File: `agent-shift.yml`.

## Placeholders

| Placeholder          | Example                                             |
| -------------------- | --------------------------------------------------- |
| `{{SHIFT_CRONS}}`    | Three `- cron:` lines from `schedules.md`           |
| `{{AGENT_MATRIX}}`   | One `- { name: <agent> }` line per selected agent   |
| `{{MODEL}}`          | `claude-opus-4-8[1m]`                               |
| `{{WIKI}}`           | `"true"` or `"false"`                               |
| `{{KATA_AGENT_REF}}` | `b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0` |

The `Kata killswitch` and `Report run cost` steps are the canonical copies the
other files reference. Emit the self-hosted block (default) or the hosted block per the operator's choice (`SKILL.md` `--hosted`).

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
      - name: Kata killswitch
        shell: bash
        env:
          KATA_KILLSWITCH: ${{ vars.KATA_KILLSWITCH }}
        run: |
          case "$(printf '%s' "${KATA_KILLSWITCH:-}" | tr '[:upper:]' '[:lower:]')" in
            ""|0|false|no|off) echo "Killswitch not engaged; proceeding." ;;
            *) echo "::error::KATA_KILLSWITCH engaged. Failing fast." >&2; exit 1 ;;
          esac
      - uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}
        id: agent
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          agent-profile: ${{ matrix.agent.name }}
          agent-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          case: ${{ matrix.agent.name }} # disambiguates the per-cell trace artifact
          task-text: >-
            Assess the current state of your domain and act on the
            highest-priority finding.
          task-amend: ${{ inputs.task-amend }}
      - name: Report run cost
        if: always()
        shell: bash
        env:
          TRACE_FILE: ${{ steps.agent.outputs.trace-file }}
        run: |
          if [ -n "${TRACE_FILE:-}" ] && [ -f "$TRACE_FILE" ]; then
            npx fit-trace cost "$TRACE_FILE" --markdown >> "$GITHUB_STEP_SUMMARY"
          else
            echo "No trace file produced — cost not reported."
          fi
```

## Template (Hosted)

The self-hosted template with three changes (the **canonical** hosted recipe others reference):

1. Add `id-token: write` to `permissions` (keep `contents: write`).
2. Insert this OIDC mint step directly **after** the `Kata killswitch` step:

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

3. In the `kata-agent` step, drop `app-id`/`app-private-key` and add
   `installation-token: ${{ steps.mint.outputs.token }}`.

`FIT_OIDC_URL` is a repository **variable** (the `services/oidc` URL); `::add-mask::` keeps the token out of logs.

## Resolving Action Refs

Pin published actions to an immutable SHA, never the mutable `v1` tag. List tags
with `gh api repos/forwardimpact/kata-agent/tags` (`.../fit-eval/tags`,
`.../fit-wiki/tags` for the refs in `workflow-dispatch.md`), pick the highest
`vX.Y.Z`, and emit `<full-40-char-sha> # <tag>`. If resolution fails, stop and ask;
pair the pins with the `github-actions` Dependabot config (`SKILL.md` Step 2).

## Notes

- **`{{AGENT_MATRIX}}`** lists agents in producer → reviewer → shipper order;
  **`{{SHIFT_CRONS}}`** are shift-start times. Set `wiki: "false"` to skip wiki
  sync; omit `agent-model:` for the default.
- **Hosted** needs the `FIT_OIDC_URL` variable and a `kata-agent` SHA accepting
  `installation-token`.
