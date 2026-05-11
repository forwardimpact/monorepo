---
title: Run a Benchmark
description: Prove a skill-pack change improved coding outcomes — run a task family across N runs, grade with hidden tests, and report pass@k.
---

You shipped a skill-pack change — a new `kata-spec` rule, a tweak to a
`fit-pathway` profile, an updated tool allowlist. The next question is the
hard one: did agents get better at writing code? A single agent run is a
coin flip, and a passing eval doesn't generalise. `fit-benchmark` runs each
coding task **N times** against a **versioned skill-set manifest**, grades
each run with tests the agent never sees, and aggregates pass@k using the
OpenAI HumanEval unbiased estimator.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` set in the environment
- `@forwardimpact/libeval` (ships `fit-eval`, `fit-trace`, and
  `fit-benchmark`). Install globally with
  `npm install -g @forwardimpact/libeval`, or invoke ephemerally in CI
  with `npx --yes @forwardimpact/libeval fit-benchmark ...`

## Author a Task Family

A task family is a directory of related coding tasks plus the skill-set
under test:

```
my-coding-family/
  apm.lock.yaml                          # skill-set manifest (hashed)
  .claude/                               # pre-staged skills + agents
    skills/...
    agents/judge.md
  tasks/coding/todo-api/
    instructions.md                      # what the agent should build
    judge.task.md                        # judge prompt; use {{SCORING}} and {{AGENT_TRACE_PATH}}
    supervisor.task.md                   # reserved (v1 doesn't read it)
    specs/                               # copied into the agent CWD
    workdir/                             # copied into the agent CWD (excludes scripts/)
      scripts/preflight.sh               # smoke probe; exit 0 confirms scaffold
    scoring/                             # NEVER copied; hidden from the agent
      run.sh                             # fd 3 (= $RESULTS_FD) carries optional details
```

The vocabulary follows the
[METR Task Standard](https://github.com/METR/task-standard): `task family`,
`task_family_name/task_name`, `instructions`, `submission`. The on-disk
shape differs slightly so the hidden `scoring/` directory lives only in the
template — `WorkdirManager` never copies it, which is the structural
guarantee that the agent cannot peek.

### `instructions.md`

Plain markdown — the prompt the agent receives.

```md
Build a TODO API matching the spec under `specs/`. Listen on the port
exposed via the environment variable `PORT`. Respond to `GET /todos`
with a JSON array of TODO objects.
```

### `workdir/`

Whatever scaffolding the agent should start with: a `package.json`, a
README, sample data — anything checked in here ends up in the per-task
CWD. The `scripts/` subdirectory is **not** copied; it is the home of
`preflight.sh`.

### `workdir/scripts/preflight.sh`

A smoke probe the harness runs before the agent starts. It receives:

- `$WORKDIR` — the per-task agent CWD (already populated with `workdir/`
  + `specs/` + the staged `.claude/`).
- `$PORT` — a free TCP port the harness allocated.

Exit `0` means "scaffold is healthy, hand off to the agent." A non-zero
exit short-circuits the run and produces a `preflightError` result
record (cost zero, no agent invoked). Tasks that need no probe can
`exit 0` immediately. The harness fails the family at install time if
any task is missing this script or it is not executable.

### `scoring/run.sh`

The hidden grader. Lives only in the family template — never copied to
the agent's CWD. The harness invokes it from the template path with:

- `$WORKDIR` — the post-run agent CWD.
- `$PORT` — the same port `preflight.sh` saw.
- `$RESULTS_FD=3` — a parent-readable file descriptor for structured
  per-test rows.

The **exit code is authoritative**: `0` is pass, anything else is fail.
Rows written to fd 3 are stored on the result record's `scoring.details`
for diagnostics; they cannot override the verdict.

Three grading surfaces are in scope:

```sh
# Running-service probe
RESP="$(curl -sf --max-time 2 "http://127.0.0.1:$PORT/todos")"
test "$RESP" = '[]' && exit 0 || exit 1
```

```sh
# Repository state
sha256sum "$WORKDIR/dist/build.tar.gz" \
  | grep -q '^expected-sha256-prefix' && exit 0 || exit 1
```

```sh
# Process exit
( cd "$WORKDIR" && bun test ) && exit 0 || exit 1
```

#### Writing to fd 3 from non-bash interpreters

Bash makes fd-3 writing trivial via `>&"$RESULTS_FD"`. From other
languages you open fd 3 explicitly:

```python
import json, os
fd = int(os.environ["RESULTS_FD"])
with os.fdopen(fd, "w") as f:
    f.write(json.dumps({"test": "t1", "pass": True}) + "\n")
