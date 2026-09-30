---
title: Run a Benchmark
description: Prove a skill-pack change improved coding outcomes. Run a task family across N runs, grade with hidden tests, and report pass@k.
---

You shipped a skill-pack change. It might be a new rule in a skill, a changed
agent profile, or an updated tool allowlist. Now you need to know whether
agents write better code as a result. A single agent run proves little, and one
passing eval does not tell you much on its own. `gemba-benchmark` runs each
coding task **N times** against a **versioned skill-set manifest**. It grades
each run with tests the agent never sees, and it aggregates pass@k with the
unbiased estimator from OpenAI HumanEval.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the environment
- The `gemba-*` command family. Install it globally with
  `npm install -g @forwardimpact/gemba`. That package ships `gemba-benchmark`,
  `gemba-harness`, and `gemba-trace`. In CI, run one command ephemerally with
  `npx gemba-benchmark ...`

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
material that grades it, so it cannot see the tests.

### What the agent sees

#### `agent.task.md`

Plain markdown. The file holds the prompt the agent receives.

```md
Build a TODO API matching the spec under `specs/`. Listen on the port
exposed via the environment variable `PORT`. Respond to `GET /todos`
with a JSON array of TODO objects.
```

#### `workdir/`

This directory holds the scaffolding the agent starts with: a `package.json`,
a README, sample data. The harness copies everything here into the per-task CWD.

To share scaffolding across many tasks, put it in a **family-level**
`workdir/` (or `specs/`) at the family root. The harness copies that shared
base into every task's CWD first and then overlays the per-task
`workdir/`/`specs/` on top. A per-task file wins over a family file with the
same name. If the directory is present, the harness copies it, which is the
same convention as `hooks/`. You then maintain one app-under-test instead of
one copy per task.

### What the harness controls: `hooks/`

The `hooks/` directory holds lifecycle scripts that the harness runs at
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

Optional. The script runs before the agent starts. Exit `0` means that the
scaffold is healthy and the harness can hand off to the agent. A non-zero exit
stops the run early and produces a `preflightError` result record (cost zero,
no agent invoked). When the script is absent, the harness proceeds without a
pre-flight probe.

A preflight that starts a background service for the invariants probe to
test against:

```sh
#!/bin/sh
node "$AGENT_CWD/app.js" >/dev/null 2>&1 &
sleep 0.2
exit 0
```

The harness spawns the preflight in its own process group and tears down the
whole group (SIGTERM, grace period, SIGKILL) after the invariants check
completes, so background processes do not leak across runs.

#### `hooks/invariants.sh`

The script runs after the agent finishes. It receives the shared hook env
above, plus `$RESULTS_FD=3`, a file descriptor for structured check rows.

The **rows are the source of truth**. Every row is a check, and a row's role
is in its own fields. `{"gate": true}` marks a gate. If a gate fails, the run
fails and the score becomes zero. A plain row is a scored check that adds to
the task's score, and so is a row with `"weight": w > 0`. `{"weight": 0}` is
an ungraded diagnostic. The script's **exit code reports only the health of
the script itself**. A nonzero code means that the grader failed, never that
a check failed. A well-formed hook therefore ends with `exit 0` in every case.

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

#### `tests/`: the hidden test suite

Behavioral checks test whether the code the agent wrote works. They belong in
a hidden test suite instead of in hand-written shell. A task opts in with a
`tests/` directory beside `hooks/`. There is no manifest, because the layout
itself is the contract:

- `tests/` is an **overlay mirror** of the agent CWD. A file's path under
  `tests/` is the path where it stages (`tests/test/filter.test.js` stages at
  `test/filter.test.js`).
- Every `*.test.js` file is one check. The harness runs it with `bun test`
  from the agent CWD, and the exit status becomes one row. `*.gate.test.js`
  marks a gate (e.g. a baseline regression suite). Any other `*.test.js`
  scores at weight 1. The check name is the filename stem.
- Every other file is support material. The harness stages it for the whole
  pass and never grades it.

```text
tasks/todo-api/tests/
  test/baseline.gate.test.js    # gate — pre-existing behaviour must survive
  test/get-todos.test.js        # scored — one behaviour per file
  test/post-todo.test.js        # scored
  test/helpers.js               # support — staged, never graded
```

The harness stages each file and backs up collisions. It runs the checks and
then restores the workdir to the state the agent left it in. The judge grades
the agent's work and not the harness's scaffolding. Per-case files let a task
score partial success. An agent that solves three of four behaviours scores
0.75. Without per-case files, it would record the same `fail` as an agent that
produced nothing. An invalid tree (no check files, a dangling symlink,
duplicate check names) fails the family load before any agent spend.

