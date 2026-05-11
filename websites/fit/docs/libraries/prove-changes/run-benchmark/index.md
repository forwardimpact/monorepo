---
title: Run a Benchmark
description: Author a coding-task family, run a benchmark across multiple runs, and read the pass@k report.
---

You changed a skill, an agent profile, or a tool allowlist — and now you need
to know whether coding-agent outcomes actually improved. `fit-benchmark` runs a
**family** of coding tasks N times, scores each run against hidden grading
material the agent cannot see, asks an independent judge to confirm the
verdict, and aggregates the results as pass@k across the family.

The harness composes three ideas that the one-off `fit-eval supervise`
invocation does not give you: a reusable task layout (METR Task Standard
vocabulary), a grading pass the agent cannot peek at, and aggregation across
runs and tasks so a single coin-flip session does not stand in for a measured
outcome.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` set in the environment
- `@forwardimpact/libeval` (ships `fit-eval`, `fit-trace`, and
  `fit-benchmark`). Install globally with
  `npm install -g @forwardimpact/libeval`, or invoke ephemerally with
  `npx --yes @forwardimpact/libeval fit-benchmark ...`

## Author a task family

A family is a directory. The harness reads:

```
my-family/
├── apm.yaml              # libpack-managed pack manifest
├── apm.lock.yaml         # libpack-managed lockfile — fingerprint of the skill set
├── .claude/              # pre-staged skills/agents (run `bunx fit-skills sync` after edits)
│   ├── skills/
│   └── agents/
└── tasks/
    └── todo-api/                  # task_family_name
        ├── basic/                 # task_name → METR id "todo-api/basic"
        │   ├── instructions.md
        │   ├── judge.task.md
        │   ├── specs/             # work specifications shipped to the agent CWD
        │   ├── workdir/           # seed contents of the agent's working dir
        │   │   └── scripts/
        │   │       └── preflight.sh
        │   └── scoring/           # NEVER reaches the agent — hidden grading material
        │       └── run.sh
        └── strict/                # another task in the same family
```

Two structural rules the harness enforces:

- `scoring/` is hidden. Every task's grading material lives only on the
  template path. The harness invokes the scoring script with `$WORKDIR` as
  an environment variable — the script reads the agent's working directory
  but the agent cannot read the scoring script.
- `workdir/scripts/preflight.sh` is required and must be executable. The
  harness runs it before any agent session; non-zero exit fails the task
  with a pre-flight record and zero agent cost.

`apm.lock.yaml` is the **skill-set fingerprint**. The result record's
`skillSetHash` is a sha256 over the lockfile's LF-normalised bytes — a
single-byte change flips the hash so two runs against different skill-set
versions are distinguishable. Regenerate the lockfile after every change to
`.claude/` (run `bunx fit-skills sync` at the family root). The lockfile
must be named `apm.lock.yaml`; `apm.lock.yml` is rejected with a pointed
error.

## Write the judge prompt

Each task's `judge.task.md` is the prompt for the judge supervisor. The
runner substitutes two placeholders before the prompt reaches the model:

| Placeholder            | Replaced by                                |
| ---------------------- | ------------------------------------------ |
| `{{SCORING}}`          | JSON-stringified `{ verdict, details, exitCode }` |
| `{{AGENT_TRACE_PATH}}` | absolute path to the agent-under-test's NDJSON trace |

```md
<!-- tasks/todo-api/basic/judge.task.md -->
The agent was asked to build a TODO API. The scoring script reports:

```json
{{SCORING}}
```

Read the agent's trace at {{AGENT_TRACE_PATH}} if you need context on how
they arrived at the result. Call `Conclude` with `verdict: "success"` only
when every scoring detail row is `pass: true`.
```

If the placeholders are not present in `judge.task.md`, the harness does
not inject them — the substitution is opt-in so authors who want to scope
the judge to just the agent trace (or to just scoring) can do so.

## Write a scoring script

The scoring script speaks two channels:

1. **Exit code** — authoritative for the verdict. `exit 0` is pass; any
   non-zero is fail. The result record's `scoring.verdict` tracks this.
2. **File descriptor 3** — diagnostic per-test rows as NDJSON
   (`{ test, pass, message? }`). The harness sets `RESULTS_FD=3` so
   scripts can write portably.

```sh
#!/usr/bin/env bash
# tasks/todo-api/basic/scoring/run.sh

