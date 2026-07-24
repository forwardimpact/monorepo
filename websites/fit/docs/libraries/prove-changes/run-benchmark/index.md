---
title: Run a Benchmark
description: Prove a skill-pack change improved coding outcomes. Run a task family across N runs, grade with hidden tests, and report pass@k.
---

You shipped a skill-pack change. It might be a new `kata-spec` rule, a tweak to
a `fit-pathway` profile, or an updated tool allowlist. The hard question comes
next. You must find out whether agents now write better code. A single agent
run is a coin flip. A passing eval does not generalise. `gemba-benchmark` runs
each coding task **N times** against a **versioned skill-set manifest**. It
grades each run with tests the agent never sees. It then aggregates pass@k with
the unbiased estimator from OpenAI HumanEval.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the environment
- `@forwardimpact/libharness` (ships `gemba-harness`, `gemba-trace`, and
  `gemba-benchmark`). Install it globally with
  `npm install -g @forwardimpact/libharness`. Or invoke it ephemerally in CI
  with `npx --yes @forwardimpact/libharness gemba-benchmark ...`

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
material that grades it. That structure is the guarantee that the agent cannot
peek at the tests.

### What the agent sees

#### `agent.task.md`

Plain markdown. The file holds the prompt the agent receives.

```md
Build a TODO API matching the spec under `specs/`. Listen on the port
exposed via the environment variable `PORT`. Respond to `GET /todos`
with a JSON array of TODO objects.
```

#### `workdir/`

Whatever scaffolding the agent should start with: a `package.json`, a
README, sample data. The harness copies everything here into the per-task CWD.

To share scaffolding across many tasks, put it in a **family-level**
`workdir/` (or `specs/`) at the family root. The harness copies that shared
base into every task's CWD first. It then overlays the per-task
`workdir/`/`specs/` on top. A per-task file wins over a same-named family file.
Present means copied. This is the same convention as `hooks/`. You then
maintain one app-under-test once instead of one copy per task.

### What the harness controls — `hooks/`

The `hooks/` directory holds lifecycle scripts the harness runs at
specific phases. The harness never copies either script to the agent's
working directory. Both scripts receive these environment variables:

| Var | Value |
| --- | --- |
| `$AGENT_CWD` | The per-task agent CWD. |
| `$PORT` | A pre-allocated free TCP port. |
| `$TASK_ID` | The task name. |
| `$TASK_DIR` | The task directory on the host. |
| `$HOOKS_DIR` | The task's `hooks/` dir on the host. Read hidden fixtures/tests from here. |
| `$FAMILY_DIR` | The family root on the host. |

`invariants.sh` also receives `$RESULTS_FD=3` (see below).

#### `hooks/preflight.sh`

Optional. The script runs before the agent starts. Exit `0` means "scaffold is
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

The harness spawns the preflight in its own process group. It tears down
the entire group (SIGTERM, grace period, SIGKILL) after the invariants
check completes. Background processes do not leak across runs.

#### `hooks/invariants.sh`

The script runs after the agent finishes. It receives the shared hook env
above. It also receives `$RESULTS_FD=3`, a file descriptor for structured
check rows.

The **rows are authoritative**. Every row is a check. A row's role lives in
its own fields. `{"gate": true}` marks a gate. If a gate fails, the run fails
and the score becomes zero. A plain row is a scored check that adds to the
task's score. A row with `"weight": w > 0` is also a scored check.
`{"weight": 0}` is an ungraded diagnostic. The script's **exit code is script
health only**. A nonzero code means the grader itself failed. It never means
a check failed. So a well-formed hook ends with `exit 0` unconditionally.

Use the script for structural checks: presence, shape, and anti-tamper.
`gemba-trace assert` emits the rows:

```sh
#!/bin/sh
set -u
check() { gemba-trace assert "$@" >&"$RESULTS_FD" || true; }

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

Behavioral checks answer whether the code the agent wrote actually works.
These checks belong in a hidden test suite. Hand-rolled shell does not hold
them. A task opts in with a `tests/` directory beside `hooks/`. There is no
manifest. The layout is the contract:

- `tests/` is an **overlay mirror** of the agent CWD. A file's path under
  `tests/` is the path where it stages (`tests/test/filter.test.js` stages at
  `test/filter.test.js`).
- Every `*.test.js` file is one check. The harness runs it with `bun test`
  from the agent CWD. The exit status becomes one row. `*.gate.test.js` marks
  a gate (e.g. a baseline regression suite). Any other `*.test.js` scores at
  weight 1. The check name is the filename stem.
- Every other file is support material. The harness stages it for the whole
  pass and never grades it.

```text
tasks/todo-api/tests/
  test/baseline.gate.test.js    # gate — pre-existing behaviour must survive
  test/get-todos.test.js        # scored — one behaviour per file
  test/post-todo.test.js        # scored
  test/helpers.js               # support — staged, never graded
