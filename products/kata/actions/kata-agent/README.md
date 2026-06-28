# Kata Agent

Run a complete Kata agent workflow in a single step. Handles GitHub App
authentication, repository checkout, environment bootstrap, agent execution
via [fit-harness](https://www.npmjs.com/package/@forwardimpact/libharness), and
wiki-memory sync — the storyboard is refreshed from live issue/CSV state both
before and after the run, then pushed back.

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
      - uses: forwardimpact/kata-agent@v1
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

| Input                      | Required | Default               | Description                                                            |
| -------------------------- | -------- | --------------------- | ---------------------------------------------------------------------- |
| `mode`                     | No       | `run`                 | `run`, `supervise`, `facilitate`, or `discuss`                         |
| `task-text`                | Yes\*    | —                     | Inline task text                                                       |
| `task-file`                | Yes\*    | —                     | Path to task file                                                      |
| `agent-profile`            | No       | —                     | Agent profile (run / supervise modes)                                  |
| `lead-profile`             | No       | —                     | Lead role profile (supervise / facilitate / discuss modes)             |
| `agent-profiles`           | No       | —                     | Comma-separated participant profiles (facilitate / discuss modes)      |
| `agent-model`              | No       | `claude-opus-4-7[1m]` | Claude model for agents                                                |
| `lead-model`               | No       | `claude-opus-4-7[1m]` | Claude model for the lead role (supervise / facilitate / discuss)      |
| `max-turns`                | No       | `200`                 | Max turns (0 = unlimited)                                              |
| `allowed-tools`            | No       | `Bash,Read,...`       | Comma-separated tool list                                              |
| `supervisor-allowed-tools` | No       | —                     | Comma-separated tool list for the supervisor (supervise mode)          |
| `task-amend`               | No       | —                     | Text appended to the task                                              |

### Lead role (`supervisor` / `facilitator` / `chair`)

The lead's profile and model are controlled by a single pair of inputs across
all three multi-agent modes:

- `supervise` mode runs a supervisor + agent relay; the lead is the supervisor.
- `facilitate` mode runs a facilitator + N participants; the lead is the
  facilitator.
- `discuss` mode runs a chair + N participants over a suspendable bridge; the
  lead is the chair.

Set `lead-profile` to choose the lead's profile and `lead-model` to override
the lead's model.

### Discuss mode

`mode: discuss` runs an asynchronous, suspendable discussion. Use
`discussion-id` to correlate traces across resumed runs and `resume-context`
to restore prior state when the caller resumes a suspended discussion.

| Input            | Required | Default | Description                                              |
| ---------------- | -------- | ------- | -------------------------------------------------------- |
| `discussion-id`  | No       | —       | Stable id for the threaded discussion; enables resume    |
| `resume-context` | No       | —       | JSON-serialized prior state for a resumed discuss run    |

### Optional Overrides

| Input             | Required | Default | Description                   |
| ----------------- | -------- | ------- | ----------------------------- |
| `timeout-minutes` | No       | `45`    | Max runtime in minutes        |
| `trace`           | No       | `true`  | Enable trace capture          |
| `case`            | No       | `default` | Case id for trace artifacts |
| `wiki`            | No       | `true`  | Enable wiki checkout and sync |
| `cwd`             | No       | `.`     | Agent working dir (run mode)  |
| `supervisor-cwd`  | No       | `.`     | Supervisor working dir (supervise mode) |
| `agent-cwd`       | No       | `.`     | Agent working dir (supervise / facilitate / discuss modes) |

\*Exactly one of `task-text` or `task-file` is required.
