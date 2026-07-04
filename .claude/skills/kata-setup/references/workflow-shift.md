# Workflow Template: Agent Shift

One workflow (`agent-shift.yml`) runs the whole roster. The matrix is the
roster: add or remove an agent by editing one matrix line, and `max-parallel: 1`
serializes them.

## Placeholders

| Placeholder          | Example                                             |
| -------------------- | --------------------------------------------------- |
| `{{SHIFT_CRONS}}`    | Three `- cron:` lines from `schedules.md`           |
| `{{AGENT_MATRIX}}`   | One `- { name: <agent> }` line per selected agent   |
| `{{MODEL}}`          | `claude-opus-4-8[1m]`                               |
| `{{WIKI}}`           | `"true"` or `"false"`                               |
| `{{KATA_AGENT_REF}}` | `b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0` |

List `{{AGENT_MATRIX}}` in producer → reviewer → shipper order;
`{{SHIFT_CRONS}}` are shift-start times. Set `wiki: "false"` to skip sync, omit
`agent-model:` for the default. `kata-agent` runs the killswitch gate first and
reports cost last. These workflows pass
`killswitch: ${{ vars.KATA_KILLSWITCH }}` and add no inline steps. Emit the
self-hosted (default) or hosted block per `--hosted` (`SKILL.md`).

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

The self-hosted template with three changes (the **canonical** hosted recipe):

1. Add `id-token: write` to `permissions`, keeping `contents: write`.
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

3. In the `kata-agent` step, drop `app-id`/`app-private-key`, add
   `installation-token: ${{ steps.mint.outputs.token }}`; keep `killswitch:`.

`FIT_OIDC_URL` is the `services/oidc` URL as a repository **variable**, masked
in logs. Hosted needs a `kata-agent` SHA accepting `installation-token`.

## Inline steps

For the harness-based dispatch workflow (`workflow-dispatch.md`), which does not
delegate to `kata-agent`: copy the killswitch below as its first step, and add a
final `if: always()` step running `fit-trace cost "$TRACE_FILE" --markdown >>
"$GITHUB_STEP_SUMMARY"` (`TRACE_FILE` from the trace step's `trace-file`; a
missing trace is tolerated, no guard).

```yaml
      - name: Kata killswitch
        shell: bash
        env:
          KATA_KILLSWITCH: ${{ vars.KATA_KILLSWITCH }}
        run: |
          case "$(printf '%s' "${KATA_KILLSWITCH:-}" | tr '[:upper:]' '[:lower:]')" in
            ""|0|false|no|off) ;;
            *) echo "::error::KATA_KILLSWITCH engaged (value: ${KATA_KILLSWITCH})." >&2; exit 1 ;;
          esac
```

## Resolving Action Refs

Pin published actions to an immutable SHA, never the mutable `v1` tag. List tags
with `gh api repos/forwardimpact/kata-agent/tags` (also `bootstrap`, `harness`,
and `wiki` for `workflow-dispatch.md`), pick the highest `vX.Y.Z`, and emit
`<full-40-char-sha> # <tag>`. If resolution fails, stop and ask. Pair the pins
with the `github-actions` Dependabot config (`SKILL.md` Step 2).
