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

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the environment
- `@forwardimpact/libharness` (ships `fit-harness`, `fit-trace`, and
  `fit-benchmark`). Install globally with
  `npm install -g @forwardimpact/libharness`, or invoke ephemerally in CI
  with `npx --yes @forwardimpact/libharness fit-benchmark ...`

## Author a Task Family

A task family is a directory of related coding tasks plus the skill-set
under test:

```text
my-coding-family/
  .env                                   # family env vars (committed defaults)
  .env.local                             # family secrets (gitignored)
  apm.yml                                # optional — skill-pack dependencies
  apm.lock.yaml                          # skill-set manifest (hashed)
  .claude/                               # pre-staged skills + agents
    skills/...
    agents/judge.md
  workdir/                               # optional — shared base copied into EVERY task CWD
  specs/                                 # optional — shared base copied into EVERY task CWD/specs
  tasks/todo-api/
    .env                                 # task env vars — loaded + rendered
    .env.local                           # task secrets — loaded + rendered (gitignored)
    agent.task.md                        # what the agent should build (required)
    judge.task.md                        # optional — judge prompt (see § judge.task.md)
    supervisor.task.md                   # optional — supervisor context
    hooks/                               # harness-only — never copied to agent CWD
      preflight.sh                       # optional — smoke probe
      invariants.sh                      # optional — structural checks; fd 3 = $RESULTS_FD
    tests/                               # optional — hidden test suite, staged + run by the harness
    specs/                               # copied into the agent CWD
    workdir/                             # copied into the agent CWD
```

Task IDs are directory names under `tasks/` (e.g. `todo-api`). The directory
splits into what the agent sees (`workdir/`, `specs/`, `.claude/`) and what the
harness keeps hidden (`hooks/` and `tests/`). The agent never receives the
grading material — that is the structural guarantee it cannot peek at the
tests.

### What the agent sees

#### `agent.task.md`

Plain markdown — the prompt the agent receives.

```md
Build a TODO API matching the spec under `specs/`. Listen on the port
exposed via the environment variable `PORT`. Respond to `GET /todos`
with a JSON array of TODO objects.
```

#### `workdir/`

Whatever scaffolding the agent should start with: a `package.json`, a
README, sample data — everything here is copied into the per-task CWD.

To share scaffolding across many tasks, put it in a **family-level**
`workdir/` (or `specs/`) at the family root. The harness copies that shared
base into every task's CWD first, then overlays the per-task `workdir/`/`specs/`
on top (a per-task file wins over a same-named family file). Present means
copied — the same convention as `hooks/`. This lets one app-under-test be
maintained once instead of duplicated per task.

### What the harness controls — `hooks/`

The `hooks/` directory holds lifecycle scripts the harness runs at
specific phases. Both scripts receive these environment variables, and
neither script is ever copied to the agent's working directory:

| Var | Value |
| --- | --- |
| `$AGENT_CWD` | The per-task agent CWD. |
| `$PORT` | A pre-allocated free TCP port. |
| `$TASK_ID` | The task name. |
| `$TASK_DIR` | The task directory on the host. |
| `$HOOKS_DIR` | The task's `hooks/` dir on the host — read hidden fixtures/tests from here. |
| `$FAMILY_DIR` | The family root on the host. |

`invariants.sh` additionally receives `$RESULTS_FD=3` (see below).

#### `hooks/preflight.sh`

Optional. Runs before the agent starts. Exit `0` means "scaffold is
healthy, hand off to the agent." A non-zero exit short-circuits the run
and produces a `preflightError` result record (cost zero, no agent
invoked). When the script is absent, the harness proceeds without a
pre-flight probe.

A preflight that starts a background service for the invariants probe to
test against:

```sh
#!/bin/sh
node "$AGENT_CWD/app.js" >/dev/null 2>&1 &
sleep 0.2
exit 0
```

The harness spawns the preflight in its own process group and tears down
the entire group (SIGTERM, grace period, SIGKILL) after the invariants
check completes — background processes do not leak across runs.

#### `hooks/invariants.sh`

Runs after the agent finishes. In addition to the shared hook env above,
it receives `$RESULTS_FD=3` — a file descriptor for structured check rows.

The **rows are authoritative**: every row is a check, and a row's role lives
in its own fields. `{"gate": true}` marks a gate (any failing gate fails the
run and zeroes the score); a plain row — or one with `"weight": w > 0` — is a
scored check contributing to the task's score; `{"weight": 0}` is an
ungraded diagnostic. The script's **exit code is script health only**:
nonzero means the grader itself failed, never that a check failed, so a
well-formed hook ends with `exit 0` unconditionally.

Use the script for structural checks — presence, shape, anti-tamper — with
`fit-trace assert` emitting the rows:

```sh
#!/bin/sh
set -u
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# A gate: the artifact must exist at all.
check api-present --gate --exists "$AGENT_CWD/src/api.js"
# Scored content checks — each contributes weight 1 to the score.
check has-get-route --grep 'GET /todos' "$AGENT_CWD/src/api.js"
check documents-port --grep 'PORT' "$AGENT_CWD/README.md"
exit 0
```

A probe that `assert` cannot express echoes its row JSON directly:

```sh
RESP="$(curl -sf --max-time 2 "http://127.0.0.1:$PORT/todos")"
if [ "$RESP" = '[]' ]; then
  printf '%s\n' '{"test":"probe","pass":true,"gate":true}' >&"$RESULTS_FD"
else
  printf '%s\n' '{"test":"probe","pass":false,"gate":true}' >&"$RESULTS_FD"
fi
exit 0
```

#### `tests/` — the hidden test suite

Behavioral checks — "does the code the agent wrote actually work?" — belong
in a hidden test suite, not hand-rolled shell. A task opts in with a
`tests/` directory beside `hooks/`; there is no manifest, the layout is the
contract:

- `tests/` is an **overlay mirror** of the agent CWD: a file's path under
  `tests/` is its staging path (`tests/test/filter.test.js` stages at
  `test/filter.test.js`).
- Every `*.test.js` file is one check, run with `node --test` from the agent
  CWD; the exit status becomes one row. `*.gate.test.js` marks a gate
  (e.g. a baseline regression suite); any other `*.test.js` is scored at
  weight 1. The check name is the filename stem.
- Every other file is support material — staged for the whole pass, never
  graded.

```text
tasks/todo-api/tests/
  test/baseline.gate.test.js    # gate — pre-existing behaviour must survive
  test/get-todos.test.js        # scored — one behaviour per file
  test/post-todo.test.js        # scored
  test/helpers.js               # support — staged, never graded
```

The harness stages each file (backing up collisions), runs the checks, and
restores the workdir to the state the agent left it — the judge grades the
agent's work, not the harness's scaffolding. Per-case files are what give a
task its capability gradient: an agent that solves three of four behaviours
scores 0.75 instead of recording the same `fail` as one that produced
nothing. An invalid tree (no check files, a dangling symlink, duplicate
check names) fails the family load before any agent spend.

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

### What the judge uses — `judge.task.md`

The post-hoc judge's prompt. The harness substitutes these template
variables before sending the prompt to the judge:

| Variable | Description |
| --- | --- |
| `{{AGENT_INSTRUCTIONS}}` | Contents of `agent.task.md` |
| `{{AGENT_PROFILE}}` | Agent profile body (empty string if none) |
| `{{AGENT_TRACE_PATH}}` | Absolute path to `agent.ndjson` |
| `{{GRADE_RESULT}}` | JSON grade object (verdict, gatesPass, score) plus the merged check rows |
| `{{SKILL_SET_HASH}}` | SHA-256 fingerprint from `apm.lock.yaml` |
| `{{TASK_ID}}` | Task name (directory under `tasks/`) |
| `{{TASK_DIR}}` | Agent working directory path |

```md
Grade outcome:

\`\`\`json
{{GRADE_RESULT}}
\`\`\`

The agent's full trace is at `{{AGENT_TRACE_PATH}}` — read it before
deciding. The agent was given task `{{TASK_ID}}` with these instructions:

{{AGENT_INSTRUCTIONS}}

Call `Conclude` with `verdict='success'` when the agent stayed within the
task's contract (no scope creep, no gaming the checks); `verdict='failure'`
otherwise.
```

The judge is a **binary gate protecting the grade's validity, never a
grade**: a failing judge forces the record's effective score to 0, but the
judge cannot adjust the mechanical score. It is also a separate session —
not the live supervisor. Mixing the "help the agent finish" incentive with
the "grade fairly" incentive is what the design avoids.

### What identifies the skill set — `.claude/` and `apm.lock.yaml`

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

## Environment Variables

The harness auto-discovers `.env` and `.env.local` files in the family
root and each task directory. Every discovered file is loaded into
`process.env` and rendered into the agent's working directory before
`preflight.sh` runs. `process.env` always wins — existing values are
never overwritten.

- **Locally:** put credentials in `.env.local` (gitignored).
- **In CI:** set secrets as repository env vars — no files needed.

### Example

A task that calls an LLM proxy:

```sh
# tasks/my-rag-task/.env.local (gitignored)
LLMHUB_NONPROD_API_KEY=your-key-here
LLMHUB_PROD_API_KEY=your-key-here
```

The harness renders this into the agent's CWD as `.env.local` with
values resolved from `process.env` (CI secrets override file defaults).
The task's `preflight.sh` can validate the file exists; the agent's
application reads credentials from it.