```

```js
const fs = require("node:fs");
const fd = Number(process.env.RESULTS_FD);
fs.writeSync(fd, JSON.stringify({ test: "t1", pass: true }) + "\n");
```

### `judge.task.md`

The post-hoc judge's prompt. The harness substitutes two placeholders:

- `{{SCORING}}` — the JSON-stringified scoring outcome.
- `{{AGENT_TRACE_PATH}}` — an absolute path to the agent-under-test's
  NDJSON trace.

```md
Scoring outcome:

\`\`\`json
{{SCORING}}
\`\`\`

The agent's full trace is at `{{AGENT_TRACE_PATH}}` — read it before
deciding.

Call `Conclude` with `verdict='success'` when both:

1. `scoring.verdict === "pass"`, and
2. the agent did not violate the test contract (e.g. by editing the
   test file).
```

The judge is a separate session — not the live supervisor. Mixing the
"help the agent finish" incentive with the "grade fairly" incentive is
what the design avoids.

### `.claude/` and `apm.lock.yaml`

The pre-staged `.claude/` tree carries the skills and agent profiles the
agent will see. `apm.lock.yaml` is the **manifest under test** — the
harness hashes its bytes (LF-normalised) into `skillSetHash` on every
result record. A one-byte change to the lockfile produces a different
hash, which is how comparing "before-skill-change" vs
"after-skill-change" runs becomes apples-to-apples.

> **Caveat.** `skillSetHash` covers the lockfile bytes only. If you edit
> `.claude/` directly without regenerating the lockfile, the hash won't
> reflect the change. Always re-run your packing tool after editing
> `.claude/`.

## Run It

```sh
npx fit-benchmark run \
  --family=./my-coding-family \
  --output=./runs/2026-05-11 \
  --runs=5 \
  --agent-profile=coder \
  --judge-profile=judge \
  --max-turns=80
```

Output:

- `./runs/2026-05-11/results.jsonl` — append-only, one record per
  `(task, runIndex)`. Survives partial failures.
- `./runs/2026-05-11/runs/<task_family>__<task_name>/<runIndex>/` — per-run
  artifacts: the agent CWD, the agent trace, the judge trace, the
  scoring stderr log.
- `./runs/2026-05-11/.apm-staging/.claude/` — staged skills/agents.

Each result record carries `skillSetHash`, `familyRevision`, the
combined verdict, scoring details, judge verdict + summary, cost, turn
count, and the absolute paths to both NDJSON traces. The record's
schema is validated at write time, so a malformed write is caught
before the report stage trips over it.

## Score One Task at a Time

For ad-hoc grading without an agent run:

```sh
npx fit-benchmark score \
  --family=./my-coding-family \
  --task=coding/todo-api \
  --workdir=./runs/2026-05-11/runs/coding__todo-api/0 \
  --output=score.jsonl
```

Useful when iterating on a `scoring/run.sh` script: re-grade an existing
post-run workdir without burning agent cost.

## Aggregate Into pass@k

```sh
npx fit-benchmark report \
  --input=./runs/2026-05-11 \
  --k=1,3,5 \
  --format=text
```

The estimator is the OpenAI HumanEval unbiased form:

`pass@k = 1 - C(n - c, k) / C(n, k)`

where `n` is the number of runs and `c` is the number of passing runs.
The report groups by `taskId` and emits pass@k for each k value. A
`k > n` value emits a structured error row rather than a misleading
number.

## Compare Before and After

The reproducibility claim is the heart of the tool. Run the family
twice — once with the old skill manifest, once with the new — and
compare:

```sh
# Before
npx fit-benchmark run --family=./my-coding-family --output=./runs/before --runs=10
npx fit-benchmark report --input=./runs/before --format=json > before.json

# After (manifest changed)
npx fit-benchmark run --family=./my-coding-family --output=./runs/after --runs=10
npx fit-benchmark report --input=./runs/after --format=json > after.json
```

Each record carries `skillSetHash`, so any cross-comparison script can
verify the two reports came from materially different skill sets before
declaring an improvement.

## What's Next

- [Run an Eval](/docs/libraries/prove-changes/run-eval/) — the single-run
  agent-as-judge eval `fit-benchmark` builds on.
- [Analyze Traces](/docs/libraries/prove-changes/trace-analysis/) — read
  the agent and judge traces with `fit-trace`.
- [Prove Agent Changes](/docs/libraries/prove-changes/) — the end-to-end
  workflow `fit-benchmark` sits inside.
