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

`{{KATA_AGENT_REF}}` is resolved at generation time — see
[§ Resolving action refs](#resolving-action-refs).

Emit `## Template (self-hosted)` when the team runs its own GitHub App (the
default), or apply `## Template (hosted)` when the team uses the Forward
Impact-hosted control plane (see [`SKILL.md`](../SKILL.md) `--hosted`). The
hosted variant carries no `KATA_APP_PRIVATE_KEY`; it mints a short-lived
installation token from `services/oidc` at run time.

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

The hosted variant is the self-hosted template with three changes. This is
the **canonical** hosted recipe — `workflow-facilitate.md` and
`workflow-react.md` reference the mint step below.

1. Add `id-token: write` to `permissions` (keep `contents: write`).
2. Insert this OIDC mint step as the first entry under `steps:`:

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

3. In the `kata-agent` step, drop the `app-id` and
   `app-private-key` inputs and add
   `installation-token: ${{ steps.mint.outputs.token }}`.

`FIT_OIDC_URL` is a repository **variable** (not a secret) — the Forward
Impact-operated `services/oidc` URL. `::add-mask::` keeps the minted token
out of logs.

## Resolving Action Refs

Generated workflows pin the published action to an immutable commit SHA,
never the mutable `v1` tag. At generation time, list release tags with
`gh api repos/forwardimpact/kata-agent/tags`
(`repos/forwardimpact/fit-eval/tags` for `{{FIT_EVAL_REF}}` in
`workflow-react.md`), pick the highest `vX.Y.Z` tag (ignore the bare `v1`
marker), and emit `<full-40-char-sha> # <tag>` so the `uses:` line reads
`forwardimpact/kata-agent@b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0`.
If resolution fails, stop and ask the operator — never fall back to a
mutable tag. Pair the pins with the `github-actions` Dependabot config
from `SKILL.md` Step 2 so they receive bump PRs instead of rotting.

## Notes

- **Cron entries** come from `schedules.md`. Agents with only a night shift
  (security-engineer, technical-writer) get one cron line; agents with all three
  shifts get three.
- **File name** follows `agent-{name}.yml` (e.g., `agent-product-manager.yml`).
- The `permissions: contents: write` block restricts `GITHUB_TOKEN`. The App
  token carries all other permissions via its installation settings.
- If wiki is disabled, set `wiki: "false"` -- the action skips wiki checkout and
  sync.
- If model is the default (`claude-opus-4-8[1m]`), the `agent-model:` line
  can be omitted since the action defaults to it.
- **Hosted variant** requires the `FIT_OIDC_URL` repository variable and
  depends on `kata-agent` accepting an `installation-token` input
  (pin the minimum sibling SHA that does).
