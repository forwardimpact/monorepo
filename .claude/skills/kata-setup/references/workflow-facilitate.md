# Workflow Templates: Facilitated Sessions

Two facilitated session types: daily storyboard and on-demand coaching. Both use
`mode: "facilitate"` with `lead-profile` and `agent-profiles`. Generate
only when `improvement-coach` is selected.

## Placeholders

| Placeholder           | Example                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `{{STORYBOARD_CRON}}` | `0 6 * * *` (from `schedules.md`)                                                    |
| `{{AGENT_LIST}}`      | `security-engineer,technical-writer,product-manager,staff-engineer,release-engineer` |
| `{{MODEL}}`           | `claude-opus-4-8[1m]`                                                                |
| `{{WIKI}}`            | `"true"` or `"false"`                                                                |
| `{{KATA_AGENT_REF}}`  | `b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0`                                  |

`{{KATA_AGENT_REF}}` is resolved at generation time — see
[`workflow-agent.md` § Resolving action refs](workflow-agent.md#resolving-action-refs).

The templates below are the **self-hosted** variants. For the **hosted**
control plane (see [`SKILL.md`](../SKILL.md) `--hosted`), apply the hosted
delta described under [§ Hosted variant](#hosted-variant) — no
`KATA_APP_PRIVATE_KEY`.

## Storyboard Template

File name: `kata-storyboard.yml`

```yaml
name: "Kata: Storyboard"

on:
  schedule:
    - cron: "{{STORYBOARD_CRON}}"
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
          mode: "facilitate"
          lead-profile: "improvement-coach"
          agent-profiles: "{{AGENT_LIST}}"
          agent-model: "{{MODEL}}"
          lead-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          task-text: >-
            Facilitate a team Kata storyboard session.
          task-amend: ${{ inputs.task-amend }}
```

## Coaching Template

File name: `kata-coaching.yml`

```yaml
name: "Kata: Coaching"

on:
  workflow_dispatch:
    inputs:
      agent:
        description: "Agent name to coach (e.g., security-engineer)"
        required: true
        type: string
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
          mode: "facilitate"
          lead-profile: "improvement-coach"
          agent-profiles: "${{ inputs.agent }}"
          agent-model: "{{MODEL}}"
          lead-model: "{{MODEL}}"
          wiki: "{{WIKI}}"
          task-text: >-
            Facilitate a one-on-one Kata coaching session with
            "${{ inputs.agent }}".
          task-amend: ${{ inputs.task-amend }}
```

## Hosted variant

Both templates above are `kata-agent` workflows, so the hosted
delta is identical to
[`workflow-agent.md` § Template (hosted)](workflow-agent.md): add
`id-token: write` to `permissions`, insert the OIDC mint step as the first
step, and replace the `app-id` / `app-private-key` inputs with
`installation-token: ${{ steps.mint.outputs.token }}`.

## Notes

- The storyboard `{{AGENT_LIST}}` includes all selected agents except
  `improvement-coach` (the coach facilitates, not participates).
- The storyboard cron runs after the night shift finishes -- see `schedules.md`
  for the correct UTC time per timezone.
- Coaching is `workflow_dispatch` only -- triggered manually or by the
  storyboard when an agent needs focused attention.
- **Hosted variants** require the `FIT_OIDC_URL` repository variable and
  depend on `kata-agent` accepting an `installation-token` input.
