# fit-benchmark CLI Reference

Install and run via npm:

```sh
npx fit-benchmark <command> [options]
```

## Commands

| Command  | Purpose                                                       |
| -------- | ------------------------------------------------------------- |
| `run`    | Run every task in a family for N runs                         |
| `invariants` | Check one task's invariants against a post-run workdir (no agent invoked) |
| `report` | Aggregate results into pass@k via the HumanEval estimator     |

## `run` options

| Flag               | Required | Purpose                                                                                          |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `--family`         | yes      | Path or git URL of the task family                                                               |
| `--task`           | no       | Run only this task id (directory under `tasks/`); default runs every task                        |
| `--skills-from`    | no       | Stage `.claude/` from this directory (a root containing `.claude/`) instead of running apm install — benchmark local, unpublished skills |
| `--work-tracker`   | no       | Active work-item tracker the agent coordinates through: `github` or `filesystem` (default `github`) |
| `--output`         | no       | Run-output directory (created if missing, default `benchmark-runs`)                              |
| `--runs`           | no       | Runs per task (default `5`)                                                                      |
| `--agent-model`    | no       | Claude model for the agent-under-test (default `claude-sonnet-4-6`)                              |
| `--lead-model`       | no     | Claude model for the lead role (default `claude-opus-4-8[1m]`)                                       |
| `--judge-model`    | no       | Claude model for the judge (default `claude-opus-4-8[1m]`)                                           |
| `--agent-profile`  | no       | Agent-under-test profile name                                                                    |
| `--judge-profile`  | no       | Judge profile name                                                                               |
| `--max-turns`      | no       | Agent turn budget (default `50`; `0` = unlimited)                                                |
| `--allowed-tools`  | no       | Comma-separated tool allowlist for the agent (default `Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite`) |

`run` writes one JSON line per result record to stdout for visibility,
and appends the same record to `<output>/results.jsonl` for the report
subcommand. Exit code is `0` if every record's combined verdict is
`pass`, otherwise `1`.

## `invariants` options

| Flag         | Required | Purpose                                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------------------------- |
| `--family`   | yes      | Path or git URL of the task family                                                       |
| `--task`     | yes      | Task id (directory name under `tasks/`)                                        |
| `--run-dir`  | yes      | Post-run directory whose `cwd/` subdir is the agent CWD; invariants run against that cwd (the path hooks see as `$AGENT_CWD`). |
| `--output`   | no       | Output file path (defaults to stdout; one JSONL line)                                    |

`invariants` emits an `InvariantsRecord` (narrower than the full `ResultRecord` —
it skips agent and judge fields because no agent was invoked). Exit
`0` on pass, `1` on fail.

## `report` options

| Flag       | Required | Purpose                                                                              |
| ---------- | -------- | ------------------------------------------------------------------------------------ |
| `--input`  | no       | Run-output directory containing `results.jsonl` (default `benchmark-runs`)           |
| `--k`      | no       | Comma-separated `k` values (default `1,3,5`)                                         |
| `--format` | no       | Output format `json` or `text` (default `json`)                                      |

Records that fail schema validation are skipped with a stderr warning
and counted under `totals.skipped`.

## Global Options

| Flag        | Purpose                          |
| ----------- | -------------------------------- |
| `--help`    | Show help                        |
| `--version` | Show version                     |
| `--json`    | Emit help as JSON                |
