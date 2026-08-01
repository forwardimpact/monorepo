# Workflow Templates: Facilitated Sessions

`improvement-coach` leads two facilitated session types. Generate them only
when you select `improvement-coach`. Storyboard uses `mode: "discuss"` for a
multi-agent team meeting. Coaching uses `mode: "facilitate"` for a focused
one-on-one.

## Placeholders

| Placeholder           | Example                                            |
| --------------------- | -------------------------------------------------- |
| `{{STORYBOARD_CRON}}` | `0 6 * * *` (from `schedules.md`)                  |
| `{{AGENT_LIST}}`      | selected agents except `improvement-coach`         |
| `{{MODEL}}`           | `claude-opus-4-8[1m]`                              |
| `{{WIKI}}`            | `"true"` or `"false"`                              |
| `{{KATA_AGENT_REF}}`  | resolved per `workflow-shift.md`                   |

The templates below are **self-hosted**. For the **hosted** control plane (see
[`SKILL.md`](../SKILL.md) `--hosted`), apply the delta under
[§ Hosted variant](#hosted-variant). The hosted variant uses no
`KATA_APP_PRIVATE_KEY`.

## Storyboard Template

File name: `agent-storyboard.yml`

```yaml
name: "Agent: Storyboard"

on:
  schedule:
    - cron: "{{STORYBOARD_CRON}}"
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

concurrency:
  group: agent-storyboard
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  kata:
    runs-on: ubuntu-latest
    steps:
      # kata-agent runs the killswitch first and reports run cost last.
      - uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}
        id: agent
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          killswitch: ${{ vars.KATA_KILLSWITCH }}
          mode: "discuss"
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

File name: `agent-coaching.yml`. This template matches the storyboard template,
with these changes:

- `name: "Agent: Coaching"` and `group: agent-coaching`.
- Drop the `schedule:` trigger (coaching is `workflow_dispatch` only).
- Add a required `agent` dispatch input (the agent name to coach). Keep
  `task-amend`.
- `mode: "facilitate"`, `agent-profiles: "${{ inputs.agent }}"`, and
  `task-text: Facilitate a one-on-one Kata coaching session with "${{ inputs.agent }}".`

## Hosted Variant

Both are `kata-agent` workflows, so the hosted delta is identical to
[`workflow-shift.md` § Template (hosted)](workflow-shift.md): add
`id-token: write` to `permissions`, insert the OIDC mint step as the first step,
and replace `app-id` / `app-private-key` with
`installation-token: ${{ steps.mint.outputs.token }}`.

## Notes

- The storyboard `{{AGENT_LIST}}` excludes `improvement-coach`. It facilitates
  the session. It does not participate.
- The storyboard cron runs after the night shift finishes. See `schedules.md`.
- You trigger coaching manually. The storyboard also triggers it when an agent
  needs focus.
- **Hosted variants** require the `FIT_OIDC_URL` repository variable.