All discovered var names are added to the trace redaction allowlist.

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
- `./runs/2026-05-11/runs/<task-name>/<runIndex>/` — per-run artifacts:
  the agent CWD, the agent trace, the judge trace, the invariants stderr
  log.
- `./runs/2026-05-11/.apm-staging/.claude/` — staged skills/agents.

Each result record carries `skillSetHash`, `familyRevision`, the
combined verdict, invariants details, judge verdict + summary, cost, turn
count, and the absolute paths to both NDJSON traces. The record's
schema is validated at write time, so a malformed write is caught
before the report stage trips over it.

### Run Cells Concurrently

Cells — each `(task, runIndex)` pair — run concurrently by default, so a
family no longer takes the *sum* of every cell's wall-clock. Concurrency is
on without any flag: the default is CPU-aware (`min(4, max(2, cores/2))`).
Override it with `--concurrency=<n>` or the
`LIBHARNESS_BENCHMARK_CONCURRENCY` environment variable (the flag wins):

```sh
npx fit-benchmark run --family=./my-coding-family --runs=5 --concurrency=4
```

Concurrency does not change the pass@k a serial run would have produced —
records simply stream in completion order instead of grid order, and each
cell still lands in `results.jsonl` the moment it settles, so a cancelled
run keeps every completed cell. One stalled cell now occupies a single slot
instead of blocking the whole run.

## Grade One Task at a Time

For ad-hoc grading without an agent run:

```sh
npx fit-benchmark grade \
  --family=./my-coding-family \
  --task=todo-api \
  --run-dir=./runs/2026-05-11/runs/todo-api/0 \
  --output=grade.jsonl
```

`grade` runs both producers — the hidden `tests/` suite and
`hooks/invariants.sh` — with the same derivation the runner uses, and its
process exit mirrors the graded verdict. Useful when iterating on grading
material: re-grade an existing post-run workdir (or a hand-authored fixture)
without burning agent cost, and confirm a partial fixture yields the
fractional score you expect.

## Aggregate Into pass@k

```sh
npx fit-benchmark report \
  --input=./runs/2026-05-11 \
  --k=1,3,5 \
  --format=text
```

With `--format=text`, the report renders a full markdown document:

- **Summary** — overall pass rate, model, skill-set hash, cost, median
  duration, median turns.
- **Pass@k table** — one row per task with the unbiased HumanEval
  estimator: `pass@k = 1 - C(n-c, k) / C(n, k)`. When the ledger holds
  scored tasks, the table gains a `score` column (the mean effective score
  across runs) and one `score@k` column per k — the expected **best** score
  over k runs, the continuous analog of pass@k. Binary tasks render `—` in
  the score columns.
- **Task details** — per-task sections with a runs table, the merged check
  rows from both producers, judge commentary (blockquoted), and any agent,
  preflight, or malformed-row errors.

With `--format=json` (default), the output is the aggregated pass@k
data only — suitable for machine consumption and before/after diffs.

A `k > n` value emits a structured error row rather than a misleading
number.

`report --input` discovers every `results.jsonl` **recursively** under the
directory and unions the records before computing pass@k. A single run with
one `results.jsonl` is the trivial case; the same command merges the partial
ledgers produced by sharding (below) when you point it at a directory holding
each shard's output.

## Shard Across Machines

One machine has a ceiling — CPU, memory, and the CI per-job time limit. For a
large family, split the grid across machines with `--shard=<i>/<N>`: shard `i`
of `N` runs a deterministic, balanced subset of the cells and writes a partial
`results.jsonl` containing only its cells.

```sh
# On machine 1 of 3:
npx fit-benchmark run --family=./my-coding-family --runs=5 \
  --shard=1/3 --output=./runs/shard-1
# ...machines 2 and 3 run --shard=2/3 and --shard=3/3 into ./runs/shard-2, ./runs/shard-3
```

The `N` shards form an exact partition: every cell runs on exactly one shard,
none twice, none dropped. Assignment is at `(task, runIndex)` granularity and
round-robins across shards, so a slow task's runs spread out rather than
landing one whole task on a single machine. When `N` exceeds the cell count the
high-index shards select zero cells — a valid run with an empty ledger.

Collect the shard outputs under one directory and merge them into a single
pass@k — identical to what a non-sharded run over the same cells would
report — with the recursive `report --input`:

```sh
npx fit-benchmark report --input=./runs --k=1,3,5 --format=text
```

Each shard run also uses in-process concurrency internally, so effective
parallelism is `N` machines × the per-machine concurrency.

## Compare Before and After

The reproducibility claim is the heart of the tool. Run the family
twice, once with the old skill manifest and once with the new, then
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

<div class="grid">

<!-- part:card:ci-workflow -->
<!-- part:card:../run-eval -->
<!-- part:card:../trace-analysis -->

</div>
