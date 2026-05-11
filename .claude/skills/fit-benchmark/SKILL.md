---
name: fit-benchmark
description: >
  Run coding-agent task families across multiple runs, grade with hidden
  tests the agent cannot see, and aggregate pass@k across skill-set
  versions. Use when proving whether a skill-pack change improved coding
  outcomes.
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

`fit-eval` is the generic agent-evaluation plumbing. `fit-benchmark` is
the opinionated layer on top — a task-family format, hidden scoring,
post-hoc judge, and multi-run aggregation. Keeping the two separate
keeps `fit-eval` low-level while letting the benchmark layer evolve.

## Task Family Format

A task family is a directory laid out roughly like the
[METR Task Standard](https://github.com/METR/task-standard) — same
vocabulary (`task_family_name`, `task_name`, `instructions`, `submission`),
slightly different on-disk shape:

```
<family>/
  apm.lock.yaml          # skill-set manifest (hashed into skillSetHash)
  .claude/               # pre-staged skills + agent profiles
  tasks/<task_family_name>/<task_name>/
    instructions.md       # agent prompt
    supervisor.task.md    # reserved (v1 doesn't read it)
    judge.task.md         # judge prompt with {{SCORING}} and {{AGENT_TRACE_PATH}}
    specs/                # copied into agent CWD
    workdir/              # copied into agent CWD (excludes scripts/)
      scripts/preflight.sh  # smoke probe; exit 0 confirms scaffold
    scoring/              # template-only — never copied to agent CWD
      run.sh              # fd 3 = $RESULTS_FD for structured rows
```

Local paths and git URLs are both accepted. `familyRevision` becomes
`git:<sha>` for git URLs (HEAD at clone time) and `sha256:<digest>`
for local paths (canonical-tree hash over the file contents).

## Lifecycle

For each `(task, runIndex)` the harness drives:

1. **Setup** — copy `workdir/`, `specs/`, and the staged `.claude/` into a
   fresh per-task CWD. Allocate a free TCP port. Run `preflight.sh`.
2. **Agent** — run the coding agent on `instructions.md` with a fixed
   default tool allow-list (`Bash`, `Read`, `Glob`, `Grep`, `Write`,
   `Edit`).
3. **Score** — run `scoring/run.sh` from the template path. The exit
   code is authoritative for the verdict; fd 3 (`$RESULTS_FD=3`)
   carries optional NDJSON rows for diagnostic per-test details.
4. **Judge** — a separate session reads the scoring outcome and the
   agent trace and calls `Conclude` with `success` or `failure`.
5. **Teardown** — SIGTERM/SIGKILL the per-task process group, verify
   the port is free, and reap descendants.

## CLI

Install and run via npm:

```sh
npx fit-benchmark <command> [options]
```

The full flag surface lives in [references/cli.md](references/cli.md).

| Command | Purpose |
| --- | --- |
| `run` | Run every task N times against a family; append result records to `<output>/results.jsonl`. |
| `score` | Score a single task against a post-run workdir without invoking an agent. |
| `report` | Aggregate `results.jsonl` into pass@k via the OpenAI HumanEval estimator. |

## Typical Workflow

```sh
# 1. Run the family. One ResultRecord streams to stdout per (task, run).
npx fit-benchmark run \
  --family=./families/coding \
  --output=./runs/2026-05-11 \
  --runs=5 \
  --agent-profile=coder \
  --judge-profile=judge

# 2. Aggregate into pass@k.
npx fit-benchmark report --input=./runs/2026-05-11 --k=1,3,5 --format=text
```

## Grading Surfaces

`scoring/run.sh` decides "pass" or "fail" using any of three surfaces:

| Surface | Example |
| --- | --- |
| **Running service** | HTTP-probe `http://127.0.0.1:$PORT/` and assert the response shape. |
| **Repository state** | Assert the SHA-256 of `$WORKDIR/result.txt`. |
| **Process exit** | Run a command in `$WORKDIR` and treat exit-zero as pass. |

The exit code of `run.sh` is the verdict. Rows written to `fd 3` (i.e.
`$RESULTS_FD`) are surfaced on the result record as `scoring.details[]`
for diagnostic breakdowns.

## Result Records

One record per `(taskId, runIndex)`, appended one per line to
`<output>/results.jsonl`. Each record validates against a single
declared schema (see [`benchmark/result.js`](https://github.com/forwardimpact/monorepo/blob/main/libraries/libeval/src/benchmark/result.js)).
Records carry the skill-set hash, the family revision, the post-hoc judge
verdict, the absolute trace paths, the cost, the turn count, and (on
pre-flight failure) a `preflightError` describing why the scaffold
didn't boot.

## Handing Off to `fit-trace`

Each run produces two NDJSON traces — one for the agent under test and
one for the judge session. Both are consumable by `fit-trace overview`
for post-hoc analysis.

---

## Documentation

- [Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)
  — Author a coding-task family, run a benchmark across multiple runs,
  and read the pass@k report.