#### Write to fd 3 from non-bash interpreters

Bash makes a write to fd 3 easy with `>&"$RESULTS_FD"`. From other languages
you open fd 3 explicitly:

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

### What the judge uses: `judge.task.md`

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

The judge is a **pass/fail gate that protects the validity of the grade**. It
does not produce a score. A judge that fails forces the record's effective
score to 0, and the judge never changes the mechanical score. The
judge also runs in a separate session from the live supervisor, so the
incentive to help the agent finish stays separate from the incentive to grade
fairly.

### What identifies the skill set: `.claude/` and `apm.lock.yaml`

The pre-staged `.claude/` tree holds the skills and agent profiles that the
agent will see. `apm.lock.yaml` is the **manifest under test**. The harness
hashes its bytes (LF-normalised) into `skillSetHash` on every result record.
A one-byte change to the lockfile produces a different hash. That hash lets
you compare runs before a skill change against runs after it on equal terms.

> **Caveat.** `skillSetHash` covers the lockfile bytes only. If you edit
> `.claude/` directly and do not regenerate the lockfile, the hash will not
> reflect the change. Always run your packing tool again after you edit
> `.claude/`.

## Environment Variables

The harness discovers `.env` and `.env.local` files in the family root and in
each task directory. It loads every discovered file into `process.env` and
renders each file into the agent's working directory before `preflight.sh`
runs. `process.env` always wins, so the harness never overwrites an existing
value.

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
`preflight.sh` can check that the file exists, and the agent's application
reads credentials from it.

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

- `./runs/2026-05-11/results.jsonl`: append-only, one record per
  `(task, runIndex)`. It survives partial failures.
- `./runs/2026-05-11/runs/<task-name>/<runIndex>/`: per-run artifacts,
  which are the agent CWD, the preserved traces (table below), and the
  invariants stderr log.
- `./runs/2026-05-11/.apm-staging/.claude/`: staged skills and agents.

Each cell preserves its traces under `runs/<taskId>/<runIndex>/`, named by
the shared convention with `<case>` = `<taskId>-r<runIndex>`:

| File | Content |
| --- | --- |
| `trace--<case>.raw.ndjson` | Combined envelope stream (agent, supervisor, orchestrator). Preserved for the life of the run output. |
| `trace--<case>--agent.agent.ndjson` | Unwrapped agent events (split from the raw trace). |
| `trace--<case>--supervisor.supervisor.ndjson` | Unwrapped supervisor events. |
| `trace--<case>--judge.judge.ndjson` | Judge session's envelope stream; exists only on judged cells. |

Each result record has `skillSetHash`, `familyRevision`, the combined
verdict, invariants details, judge verdict + summary, cost, turn count, and
the trace paths. The trace paths are **relative to the run output
directory**, so they are valid both on the machine that ran the benchmark and
inside a downloaded trace artifact. The harness validates the record's schema
at write time, which catches a malformed write before the report stage reads
it.

### Traces as Artifacts

In CI, the benchmark action uploads every trace file as a `trace--*`
workflow artifact. The `forwardimpact/benchmark` action README documents the
surface. The `trace` input gates the upload, and it defaults to on, while
capture is unconditional. Use the `trace-dir` output to find the files on the
runner. Each shard mints a collision-safe artifact named
`trace--<artifact-name>[-shard-<i>]`. The action keeps the artifact even for
failed and timed-out cells. Download and analyze with `gemba-trace`:

```sh
npx gemba-trace runs                      # eval and benchmark runs list by default
npx gemba-trace find <run-id> <key>       # key: exact filename, case, or participant
npx gemba-trace download <run-id> --artifact trace--benchmark-results
```

The download extracts the members to `runs/<taskId>/<runIndex>/trace--*`.
These are
the same relative paths that each result record holds. See the
[trace analysis guide](/docs/prove-changes/trace-analysis/) for the full method.

### Run Cells Concurrently

A cell is one `(task, runIndex)` pair. Cells run concurrently by default, so a
family no longer takes as long as the sum of every cell's wall-clock time.
Concurrency is on without any flag. The default is CPU-aware
(`min(4, max(2, cores/2))`). Override it with `--concurrency=<n>` or the
`LIBHARNESS_BENCHMARK_CONCURRENCY` environment variable (the flag wins):