```

The harness stages each file and backs up collisions. It runs the checks. It
then restores the workdir to the state the agent left it. The judge grades the
agent's work. The judge does not grade the harness's scaffolding. Per-case
files give a task its capability gradient. An agent that solves three of four
behaviours scores 0.75. Without per-case files it would record the same `fail`
as an agent that produced nothing. An invalid tree (no check files, a dangling
symlink, duplicate check names) fails the family load before any agent spend.

#### Write to fd 3 from non-bash interpreters

Bash makes a write to fd 3 trivial with `>&"$RESULTS_FD"`. From other
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
variables before it sends the prompt to the judge:

| Variable | Description |
| --- | --- |
| `{{AGENT_INSTRUCTIONS}}` | Contents of `agent.task.md` |
| `{{AGENT_PROFILE}}` | Agent profile body (empty string if none) |
| `{{AGENT_TRACE_PATH}}` | Absolute path to the cell's agent lane, `trace--<case>--agent.agent.ndjson` |
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

The judge is a **binary gate that protects the grade's validity**. The judge
is never a grade. A judge that fails forces the record's effective score to 0.
The judge cannot adjust the mechanical score. The judge also runs in a
separate session. It is not the live supervisor. The design avoids a mix of
the "help the agent finish" incentive with the "grade fairly" incentive.

### What identifies the skill set — `.claude/` and `apm.lock.yaml`

The pre-staged `.claude/` tree carries the skills and agent profiles the
agent will see. `apm.lock.yaml` is the **manifest under test**. The harness
hashes its bytes (LF-normalised) into `skillSetHash` on every result record.
A one-byte change to the lockfile produces a different hash. That hash lets
you compare "before-skill-change" runs against "after-skill-change" runs
apples-to-apples.

> **Caveat.** `skillSetHash` covers the lockfile bytes only. If you edit
> `.claude/` directly and do not regenerate the lockfile, the hash will not
> reflect the change. Always run your packing tool again after you edit
> `.claude/`.

## Environment Variables

The harness auto-discovers `.env` and `.env.local` files in the family
root and each task directory. It loads every discovered file into
`process.env`. It renders each file into the agent's working directory before
`preflight.sh` runs. `process.env` always wins. The harness never overwrites
an existing value.

- **Locally:** put credentials in `.env.local` (gitignored).
- **In CI:** set secrets as repository env vars. You need no files.

### Example

A task that calls an LLM proxy:

```sh
# tasks/my-rag-task/.env.local (gitignored)
LLMHUB_NONPROD_API_KEY=your-key-here
LLMHUB_PROD_API_KEY=your-key-here
```

The harness renders this into the agent's CWD as `.env.local`. It resolves the
values from `process.env` (CI secrets override file defaults). The task's
`preflight.sh` can validate the file exists. The agent's application reads
credentials from it.

The harness adds all discovered var names to the trace redaction allowlist.

## Run It

```sh
npx gemba-benchmark run \
  --family=./my-coding-family \
  --output=./runs/2026-05-11 \
  --runs=5 \
  --agent-profile=coder \
  --judge-profile=judge \
  --max-turns=80
```

Output:

- `./runs/2026-05-11/results.jsonl` — append-only, one record per
  `(task, runIndex)`. It survives partial failures.
- `./runs/2026-05-11/runs/<task-name>/<runIndex>/` — per-run artifacts:
  the agent CWD, the preserved traces (table below), and the invariants
  stderr log.
- `./runs/2026-05-11/.apm-staging/.claude/` — staged skills/agents.

Each cell preserves its traces under `runs/<taskId>/<runIndex>/`, named by
the shared convention with `<case>` = `<taskId>-r<runIndex>`:

| File | Content |
| --- | --- |
| `trace--<case>.raw.ndjson` | Combined envelope stream (agent, supervisor, orchestrator). Preserved for the life of the run output. |
| `trace--<case>--agent.agent.ndjson` | Unwrapped agent events (split from the raw trace). |
| `trace--<case>--supervisor.supervisor.ndjson` | Unwrapped supervisor events. |
| `trace--<case>--judge.judge.ndjson` | Judge session's envelope stream; exists only on judged cells. |

Each result record carries `skillSetHash`, `familyRevision`, the combined
verdict, invariants details, judge verdict + summary, cost, turn count, and
the trace paths **relative to the run output directory** — valid on the
machine that ran the benchmark and inside a downloaded trace artifact
alike. The record's schema is validated at write time, so a malformed
write is caught before the report stage trips over it.

### Traces as Artifacts

In CI, the benchmark action uploads every trace file as a `trace--*`
workflow artifact (see the `forwardimpact/benchmark` action README): the
`trace` input gates the upload (default on; capture is unconditional), the
`trace-dir` output locates the files on the runner, and each shard mints a
collision-safe `trace--<artifact-name>[-shard-<i>]` artifact — kept even
for failed and timed-out cells. Download and analyze with `gemba-trace`:

```sh
npx gemba-trace runs                      # eval and benchmark runs list by default
npx gemba-trace find <run-id> <key>       # key: exact filename, case, or participant
npx gemba-trace download <run-id> --artifact trace--benchmark-results
```

The extracted members land at `runs/<taskId>/<runIndex>/trace--*` — exactly
the relative paths each result record carries. See the
[trace analysis guide](../trace-analysis/index.md) for the full method.

### Run Cells Concurrently

A cell is one `(task, runIndex)` pair. Cells run concurrently by default. A
family no longer takes the *sum* of every cell's wall-clock. Concurrency is
on without any flag. The default is CPU-aware (`min(4, max(2, cores/2))`).
Override it with `--concurrency=<n>` or the
`LIBHARNESS_BENCHMARK_CONCURRENCY` environment variable (the flag wins):

```sh
npx gemba-benchmark run --family=./my-coding-family --runs=5 --concurrency=4
```

Concurrency does not change the pass@k that a serial run produces. Records
simply stream in completion order instead of grid order. Each cell still
lands in `results.jsonl` the moment it settles. So a cancelled run keeps
every completed cell. One stalled cell now occupies a single slot. It does
not block the whole run.

## Grade One Task at a Time

For an ad-hoc grade without an agent run:

```sh
npx gemba-benchmark grade \
  --family=./my-coding-family \
  --task=todo-api \
  --run-dir=./runs/2026-05-11/runs/todo-api/0 \
  --output=grade.jsonl
