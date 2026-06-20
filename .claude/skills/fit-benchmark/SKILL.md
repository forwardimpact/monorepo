---
name: fit-benchmark
description: >
  Prove whether a skill-pack change made agents better at writing code.
  Use when a single passing eval doesn't prove anything and you need
  multi-run pass@k evidence, when grading coding tasks with hidden tests
  the agent cannot see, or when comparing outcomes across skill-set
  versions.
---

# fit-benchmark

`fit-benchmark` answers one question Platform Builders care about: did our
skills (the `fit-*` / `kata-*` packs) make agents better at writing code?
A single agent run is a coin flip; one passing eval doesn't prove anything.
`fit-benchmark` runs each coding task N times across a skill-set
manifest, grades each run against tests that never enter the agent's
working directory, and reports pass@k using the OpenAI HumanEval
unbiased estimator.

## Why a Separate Tool

`fit-eval` is the generic agent-evaluation plumbing; `fit-benchmark` is the
opinionated layer on top — task-family format, hidden invariant checks,
post-hoc judge, and multi-run aggregation.

## Task Family Format

A task family is a directory of related coding tasks plus the skill-set
under test:

```
<family>/
  apm.yml                # optional — skill-pack dependencies
  apm.lock.yaml          # skill-set manifest (hashed into skillSetHash)
  .env / .env.local      # env vars — loaded + rendered into each agent CWD
  .claude/               # pre-staged skills + agent profiles
  workdir/               # optional — shared base copied into EVERY task CWD
  specs/                 # optional — shared base copied into EVERY task CWD/specs
  tasks/<task-name>/
    agent.task.md         # agent prompt (required)
    .env / .env.local     # task env vars — loaded + rendered (gitignored)
    supervisor.task.md    # optional — supervisor context for the relay
    judge.task.md         # optional — judge prompt (see § Judge Template Variables)
    hooks/preflight.sh    # optional — smoke probe; exit 0 confirms scaffold
    hooks/invariants.sh   # optional — fd 3 = $RESULTS_FD for structured rows
    specs/                # copied into agent CWD (overlays family specs/)
    workdir/              # copied into agent CWD (overlays family workdir/)
```

Task IDs are directory names under `tasks/`. Local paths and git URLs
are both accepted.

**Family-level shared fixtures.** A `<family>/workdir/` or `<family>/specs/`
is copied into every task's agent CWD as a shared base, then the per-task
`workdir/`/`specs/` overlay on top (a per-task file wins over a same-named
family file). Convention over configuration: present means copied, like
`hooks/`. Use it to maintain one fixture (e.g. an app under test) across many
tasks instead of duplicating it per task.

## Environment Variables

The harness auto-discovers `.env`/`.env.local` in the family root and each task
directory, merges them into `process.env` (which wins), renders the result into
the agent CWD before `preflight.sh`, and adds every discovered name to the
redaction allowlist. Locally use `.env.local` (gitignored); in CI set secrets
as env vars.

## Lifecycle

For each `(task, runIndex)` the harness drives:

1. **Setup** — copy the family-level `workdir/`/`specs/` (if present), then the
   per-task `workdir/`/`specs/`, then the staged `.claude/`, into a fresh
   per-task CWD. Allocate a free TCP port. Run `hooks/preflight.sh`.
2. **Agent** — run the coding agent on `agent.task.md` with a default
   tool allow-list (`Bash`, `Read`, `Glob`, `Grep`, `Write`, `Edit`,
   `Agent`, `TodoWrite`). Override with `--allowed-tools`.
3. **Invariants** — run `hooks/invariants.sh` from the template path. The
   exit code is authoritative for the verdict; fd 3 (`$RESULTS_FD=3`)
   carries optional NDJSON rows for diagnostic per-check details.
4. **Judge** — a separate session reads the invariants outcome and the
   agent trace and calls `Conclude` with `success` or `failure`.
5. **Teardown** — SIGTERM/SIGKILL the per-task process group, verify
   the port is free, and reap descendants.

### Hook Environment Variables