```sh
npx gemba-benchmark run --family=./my-coding-family --runs=5 --concurrency=4
```

Concurrency does not change the pass@k that a serial run produces. Records
stream in completion order instead of grid order, and each cell is still
written to `results.jsonl` as soon as it settles, so a cancelled run keeps
every completed cell. One stalled cell occupies a single slot and does not block
the whole run.

## Grade One Task at a Time

For an ad-hoc grade without an agent run:

```sh
npx gemba-benchmark grade \
  --family=./my-coding-family \
  --task=todo-api \
  --run-dir=./runs/2026-05-11/runs/todo-api/0 \
  --output=grade.jsonl
```

`grade` runs both producers, the hidden `tests/` suite and
`hooks/invariants.sh`, with the same derivation the runner uses. The process
exit mirrors the graded verdict. Use `grade` when you iterate on the tests and
the hooks. Re-grade an existing post-run workdir or a hand-authored fixture at
no agent cost, and confirm that a partial fixture yields the fractional score
you expect.

## Aggregate Into pass@k

```sh
npx gemba-benchmark report \
  --input=./runs/2026-05-11 \
  --k=1,3,5 \
  --format=text
```

With `--format=text`, the report renders a full markdown document:

- **Summary**: overall pass rate, model, skill-set hash, cost, median
  duration, median turns.
- **Pass@k table**: one row per task with the unbiased HumanEval
  estimator, `pass@k = 1 - C(n-c, k) / C(n, k)`. When the ledger holds
  scored tasks, the table gains a `score` column that holds the mean
  effective score across runs. The table also gains one `score@k` column per
  k. `score@k` is the expected **best** score over k runs, which is the
  continuous analog of pass@k. Binary tasks render `—` in the score columns.
- **Task details**: per-task sections with a runs table, the merged check
  rows from both producers, judge commentary (blockquoted), and any agent,
  preflight, or malformed-row errors.

With `--format=json` (default), the output is the aggregated pass@k data
only, which suits machine consumption and before/after diffs.

A `k > n` value emits a structured error row instead of a misleading number.

`report --input` discovers every `results.jsonl` **recursively** under the
directory and unions the records before it computes pass@k. A single run with
one `results.jsonl` is the simplest case. The same command merges the partial
ledgers that a sharded run produces (below). Point it at a directory that
holds each shard's output.

## Shard Across Machines

One machine has a ceiling: CPU, memory, and the CI per-job time limit. For a
large family, split the grid across machines with `--shard=<i>/<N>`. Shard `i`
of `N` runs a deterministic, balanced subset of the cells and writes a partial
`results.jsonl` that holds only its cells.

```sh
# On machine 1 of 3:
npx gemba-benchmark run --family=./my-coding-family --runs=5 \
  --shard=1/3 --output=./runs/shard-1
# ...machines 2 and 3 run --shard=2/3 and --shard=3/3 into ./runs/shard-2, ./runs/shard-3
```

The `N` shards form an exact partition. Every cell runs on exactly one shard,
so no cell runs twice and no cell is dropped. The harness assigns cells at
`(task, runIndex)` granularity and round-robins them across shards. A slow
task's runs therefore spread out instead of all running on one machine. When
`N` exceeds the cell count, the high-index shards select zero cells, which is
a valid run with an empty ledger.

Collect the shard outputs under one directory. The merged pass@k is identical
to what a non-sharded run over the same cells reports. Merge them with the
recursive `report --input`:

```sh
npx gemba-benchmark report --input=./runs --k=1,3,5 --format=text
```

Each shard run also uses in-process concurrency internally. Effective
parallelism is `N` machines × the per-machine concurrency.

## Compare Before and After

Reproducibility is the main claim of the tool. Run the family twice, with the
old skill manifest first and the new manifest second. Then compare:

```sh
# Before
npx gemba-benchmark run --family=./my-coding-family --output=./runs/before --runs=10
npx gemba-benchmark report --input=./runs/before --format=json > before.json

# After (manifest changed)
npx gemba-benchmark run --family=./my-coding-family --output=./runs/after --runs=10
npx gemba-benchmark report --input=./runs/after --format=json > after.json
```

Each record has `skillSetHash`. A comparison script can check that the two
reports came from different skill sets before it declares an improvement.

## What's next

<div class="grid">

<!-- part:card:ci-workflow -->
<!-- part:card:.. -->
<!-- part:card:../run-eval -->
<!-- part:card:../trace-analysis -->

</div>
