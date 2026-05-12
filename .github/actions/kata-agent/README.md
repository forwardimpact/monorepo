# Kata Agent

Run a complete Kata agent workflow in a single step. Handles GitHub App
authentication, repository checkout, environment bootstrap, and agent execution
via [fit-eval](https://www.npmjs.com/package/@forwardimpact/libeval).

## Usage

```yaml
name: "Agent: Product Manager"
on:
  schedule:
    - cron: "23 1 * * *"
  workflow_dispatch:
    inputs:
      task-amend:
        required: false
        type: string

permissions:
  contents: write

jobs:
  kata:
    runs-on: ubuntu-latest
    steps:
      - uses: forwardimpact/kata-action-agent@v1
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          agent-profile: "product-manager"
          task-text: >-
            Assess the current state of your domain and act on the
            highest-priority finding.
          task-amend: ${{ inputs.task-amend }}
```

## Prerequisites

- A GitHub App installed on your repository (see
  [setup guide](https://www.forwardimpact.team/docs/internals/kata/))
- Repository secrets: `KATA_APP_ID`, `KATA_APP_PRIVATE_KEY`, `ANTHROPIC_API_KEY`
- Agent profiles in `.claude/agents/` (install via
  `npx skills add forwardimpact/kata-skills`)

## Inputs

### Authentication

| Input               | Required | Default           | Description                      |
| ------------------- | -------- | ----------------- | -------------------------------- |
| `app-id`            | Yes      | —                 | GitHub App ID                    |
| `app-private-key`   | Yes      | —                 | GitHub App private key           |
| `anthropic-api-key` | Yes      | —                 | Anthropic API key                |
| `app-slug`          | No       | `kata-agent-team` | GitHub App slug for git identity |

### Agent Configuration

| Input                 | Required | Default               | Description                         |
| --------------------- | -------- | --------------------- | ----------------------------------- |
| `mode`                | No       | `run`                 | `run`, `supervise`, or `facilitate` |
| `task-text`           | Yes\*    | —                     | Inline task text                    |
| `task-file`           | Yes\*    | —                     | Path to task file                   |
| `agent-profile`       | No       | —                     | Agent profile (run/supervise)       |
| `facilitator-profile` | No       | —                     | Facilitator profile (facilitate)    |
| `agent-profiles`      | No       | —                     | Comma-separated agents (facilitate) |
| `model`               | No       | `claude-opus-4-7[1m]` | Claude model                        |
| `max-turns`           | No       | `200`                 | Max turns (0 = unlimited)           |
| `allowed-tools`       | No       | `Bash,Read,...`       | Comma-separated tool list           |
| `task-amend`          | No       | —                     | Text appended to the task           |

### Optional Overrides

| Input             | Required | Default | Description                   |
| ----------------- | -------- | ------- | ----------------------------- |
| `timeout-minutes` | No       | `45`    | Max runtime in minutes        |
| `trace`           | No       | `true`  | Enable trace capture          |
| `wiki`            | No       | `true`  | Enable wiki checkout and sync |

\*Exactly one of `task-text` or `task-file` is required.