`preflight.sh` and `invariants.sh` both receive these (so hooks reference real
paths instead of reconstructing them from `$0`):

| Var | Value |
| --- | --- |
| `AGENT_CWD` | Agent CWD (the per-task copy) — reference emitted files as `$AGENT_CWD/<path>`. |
| `PORT` | Allocated free TCP port. |
| `TASK_ID` | Task name (directory under `tasks/`). |
| `TASK_DIR` | Task directory on the host. |
| `HOOKS_DIR` | The task's `hooks/` dir on the host — read hidden fixtures/tests from here. |
| `FAMILY_DIR` | Family root on the host. |
| `RESULTS_FD` | `invariants.sh` only — fd for NDJSON per-check rows (`=3`). |

## CLI

Install and run via npm:

```sh
npx fit-benchmark <command> [options]
```

The full flag surface lives in [references/cli.md](references/cli.md); task-authoring guidance (local skills, invariants, fast iteration, file-grading) in [references/authoring.md](references/authoring.md).

## GitHub Action

The `forwardimpact/fit-benchmark@v1` composite action wraps the CLI: it
installs deps, runs the benchmark, appends the report to the step summary, and
uploads `results.jsonl`.

```yaml
- uses: forwardimpact/fit-benchmark@v1
  with:
    family: ./benchmarks/my-family
    runs: "5"
    judge-profile: judge
```

All CLI `run` flags are action inputs, plus CI extras (`summary`,
`upload-results`, `artifact-name`, `timeout-minutes`, `k`, `format`) and a
`results-path` output — see the action README.

| Command | Purpose |
| --- | --- |
| `run` | Run every task N times against a family; append result records to `<output>/results.jsonl`. |
| `invariants` | Check a single task's invariants against a post-run workdir without invoking an agent. |
| `report` | Aggregate `results.jsonl` into pass@k, invariant checks, judge commentary, and operational stats. |

## Typical Workflow

```sh
npx fit-benchmark run \
  --family=./families/coding \
  --agent-profile=coder \
  --judge-profile=judge   # one ResultRecord per (task, run) to stdout

npx fit-benchmark report --format=text   # aggregate into pass@k
```

## Judge Template Variables

The `judge.task.md` template supports these variables:

| Variable | Source |
| --- | --- |
| `{{AGENT_INSTRUCTIONS}}` | Contents of `agent.task.md` |
| `{{AGENT_PROFILE}}` | Agent profile body (empty string if none) |
| `{{AGENT_TRACE_PATH}}` | Path to `agent.ndjson` |
| `{{INVARIANTS_RESULT}}` | JSON invariants object (verdict, details, exitCode) |
| `{{SKILL_SET_HASH}}` | SHA-256 fingerprint from `apm.lock.yaml` |
| `{{TASK_ID}}` | Task name (directory under `tasks/`) |
| `{{TASK_DIR}}` | Agent working directory path |

## Grading Surfaces

`hooks/invariants.sh` decides pass/fail via any of three surfaces:

| Surface | Example |
| --- | --- |
| **Running service** | HTTP-probe `http://127.0.0.1:$PORT/` and assert the response shape. |
| **Repository state** | Assert the SHA-256 of `$AGENT_CWD/result.txt`. |
| **Process exit** | Run a command in `$AGENT_CWD` and treat exit-zero as pass. |

## Result Records

One record per `(taskId, runIndex)`, appended to `<output>/results.jsonl`,
each validating against a declared schema (see
[`benchmark/result.js`](https://github.com/forwardimpact/monorepo/blob/main/libraries/libeval/src/benchmark/result.js)).
Records carry the skill-set hash, family revision, judge verdict, trace paths,
cost, turn count, and (on pre-flight failure) a `preflightError`.

## Handing Off to `fit-trace`

Each run produces agent and judge NDJSON traces, both consumable by
`fit-trace overview --file <trace>`.

---

## Documentation

- [Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)
  — Author a coding-task family, run a benchmark across multiple runs,
  and read the pass@k report.
- [Automate with GitHub Actions](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md)
  — Run benchmarks in CI with the forwardimpact/fit-benchmark action.
