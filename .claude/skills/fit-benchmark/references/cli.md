# fit-benchmark CLI

## Global

| Flag         | Description                    |
| ------------ | ------------------------------ |
| `--help, -h` | Show help                      |
| `--version`  | Show version                   |
| `--json`     | Emit help as JSON              |

## `fit-benchmark run`

Execute every task in a family `runs` times and emit one `ResultRecord` per
`(task, runIndex)` to `<output>/results.jsonl`. Each record is also written
to stdout as a single JSON line for live visibility.

| Flag                 | Required | Default            | Description                                                                 |
| -------------------- | -------- | ------------------ | --------------------------------------------------------------------------- |
| `--family <path>`    | yes      | —                  | Task family root (local path or git URL)                                    |
| `--output <dir>`     | yes      | —                  | Run-output directory; receives `results.jsonl` and per-task traces          |
| `--runs <n>`         | no       | `1`                | Times each task is repeated                                                 |
| `--model <id>`       | no       | `claude-opus-4-7`  | Model id passed to every agent session                                      |
| `--agent-profile`    | no       | `null`             | Profile name for the agent-under-test (loaded from staged `.claude/agents`) |
| `--judge-profile`    | no       | `null`             | Profile name for the judge supervisor                                       |
| `--max-turns <n>`    | no       | `50`               | Agent-under-test budget                                                     |

The exit code is `0` when every record's `verdict === "pass"`, `1` otherwise.

## `fit-benchmark score`

Re-run a task's scoring against an existing post-run workdir. Writes a
`ScoringRecord` JSONL line (`{ taskId, scoring, exitCode }`); exits `0` on
scoring pass, `1` on fail.

| Flag                | Required | Description                                                                                                |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `--family <path>`   | yes      | Task family root                                                                                           |
| `--task <id>`       | yes      | METR-style id `task_family_name/task_name`                                                                 |
| `--workdir <path>`  | yes      | Post-run dir whose layout matches `WorkdirManager.start` output (`<workdir>/cwd/` is the agent CWD)        |
| `--output <path>`   | no       | Write the record to a file instead of stdout (append mode)                                                 |

## `fit-benchmark report`

Walks a run-output directory's `results.jsonl`, validates each record, and
computes pass@k.

| Flag              | Required | Default   | Description                                                          |
| ----------------- | -------- | --------- | -------------------------------------------------------------------- |
| `--input <dir>`   | yes      | —         | Run-output directory containing `results.jsonl`                      |
| `--k <list>`      | no       | `1,3,5`   | Comma-separated positive integers                                    |
| `--format <fmt>`  | no       | `json`    | `json` or `text` (Markdown table)                                    |

The pass@k formula is OpenAI HumanEval's unbiased estimator
`1 - C(n-c, k) / C(n, k)`. `k > n` produces a structured error row, not a
silent zero.

## Environment

| Variable                  | Effect                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Required for live SDK calls                                         |
| `FIT_BENCHMARK_VERSION`   | Override the version reported by `--version` (used by `bun build --compile`) |

## Scoring Script Contract

The harness invokes `<family>/tasks/<tf>/<task>/scoring/run.sh` from the
**template** path. The agent CWD never sees the script.

| Env             | Description                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------- |
| `WORKDIR`       | Absolute path to the agent's post-run CWD                                                   |
| `PORT`          | TCP port the harness allocated for the agent's app                                          |
| `RESULTS_FD`    | File descriptor number (default `3`) for NDJSON per-test rows `{ test, pass, message? }`    |

Exit `0` = pass; non-zero = fail. The fd-3 NDJSON is diagnostic — the exit
code is authoritative.

## Pre-flight Script Contract

Every task ships `workdir/scripts/preflight.sh` (executable). The harness
runs it before any agent session, in a fresh process group, with the same
`WORKDIR` / `PORT` env. Exit `0` means the scaffold boots; non-zero fails
the task with a `preflightError` record and zero agent cost.

## Result-record schema (selected fields)

| Field             | Notes                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `taskId`          | METR id `task_family_name/task_name`                                 |
| `runIndex`        | 0-based                                                              |
| `verdict`         | `"pass"` iff `scoring.verdict === "pass"` AND `judgeVerdict.verdict === "pass"` |
| `scoring`         | `{ verdict, details, exitCode }`                                     |
| `judgeVerdict`    | `{ verdict, summary }` — `success`/`failure` mapped to `pass`/`fail` |
| `submission`      | The agent's last assistant text block                                |
| `agentTracePath`  | Absolute path to the agent NDJSON trace                              |
| `judgeTracePath`  | Absolute path to the judge NDJSON trace                              |
| `costUsd`         | Total agent cost from the agent trace                                |
| `turns`           | Agent turn count                                                     |
| `skillSetHash`    | `sha256:` over LF-normalised `apm.lock.yaml` bytes                   |
| `familyRevision`  | `git:<sha>` for git families, `sha256:` for local paths              |
| `profiles`        | `{ agent, supervisor: null, judge }` — `supervisor` slot is unconditionally `null` in v1 |
| `model`           | Model id                                                             |
| `durationMs`      | Wall-clock from `start` to `teardown`                                |
| `preflightError`  | `{ phase, message, exitCode }` — present only on pre-flight failure  |
