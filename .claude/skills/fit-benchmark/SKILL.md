---
name: fit-benchmark
description: >
  Run a coding-agent task family multiple times against hidden grading and an independent
  judge. Aggregate pass@k across runs and across skill-set versions so a skill PR
  ships with measured evidence instead of subjective review.
---

# fit-benchmark

`fit-benchmark` is the layer above `fit-eval` for the specific question
Platform Builders need answered: **did this skill change improve coding-agent
outcomes?** Where `fit-eval supervise` runs one agent under one judge, the
benchmark layer runs an entire **task family** N times, scores each run
against grading material the agent never sees, and aggregates the result as
pass@k.

The published unit is a **task family** — a directory carrying the tasks,
skill-set manifest, and grading scripts. A family is portable: METR Task
Standard vocabulary (`task family`, `instructions`, `submission`, METR-style
`task_family_name/task_name` ids) keeps the format compatible with the broader
agent-evaluation ecosystem.

## When to Use

- After editing a `fit-*`/`kata-*` skill — run the family before and after,
  compare pass@k.
- When choosing between agent profiles — same family, different
  `--agent-profile`, compare.
- When promoting an agent to production — the result records carry the
  `skillSetHash` and `familyRevision` needed to reproduce a result months
  later.

## Subcommands

| Command  | What it does                                                                          |
| -------- | ------------------------------------------------------------------------------------- |
| `run`    | Execute every task in a family `runs` times; write result records to JSONL            |
| `score`  | Re-grade an existing post-run workdir without spending agent cost                     |
| `report` | Compute pass@k for any subset of k-values across the records of a previous run        |

The full flag surface lives in [references/cli.md](references/cli.md).

## CLI

```sh
npx fit-benchmark run \
  --family ./my-family \
  --output ./bench-out \
  --runs 5 \
  --judge-profile judge

npx fit-benchmark report --input ./bench-out --format text --k 1,3,5
```

The harness fails the family at install (before any agent session) if a
task's `workdir/scripts/preflight.sh` is missing or non-executable, or if
`--judge-profile` is set and the named profile is not staged under
`.claude/agents/`. Broken templates never spend agent cost.

## Family Layout

```
family-root/
├── apm.lock.yaml         # skillSetHash source — sha256 over LF-normalised bytes
├── .claude/              # pre-staged skills/agents
└── tasks/
    └── <task_family_name>/
        └── <task_name>/
            ├── instructions.md
            ├── judge.task.md             # uses {{SCORING}} and {{AGENT_TRACE_PATH}}
            ├── specs/                    # work specifications shipped to the agent CWD
            ├── workdir/                  # seed of the agent's working dir
            │   └── scripts/preflight.sh  # required, executable
            └── scoring/                  # hidden — never reaches the agent CWD
                └── run.sh                # exit code authoritative; fd 3 NDJSON for details
```

`scoring/` is invoked from the template path with `$WORKDIR` as an
environment variable — the harness never copies it.

## Result Records

One record per `(taskId, runIndex)` written to
`<output>/results.jsonl`, schema-validated at write time. Every record
carries the verdict, the scoring outcome (exit code authoritative; fd 3
NDJSON in `details`), the judge verdict, agent + judge trace paths,
`skillSetHash`, `familyRevision`, model id, and the `(agent, judge)`
profile names. Preflight failures produce a record with zero agent cost
and a `preflightError` field.

## Pass@k

`fit-benchmark report` computes the OpenAI HumanEval unbiased estimator
`pass@k = 1 - C(n-c, k) / C(n, k)` per `taskId`. The `--k` flag accepts a
comma-separated list of positive integers.

## Documentation

- [Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)
  — Author a coding-task family, run a benchmark across multiple runs, and
  read the pass@k report.