```

`grade` runs both producers with the same derivation the runner uses. The two
producers are the hidden `tests/` suite and `hooks/invariants.sh`. The process
exit mirrors the graded verdict. Use `grade` when you iterate on the tests and
the hooks. Re-grade an existing post-run workdir or a hand-authored fixture.
This costs no agent spend. Confirm that a partial fixture yields the
fractional score you expect.

## Aggregate Into pass@k

```sh
npx gemba-benchmark report \
  --input=./runs/2026-05-11 \
  --k=1,3,5 \
  --format=text
```

With `--format=text`, the report renders a full markdown document:

- **Summary** — overall pass rate, model, skill-set hash, cost, median
  duration, median turns.
- **Pass@k table** — one row per task with the unbiased HumanEval
  estimator: `pass@k = 1 - C(n-c, k) / C(n, k)`. When the ledger holds
  scored tasks, the table gains a `score` column. That column holds the mean
  effective score across runs. The table also gains one `score@k` column per
  k. `score@k` is the expected **best** score over k runs. It is the
  continuous analog of pass@k. Binary tasks render `—` in the score columns.
- **Task details** — per-task sections with a runs table, the merged check
  rows from both producers, judge commentary (blockquoted), and any agent,
  preflight, or malformed-row errors.

With `--format=json` (default), the output is the aggregated pass@k
data only. This suits machine consumption and before/after diffs.

A `k > n` value emits a structured error row rather than a misleading
number.

`report --input` discovers every `results.jsonl` **recursively** under the
directory. It unions the records before it computes pass@k. A single run with
one `results.jsonl` is the trivial case. The same command merges the partial
ledgers that a sharded run produces (below). Point it at a directory that
holds each shard's output.

## Shard Across Machines

One machine has a ceiling: CPU, memory, and the CI per-job time limit. For a
large family, split the grid across machines with `--shard=<i>/<N>`. Shard `i`
of `N` runs a deterministic, balanced subset of the cells. It writes a partial
`results.jsonl` that holds only its cells.

```sh
# On machine 1 of 3:
npx gemba-benchmark run --family=./my-coding-family --runs=5 \
  --shard=1/3 --output=./runs/shard-1
# ...machines 2 and 3 run --shard=2/3 and --shard=3/3 into ./runs/shard-2, ./runs/shard-3
```

The `N` shards form an exact partition: every cell runs on exactly one shard,
none twice, none dropped. The harness assigns cells at `(task, runIndex)`
granularity and round-robins them across shards. So a slow task's runs spread
out. One whole task does not land on a single machine. When `N` exceeds the
cell count, the high-index shards select zero cells. That is a valid run with
an empty ledger.

Collect the shard outputs under one directory. The merged pass@k is identical
to what a non-sharded run over the same cells reports. Merge them with the
recursive `report --input`:

```sh
npx gemba-benchmark report --input=./runs --k=1,3,5 --format=text
```

Each shard run also uses in-process concurrency internally. Effective
parallelism is `N` machines × the per-machine concurrency.

## Compare Before and After

The reproducibility claim is the heart of the tool. Run the family twice. Use
the old skill manifest first and the new manifest second. Then compare:

```sh
# Before
npx gemba-benchmark run --family=./my-coding-family --output=./runs/before --runs=10
npx gemba-benchmark report --input=./runs/before --format=json > before.json

# After (manifest changed)
npx gemba-benchmark run --family=./my-coding-family --output=./runs/after --runs=10
npx gemba-benchmark report --input=./runs/after --format=json > after.json
```

Each record carries `skillSetHash`. A cross-comparison script can verify the
two reports came from materially different skill sets before it declares an
improvement.

## What's Next

<div class="grid">

<!-- part:card:ci-workflow -->
<!-- part:card:../run-eval -->
<!-- part:card:../trace-analysis -->

</div>
