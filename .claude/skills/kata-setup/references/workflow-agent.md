# Workflow Template: Scheduled Agent

Generate one workflow file per agent. Replace Mustache-style placeholders with
the user's configuration.

## Placeholders

| Placeholder          | Example                                                  |
| -------------------- | -------------------------------------------------------- |
| `{{AGENT_TITLE}}`    | `Product Manager`                                        |
| `{{AGENT_NAME}}`     | `product-manager`                                        |
| `{{CRON_ENTRIES}}`   | Three `- cron:` lines from `schedules.md`                |
| `{{MODEL}}`          | `claude-opus-4-8[1m]`                                    |
| `{{WIKI}}`           | `"true"` or `"false"`                                    |
| `{{KATA_AGENT_REF}}` | `b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0`      |

`{{KATA_AGENT_REF}}` is resolved at generation time (see [§ Resolving action
refs](#resolving-action-refs)). The `Kata killswitch` step below is the canonical
copy `workflow-facilitate.md` and `workflow-react.md` reference.

Emit `## Template (self-hosted)` for a team's own GitHub App (default), or
`## Template (hosted)` for the Forward Impact-hosted control plane (see
[`SKILL.md`](../SKILL.md) `--hosted`) — no `KATA_APP_PRIVATE_KEY`, mints a
short-lived `services/oidc` token at run time.

## Template (Self-Hosted)

```yaml
name: "Agent: {{AGENT_TITLE}}"

on:
  schedule:
    {{CRON_ENTRIES}}
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt"
        required: false
        type: string

permissions:
  contents: write

jobs:
  kata:
    runs-on: ubuntu-latest
    steps:
      # Killswitch: halt every kata workflow by setting KATA_KILLSWITCH truthy.
      # Keep it first so it fails before any token mint, checkout, or agent work.
      - name: Kata killswitch
        shell: bash
        env:
          KATA_KILLSWITCH: ${{ vars.KATA_KILLSWITCH }}
        run: |
          case "$(printf '%s' "${KATA_KILLSWITCH:-}" | tr '[:upper:]' '[:lower:]')" in
            ""|0|false|no|off) echo "Kata killswitch not engaged; proceeding." ;;
            *) echo "::error::KATA_KILLSWITCH engaged (value: ${KATA_KILLSWITCH}). Failing fast." >&2; exit 1 ;;
          esac

      - uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          agent-profile: "{{AGENT_NAME}}"
          agent-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          task-text: >-
            Assess the current state of your domain and act on the
            highest-priority finding.
          task-amend: ${{ inputs.task-amend }}
```

## Template (Hosted)

The hosted variant is the self-hosted template with three changes (the
**canonical** hosted recipe the other workflow files reference):

1. Add `id-token: write` to `permissions` (keep `contents: write`).
2. Insert this OIDC mint step directly **after** the `Kata killswitch` step
   (the killswitch stays first):

   ```yaml
         - name: Mint installation token via Forward Impact OIDC
           id: mint
           env:
             OIDC_REQUEST_TOKEN: ${{ env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }}
             OIDC_REQUEST_URL: ${{ env.ACTIONS_ID_TOKEN_REQUEST_URL }}
             OIDC_HOST: ${{ vars.FIT_OIDC_URL }}
           run: |
             set -euo pipefail
             # OIDC_REQUEST_URL already carries ?api-version=... — append &audience= safely.
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

`FIT_OIDC_URL` is a repository **variable** (not a secret): the Forward Impact
`services/oidc` URL. `::add-mask::` keeps the minted token out of logs.

## Resolving Action Refs

Pin the published action to an immutable SHA, never the mutable `v1` tag. At
generation time list release tags with `gh api repos/forwardimpact/kata-agent/tags`
(`repos/forwardimpact/fit-eval/tags` for `{{FIT_EVAL_REF}}` in
`workflow-react.md`), pick the highest `vX.Y.Z` tag, and emit
`<full-40-char-sha> # <tag>`. If resolution fails, stop and ask the operator —
never fall back to a mutable tag. Pair the pins with the `github-actions`
Dependabot config from `SKILL.md` Step 2.

## Notes

- **Cron** comes from `schedules.md` — one line for night-only agents
  (security-engineer, technical-writer), three for the rest.
- **File name** is `agent-{name}.yml`.
- `permissions: contents: write` scopes `GITHUB_TOKEN`; the App token carries the
  rest via its installation.
- Set `wiki: "false"` to skip wiki checkout/sync; omit `agent-model:` when it is
  the default (`claude-opus-4-8[1m]`).
- **Hosted variant** needs the `FIT_OIDC_URL` variable and a `kata-agent` SHA
  that accepts `installation-token`.
