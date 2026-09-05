# Kata Agent

Run a complete Kata agent workflow in a single step. The action handles GitHub
App authentication, repository checkout, environment bootstrap, agent execution
through [gemba-harness](https://www.npmjs.com/package/@forwardimpact/gemba),
and wiki-memory sync. It refreshes the storyboard from live issue/CSV state
before the run and after it. It then pushes the storyboard back. The action also
stamps the installation token it mints, and the agent reads the stamp as
`KATA_GH_TOKEN_STAMP`.

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
  [setup guide](https://www.kata.team/))
- Repository secrets: `KATA_APP_ID`, `KATA_APP_PRIVATE_KEY`, `ANTHROPIC_API_KEY`
- Agent profiles in `.claude/agents/` (install with
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
| `task-event`               | Yes\*    | `""`                  | Path to a native GitHub event payload (`${{ github.event_path }}`); the CLI composes the task |
| `agent-profile`            | No       | —                     | Agent profile (run / supervise modes)                                  |
| `lead-profile`             | No       | —                     | Lead role profile (supervise / facilitate / discuss modes)             |
| `agent-profiles`           | No       | —                     | Comma-separated participant profiles (facilitate / discuss modes)      |
| `agent-model`              | No       | `""`                  | Claude model for agents; empty uses the gemba-harness CLI default      |
| `lead-model`               | No       | `""`                  | Claude model for the lead role (supervise / facilitate / discuss); empty uses the gemba-harness CLI default |
| `max-turns`                | No       | `200`                 | Max turns (0 = unlimited)                                              |
| `allowed-tools`            | No       | `Bash,Read,...`       | Comma-separated tool list                                              |
| `supervisor-allowed-tools` | No       | —                     | Comma-separated tool list for the supervisor (supervise mode)          |
| `task-amend`               | No       | —                     | Text appended to the task                                              |

### Lead role (`supervisor` / `facilitator` / `chair`)

One pair of inputs controls the lead's profile and model across all three
multi-agent modes:

- `supervise` mode runs a supervisor + agent relay. The lead is the supervisor.
- `facilitate` mode runs a facilitator + N participants. The lead is the
  facilitator.
- `discuss` mode runs a chair + N participants over a suspendable bridge. The
  lead is the chair.

Set `lead-profile` to choose the lead's profile. Set `lead-model` to override
the lead's model.

### Discuss mode and the bridge contract

`mode: discuss` runs an asynchronous, suspendable discussion. Use
`discussion-id` to correlate traces across resumed runs. Use `resume-context`
to restore prior state when the caller resumes a suspended discussion.

| Input            | Required | Default | Description                                              |
| ---------------- | -------- | ------- | -------------------------------------------------------- |
| `discussion-id`  | No       | —       | Stable id for the threaded discussion, which lets a run resume |
| `resume-context` | No       | —       | JSON-serialized prior state for a resumed discuss run    |
| `callback-url`   | No       | `""`    | URL that receives the run's terminal conclusion          |
| `correlation-id` | No       | `""`    | Correlation id the callback payload echoes back          |
| `inbox-url`      | No       | `""`    | Long-poll URL that injects messages into a live discuss run |

A non-empty `callback-url` makes the action POST the terminal payload after the
run. It posts on success and on failure alike.

The callback belongs to every mode, not to `discuss` alone. The action gates it
on `callback-url` and nothing else, so a `run`, `supervise`, or `facilitate`
caller that names a URL gets the same terminal payload. Only `inbox-url` is
specific to `discuss`, because it injects messages into a live discussion.

Keep `trace` enabled when you pass a `callback-url`. With `trace: "false"` the
callback has no trace to read, so it posts the no-trace placeholder instead of
the run's conclusion.

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
| `bun-version`     | No       | `""`    | Bun version for the bootstrap; empty installs the bootstrap's pinned default |
| `killswitch`      | No       | `""`    | Operator killswitch. Empty, `0`, `false`, `no`, and `off` let the run proceed. Any other value fails it before it mints a token or does agent work. Pass the `KATA_KILLSWITCH` repository variable so one variable halts every workflow at once. |

\*Supply exactly one of `task-text`, `task-file`, or `task-event`.

## Event mode

Pass `task-event` to run the agent straight from a GitHub event. The CLI
composes the task from the payload, so the workflow assembles no prompt. A
dispatch workflow that also carries the bridge contract reads like this:

```yaml
name: "Agent: Dispatch"
on:
  issues:
    types: [opened]
  workflow_dispatch:
    inputs:
      prompt:
        required: false
        type: string
      callback_url:
        required: false
        type: string
      correlation_id:
        required: false
        type: string
      discussion_id:
        required: false
        type: string
      resume_context:
        required: false
        type: string
      inbox_url:
        required: false
        type: string

permissions:
  contents: write

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: forwardimpact/kata-agent@v1
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          killswitch: ${{ vars.KATA_KILLSWITCH }}
          task-event: ${{ github.event_path }}
          mode: ${{ inputs.discussion_id != '' && 'discuss' || 'facilitate' }}
          agent-profiles: "product-manager,staff-engineer,technical-writer"
          callback-url: ${{ inputs.callback_url }}
          correlation-id: ${{ inputs.correlation_id }}
          discussion-id: ${{ inputs.discussion_id }}
          resume-context: ${{ inputs.resume_context }}
          inbox-url: ${{ inputs.inbox_url }}
```

Both `facilitate` and `discuss` need `agent-profiles`, so name the participants
on the step. On an issue or pull request event `inputs` is null, every bridge
value resolves empty, and the callback step skips.
