# Kata Harness

Run agent tasks via the
[gemba-harness](https://www.npmjs.com/package/@forwardimpact/gemba) CLI using the
Claude Agent SDK. Handles trace capture, splitting, and artifact upload.

## Usage

```yaml
- uses: forwardimpact/harness@v1
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ steps.ci-app.outputs.token }}
  with:
    task-text: "Assess the current state of your domain and act on the highest-priority finding."
    agent-profile: "product-manager"
```

## Prerequisites

- Node.js 18+ or Bun 1.2+
- `@forwardimpact/gemba` installed (via `npm install` or in a Bun workspace)
- `ANTHROPIC_API_KEY` and `GH_TOKEN` set as environment variables

## Inputs

| Input                      | Required | Default               | Description                                                                  |
| -------------------------- | -------- | --------------------- | ---------------------------------------------------------------------------- |
| `task-text`                | Yes\*    | —                     | Inline task text                                                             |
| `task-file`                | Yes\*    | —                     | Path to task file                                                            |
| `mode`                     | No       | `run`                 | `run`, `supervise`, `facilitate`, or `discuss`                               |
| `agent-model`              | No       | `claude-opus-4-7[1m]` | Claude model for agents                                                      |
| `lead-model`               | No       | `claude-opus-4-7[1m]` | Claude model for the lead role (supervise / facilitate / discuss modes)      |
| `max-turns`                | No       | `200`                 | Max turns (0 = unlimited)                                                    |
| `lead-profile`             | No       | —                     | Lead role profile name (supervise / facilitate / discuss modes)              |
| `agent-profile`            | No       | —                     | Agent profile name (run and supervise modes)                                 |
| `agent-profiles`           | No       | —                     | Comma-separated participant profiles (facilitate and discuss modes)          |
| `allowed-tools`            | No       | `Bash,Read,...`       | Comma-separated tool list for the agent                                      |
| `supervisor-allowed-tools` | No       | —                     | Comma-separated tool list for the supervisor (supervise mode)                |
| `task-amend`               | No       | —                     | Text appended to the task                                                    |
| `mcp-server`               | No       | —                     | MCP service name (e.g. `guide`); adds `mcp__<name>__*` to allowed tools      |
| `cwd`                      | No       | `.`                   | Agent working directory (run mode)                                           |
| `supervisor-cwd`           | No       | `.`                   | Supervisor working directory (supervise mode)                                |
| `agent-cwd`                | No       | `.`                   | Agent working directory (supervise / facilitate / discuss modes)             |
| `discussion-id`            | No       | —                     | Stable id for the threaded discussion (discuss mode); enables resume         |
| `resume-context`           | No       | —                     | JSON-serialized prior state for a resumed discuss run (discuss mode)         |
| `trace`                    | No       | `true`                | Enable trace capture. Note the asymmetry with the benchmark action's same-named input: here `trace: "false"` disables capture entirely, while the benchmark action always captures and only gates artifact upload and outputs |
| `timeout-minutes`          | No       | `45`                  | Max runtime in minutes                                                       |
| `case`                     | No       | `default`             | Case id embedded in trace filenames                                          |

\*Exactly one of `task-text` or `task-file` is required.

### Lead role (`supervisor` / `facilitator` / `chair`)

The lead's profile and model are controlled by a single pair of inputs across
all three multi-agent modes:

- `supervise` mode runs a supervisor + agent relay; the lead is the supervisor.
- `facilitate` mode runs a facilitator + N participants; the lead is the
  facilitator.
- `discuss` mode runs a chair + N participants over a suspendable bridge; the
  lead is the chair.

In every case, set `lead-profile` to choose the lead's profile and `lead-model`
to override the lead's model. The legacy `supervisor-profile`,
`supervisor-model`, `facilitator-profile`, and `facilitator-model` inputs have
been removed — pass `lead-*` instead.

### Discuss mode

`mode: discuss` runs an asynchronous, suspendable discussion. The chair drives
the conversation and N participants respond via a bridge callback. Use
`discussion-id` to correlate traces across resumed runs and `resume-context` to
restore prior state when the caller resumes a suspended discussion.

```yaml
- uses: forwardimpact/harness@v1
  with:
    mode: discuss
    task-text: "…"
    lead-profile: release-engineer
    agent-profiles: product-manager,security-engineer,staff-engineer
    discussion-id: GD_kw...
```

## Outputs

| Output       | Description                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace-dir`  | Absolute path of the mktemp directory holding the run's trace files (empty when `trace: false`).                                            |
| `trace-file` | Absolute path of the raw NDJSON trace (`<trace-dir>/trace--<case>.raw.ndjson`); wraps each event in `{source, seq, event}`.                 |
| `case`       | Effective case identifier (after resolving `case` / legacy `artifact-suffix`).                                                              |

Downstream steps can read the raw trace directly — e.g. to extract the
orchestrator summary and POST it to an external caller:

```yaml
- id: assess
  uses: forwardimpact/harness@v1
  with:
    mode: facilitate
    task-text: "…"
    lead-profile: release-engineer
    agent-profiles: product-manager,security-engineer,staff-engineer

- name: Deliver callback
  if: steps.assess.outputs.trace-file != ''
  env:
    TRACE_FILE: ${{ steps.assess.outputs.trace-file }}
  run: |
    node products/gemba/bin/gemba-harness.js callback \
      --trace-file="$TRACE_FILE" \
      --callback-url="$CALLBACK_URL" \
      --correlation-id="$CORRELATION_ID"
```

## Trace Artifacts

When `trace` is enabled, the action uploads one artifact per run named
`trace--<case>` containing every trace file produced. Files inside follow the
`trace--<case>--<participant>.<role>.ndjson` convention:

| File                                              | Contents                                                   | Modes                  |
| ------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `trace--<case>.raw.ndjson`                        | Combined trace with `{source, seq, event}` envelopes       | All                    |
| `trace--<case>--agent.agent.ndjson`               | Unwrapped agent events (run, supervise)                    | run, supervise         |
| `trace--<case>--<profile>.agent.ndjson`           | Per-agent unwrapped events, one file per participant       | facilitate, discuss    |
| `trace--<case>--supervisor.supervisor.ndjson`     | Unwrapped supervisor events                                | supervise              |
| `trace--<case>--facilitator.facilitator.ndjson`   | Unwrapped facilitator events                               | facilitate             |
| `trace--<case>--chair.<role>.ndjson`              | Unwrapped chair events (split by envelope source)          | discuss                |

`<case>` defaults to `default` for non-matrix runs; matrix workflows pass
`case: ${{ matrix.<dim>.id }}` to disambiguate per-shard artifacts. The legacy
`artifact-suffix` input is honored with a deprecation warning.

## Trace redaction

The underlying `gemba-harness` CLI redacts secrets in trace artifacts before they
reach disk. Two layers compose:

- **Env-var allowlist**, defaulting to `ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`. The runtime values of these vars are replaced with
  `[REDACTED:env:NAME]` wherever they appear in tool inputs, tool outputs,
  assistant text, or orchestrator summaries. Override the list with
  `LIBHARNESS_REDACTION_ENV_VARS=NAME1,NAME2,…` (replaces, not extends).
- **Credential-shape patterns**, covering Anthropic API keys (`sk-ant-`),
  GitHub PATs (`ghp_`), installation tokens (`ghs_`), OAuth tokens (`gho_`),
  and fine-grained PATs (`github_pat_`). Pattern hits become
  `[REDACTED:pattern:KIND]`.

Redaction is on by default. To disable, set `LIBHARNESS_REDACTION_DISABLED=1` in
the workflow `env:` block — a stderr warning fires once per run. Setting this
in workflow YAML is reviewable in the PR diff and is **prohibited on
public-repo CI**: workflow artifacts there are downloadable through the
retention window, and a redaction-disabled trace could carry the workflow's
`ANTHROPIC_API_KEY` and `GH_TOKEN` to anyone with read access.
