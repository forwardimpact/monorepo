# Kata Interview

Run a JTBD switching interview in a single step. An isolated agent, briefed
only with a persona, meets a product cold at a public website and tries to get
a chosen Job To Be Done done; a supervisor runs the
[`kata-interview` skill](https://www.npmjs.com/package/@forwardimpact/kata-skills)
to build the persona, hand off the job in two Asks, and file findings as
issues.

This action owns the **generic** interview infrastructure: killswitch, GitHub
App authentication, checkout, environment bootstrap, synthetic-data build, the
supervised run via
[fit-harness](https://www.npmjs.com/package/@forwardimpact/libharness), cost
reporting, wiki-memory sync, and run-log secret scanning. The **app-specific**
choices are pluggable inputs, so any repository — not just one running the full
Forward Impact stack — can wrap it:

- **`website-url`** — the entry point handed to the persona agent.
- **`substrate-setup-command`** — brings up a Supabase substrate and emits its
  URL/anon key. Empty runs a file-only interview.
- **`persona-select-command`** — seals a persona identity and stashes a JWT for
  the post-run scan. Empty builds the persona from the synthetic story with
  anonymous access.

## Usage

```yaml
name: "Kata: Interview"
on:
  workflow_dispatch:
    inputs:
      product:
        required: false
        type: string
      job:
        required: false
        type: string

concurrency:
  group: kata-interview
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  interview:
    runs-on: ubuntu-latest
    # A composite action cannot declare concurrency or a job timeout — keep
    # both on this wrapper. Stay strictly under 60 so a stalled run cannot
    # outlive its 1-hour App token.
    timeout-minutes: 50
    steps:
      - uses: forwardimpact/kata-interview@v1
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          website-url: https://example.com
          product: ${{ inputs.product }}
          job: ${{ inputs.job }}
          # File-only interview: no substrate-setup-command / persona command.
```

A substrate-backed interview supplies the two domain commands and the substrate
secrets:

```yaml
      - uses: forwardimpact/kata-interview@v1
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          website-url: https://example.com
          substrate-setup-command: >-
            npx fit-terrain substrate up --cwd . --emit-env "$GITHUB_ENV"
          jwt-secret: ${{ secrets.SUPABASE_JWT_SECRET }}
          service-role-key: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Prerequisites

- A GitHub App installed on your repository, with `Actions: Read` so the log
  scan can download the run archive.
- Repository secrets: `KATA_APP_ID`, `KATA_APP_PRIVATE_KEY`,
  `ANTHROPIC_API_KEY` (plus substrate secrets on the substrate path).
- The `kata-interview` skill and agent profiles installed (via
  `npx skills add forwardimpact/kata-skills`).

## Inputs

### Authentication

| Input               | Required | Default           | Description                      |
| ------------------- | -------- | ----------------- | -------------------------------- |
| `app-id`            | Yes      | —                 | GitHub App ID                    |
| `app-private-key`   | Yes      | —                 | GitHub App private key           |
| `anthropic-api-key` | Yes      | —                 | Anthropic API key                |
| `app-slug`          | No       | `kata-agent-team` | GitHub App slug for git identity |

### Interview target

| Input         | Required | Default | Description                                            |
| ------------- | -------- | ------- | ------------------------------------------------------ |
| `website-url` | Yes      | —       | Public entry point handed to the persona agent (Ask 2) |
| `product`     | No       | —       | Product to interview about (empty = supervisor picks)  |
| `job`         | No       | —       | JTBD goal to test (empty = supervisor picks)           |
| `task-amend`  | No       | —       | Text appended to the task prompt for steering          |

### Pluggable domain steps

| Input                     | Required | Default | Description                                                                                                  |
| ------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `substrate-setup-command` | No       | `""`    | Brings up the substrate and emits `SUPABASE_URL`/`SUPABASE_ANON_KEY` to `$GITHUB_ENV`. Non-empty ⇒ substrate path. Runs with `AGENT_CWD` set. |
| `persona-select-command`  | No       | `""`    | Seals a persona into `$AGENT_CWD` and stashes a bare JWT at `$RUNNER_TEMP/.persona-jwt`. Empty ⇒ story-derived / anonymous. |

### Substrate secrets

Forwarded to the setup and persona commands only when the substrate path is
active (`substrate-setup-command` non-empty).

| Input              | Required | Default | Description               |
| ------------------ | -------- | ------- | ------------------------- |
| `jwt-secret`       | No       | `""`    | Supabase JWT secret       |
| `service-role-key` | No       | `""`    | Supabase service-role key |

### Shared knobs

| Input                      | Required | Default              | Description                             |
| -------------------------- | -------- | -------------------- | --------------------------------------- |
| `max-turns`                | No       | `200`                | Max turns per runner (0 = unlimited)    |
| `allowed-tools`            | No       | `Bash,Read,...`      | Agent tool allowlist                    |
| `supervisor-allowed-tools` | No       | `Bash,Read,...`      | Supervisor tool allowlist               |
| `killswitch`               | No       | `""`                 | Truthy value fails the run fast         |

## Outputs

| Output       | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `trace-file` | Absolute path of the raw NDJSON trace file from the run         |
| `trace-dir`  | Absolute path of the temp directory holding all trace files     |

## Notes

- A composite action cannot declare `concurrency`, a job `timeout-minutes`, or
  read `secrets.*`. Keep concurrency and the (sub-60-minute) timeout on the
  wrapper workflow, and pass secrets as inputs.
- On the substrate path, the run's own logs are scanned for the persona JWT and
  the substrate secrets after the interview; a hit fails the run, and an
  unreadable archive fails closed.
