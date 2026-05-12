# Kata Eval

Run agent tasks via the
[fit-eval](https://www.npmjs.com/package/@forwardimpact/libeval) CLI using the
Claude Agent SDK. Handles trace capture, splitting, and artifact upload.

## Usage

```yaml
- uses: forwardimpact/kata-action-eval@v1
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ steps.ci-app.outputs.token }}
  with:
    task-text: "Assess the current state of your domain and act on the highest-priority finding."
    agent-profile: "product-manager"
```

## Prerequisites

- Node.js 18+ or Bun 1.2+
- `@forwardimpact/libeval` installed (via `npm install` or in a Bun workspace)
- `ANTHROPIC_API_KEY` and `GH_TOKEN` set as environment variables

## Inputs

| Input                 | Required | Default               | Description                              |
| --------------------- | -------- | --------------------- | ---------------------------------------- |
| `task-text`           | Yes\*    | —                     | Inline task text                         |
| `task-file`           | Yes\*    | —                     | Path to task file                        |
| `mode`                | No       | `run`                 | `run`, `supervise`, or `facilitate`      |
| `model`               | No       | `claude-opus-4-7[1m]` | Claude model                             |
| `max-turns`           | No       | `200`                 | Max turns (0 = unlimited)                |
| `agent-profile`       | No       | —                     | Agent profile name                       |
| `facilitator-profile` | No       | —                     | Facilitator profile (facilitate mode)    |
| `agent-profiles`      | No       | —                     | Comma-separated agents (facilitate mode) |
| `supervisor-profile`  | No       | —                     | Supervisor profile (supervise mode)      |
| `allowed-tools`       | No       | `Bash,Read,...`       | Comma-separated tool list                |
| `task-amend`          | No       | —                     | Text appended to the task                |
| `trace`               | No       | `true`                | Enable trace capture                     |
| `timeout-minutes`     | No       | `45`                  | Max runtime in minutes                   |
| `case`                | No       | `default`             | Case id embedded in trace filenames      |

\*Exactly one of `task-text` or `task-file` is required.

## Trace Artifacts

When `trace` is enabled, the action uploads one artifact per run named
`trace--<case>` containing every trace file produced. Files inside follow the
`trace--<case>--<participant>.<role>.ndjson` convention:

| File                                              | Contents                                                   | Modes                  |
| ------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `trace--<case>.raw.ndjson`                        | Combined trace with `{source, seq, event}` envelopes       | All                    |
| `trace--<case>--agent.agent.ndjson`               | Unwrapped agent events (run, supervise)                    | run, supervise         |
| `trace--<case>--<profile>.agent.ndjson`           | Per-agent unwrapped events, one file per facilitate agent  | facilitate             |
| `trace--<case>--supervisor.supervisor.ndjson`     | Unwrapped supervisor events                                | supervise              |
| `trace--<case>--facilitator.facilitator.ndjson`   | Unwrapped facilitator events                               | facilitate             |

`<case>` defaults to `default` for non-matrix runs; matrix workflows pass
`case: ${{ matrix.<dim>.id }}` to disambiguate per-shard artifacts. The legacy
`artifact-suffix` input is honored with a deprecation warning.

## Trace redaction

The underlying `fit-eval` CLI redacts secrets in trace artifacts before they
reach disk. Two layers compose:

- **Env-var allowlist**, defaulting to `ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`. The runtime values of these vars are replaced with
  `[REDACTED:env:NAME]` wherever they appear in tool inputs, tool outputs,
  assistant text, or orchestrator summaries. Override the list with
  `LIBEVAL_REDACTION_ENV_VARS=NAME1,NAME2,…` (replaces, not extends).
- **Credential-shape patterns**, covering Anthropic API keys (`sk-ant-`),
  GitHub PATs (`ghp_`), installation tokens (`ghs_`), OAuth tokens (`gho_`),
  and fine-grained PATs (`github_pat_`). Pattern hits become
  `[REDACTED:pattern:KIND]`.

Redaction is on by default. To disable, set `LIBEVAL_REDACTION_DISABLED=1` in
the workflow `env:` block — a stderr warning fires once per run. Setting this
in workflow YAML is reviewable in the PR diff and is **prohibited on
public-repo CI**: workflow artifacts there are downloadable through the
retention window, and a redaction-disabled trace could carry the workflow's
`ANTHROPIC_API_KEY` and `GH_TOKEN` to anyone with read access.
