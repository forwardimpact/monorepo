# fit-benchmark CLI Reference

Install and run via npm:

```sh
npx fit-benchmark <command> [options]
```

## Commands

| Command  | Purpose                                                       |
| -------- | ------------------------------------------------------------- |
| `run`    | Run every task in a family for N runs                         |
| `score`  | Score one task against a post-run workdir (no agent invoked)  |
| `report` | Aggregate results into pass@k via the HumanEval estimator     |

## `run` options

| Flag               | Required | Purpose                                                                                          |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `--family`         | yes      | Path or git URL of the task family                                                               |
| `--output`         | yes      | Run-output directory (created if missing)                                                        |
| `--runs`           | no       | Runs per task (default `1`)                                                                      |
| `--model`          | no       | Claude model id (default `claude-opus-4-7[1m]`)                                                  |
| `--agent-profile`  | no       | Agent-under-test profile name                                                                    |
| `--judge-profile`  | no       | Judge profile name                                                                               |
| `--max-turns`      | no       | Agent turn budget (default `50`; `0` = unlimited)                                                |

`run` writes one JSON line per result record to stdout for visibility,
and appends the same record to `<output>/results.jsonl` for the report
subcommand. Exit code is `0` if every record's combined verdict is
`pass`, otherwise `1`.

## `score` options

| Flag         | Required | Purpose                                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------------------------- |
| `--family`   | yes      | Path or git URL of the task family                                                       |
| `--task`     | yes      | METR-style task id (`task_family_name/task_name`)                                        |
| `--workdir`  | yes      | Post-run directory. `<workdir>/cwd/` is the agent CWD; scoring runs against it.          |
| `--output`   | no       | Output file path (defaults to stdout; one JSONL line)                                    |

`score` emits a `ScoringRecord` (narrower than the full `ResultRecord` —
it skips agent and judge fields because no agent was invoked). Exit
`0` on pass, `1` on fail.

## `report` options

| Flag       | Required | Purpose                                                                              |
| ---------- | -------- | ------------------------------------------------------------------------------------ |
| `--input`  | yes      | Run-output directory containing `results.jsonl`                                      |
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