cd "$WORKDIR"
if curl -fsS "http://127.0.0.1:$PORT/tasks" >/dev/null; then
  printf '{"test":"GET /tasks 200","pass":true}\n' >&"$RESULTS_FD"
  exit 0
fi
printf '{"test":"GET /tasks 200","pass":false}\n' >&"$RESULTS_FD"
exit 1
```

Other interpreters work — fd 3 is just a POSIX pipe. In Python:

```python
#!/usr/bin/env python3
# tasks/todo-api/basic/scoring/run.sh
import json, os, sys
fd = int(os.environ["RESULTS_FD"])
with os.fdopen(fd, "w") as r:
    r.write(json.dumps({"test": "smoke", "pass": True}) + "\n")
sys.exit(0)
```

In Node:

```js
#!/usr/bin/env node
// tasks/todo-api/basic/scoring/run.sh
const fs = require("node:fs");
const fd = Number(process.env.RESULTS_FD);
fs.writeSync(fd, JSON.stringify({ test: "smoke", pass: true }) + "\n");
process.exit(0);
```

The harness uses POSIX scoring channels in v1; Windows is deferred.

## Run the benchmark

```sh
npx fit-benchmark run \
  --family ./my-family \
  --output ./bench-out \
  --runs 5 \
  --judge-profile judge
```

Each task runs five times. The harness:

1. Materialises `apm.lock.yaml` and the family's `.claude/` into a staging
   directory.
2. For each `(task, runIndex)`: creates a fresh CWD, copies `workdir/` and
   `specs/` into it, overlays the staged `.claude/`, allocates a free TCP
   port, runs `preflight.sh`, hands the agent the task's `instructions.md`,
   runs `scoring/run.sh` from the template path, runs the judge supervisor
   against `judge.task.md`, and writes one result record to
   `bench-out/results.jsonl`.
3. Tears down the per-task process group (SIGTERM, 5 s grace, SIGKILL)
   between runs.

Agent traces land at `bench-out/runs/<task_family>__<task_name>/<runIndex>/agent.ndjson`,
judge traces at `judge.ndjson` next to it.

## Read the report

```sh
npx fit-benchmark report --input ./bench-out --k 1,3,5 --format text
```

```text
| taskId         | n | c | pass@1 | pass@3 | pass@5 |
| --- | --- | --- | --- | --- | --- |
| todo-api/basic | 5 | 2 | 0.4000 | 0.9000 | 1.0000 |

Totals — tasks: 1, runs: 5, skipped: 0
```

The estimator is the OpenAI HumanEval unbiased formula
`pass@k = 1 - C(n-c, k) / C(n, k)`. When `k > n` the report emits the
row as `n/a` (or a `{ value: null, error: "k > n" }` shape in JSON output)
so missing data is not silently filled with zeroes.

Two runs against the same skill-set manifest produce result records with
the same `skillSetHash`. A one-byte change to `.claude/` plus a fresh
`apm.lock.yaml` flips the hash so before/after experiments are
distinguishable on the same `taskId`.

## Score without spending agent cost

When a run leaves a populated workdir behind and you want to re-grade
without re-running the agent:

```sh
npx fit-benchmark score \
  --family ./my-family \
  --task todo-api/basic \
  --workdir ./bench-out/runs/todo-api__basic/0
```

The `score` subcommand writes a `ScoringRecord` (`{ taskId, scoring,
exitCode }`) to stdout (or `--output`). It does not write a full
`ResultRecord` — that schema is reserved for benchmark-run outputs.

## What's next

<div class="grid">
<!-- part:card:../run-eval -->
<!-- part:card:../trace-analysis -->
<!-- part:card:.. -->
</div>
