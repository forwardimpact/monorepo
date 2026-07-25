---
name: gemba-benchmark
description: >
  Prove whether a skill-pack change made agents better at writing code.
  Use when a single passing eval doesn't prove anything and you need
  multi-run pass@k evidence, when grading coding tasks with hidden tests
  the agent cannot see, or when comparing outcomes across skill-set
  versions.
---

# gemba-benchmark

`gemba-benchmark` answers one question Platform Builders care about: did our
skills make agents better at writing code? A single agent run is a coin
flip. `gemba-benchmark` runs each coding task N times across a skill-set
manifest, grades each run against checks that never enter the agent's
working directory, and reports pass@k (plus a score for scored tasks).

`gemba-harness` is the generic agent-evaluation plumbing; `gemba-benchmark` adds
the opinionated layer: task-family format, hidden checks, judge, and pass@k.

## Task Family Format

A task family is a directory of related tasks plus the skill-set under test.
You author these files:

```text
<family>/
  apm.yml                # skill-pack dependency (or stage local skills with --skills-from)
  judge.md               # optional — family-local judge profile
  .env / .env.local      # optional — env vars loaded + rendered into each agent CWD
  workdir/               # optional — shared base copied into EVERY task CWD
  specs/                 # optional — shared base copied into EVERY task CWD/specs
  tasks/<task-name>/
    agent.task.md         # agent prompt (required) — trigger the skill, don't restate it
    judge.task.md         # optional — judge prompt (see § Judge Template Variables)
    supervisor.task.md    # optional — supervisor context for the relay
    hooks/preflight.sh    # optional — smoke probe; exit 0 confirms scaffold
    hooks/invariants.sh   # optional — structural checks emitted as rows on fd 3
    tests/                # optional — hidden test suite, staged + run by the harness
    specs/ workdir/       # optional — copied into agent CWD (overlay family-level)
```

`run` generates the rest — `.claude/`, `apm.lock.yaml` (hashed into
`skillSetHash`), and `apm_modules/`: outputs, not sources — see
[references/authoring.md](references/authoring.md) for what to commit. Task
IDs are directory names under `tasks/`; local paths and git URLs both work.

**Family-level shared fixtures.** A `<family>/workdir/` or `<family>/specs/`
is copied into every task's agent CWD as a shared base; the per-task
`workdir/`/`specs/` overlay on top. Use it to maintain one fixture (e.g. an
app under test) across many tasks instead of duplicating it per task.

## Environment Variables

The harness auto-discovers `.env`/`.env.local` in the family root and each
task directory, merges them into `process.env` (which wins), renders the
result into the agent CWD, and adds every discovered name to the redaction
allowlist. Locally use `.env.local` (gitignored); in CI set env vars.

## Lifecycle

For each `(task, runIndex)` the harness drives:

1. **Setup** — copy the family-level `workdir/`/`specs/`, the per-task
   `workdir/`/`specs/`, and the staged `.claude/` into a fresh per-task
   CWD. Allocate a free TCP port. Run `hooks/preflight.sh`.
2. **Agent** — run the coding agent on `agent.task.md` with a default
   tool allow-list (override with `--allowed-tools`).
3. **Grade** — the check rows are authoritative: `hooks/invariants.sh` emits
   structural rows on fd 3 (`$RESULTS_FD=3`); the harness runs each hidden test
   from `tests/`, one row per check. A row's role lives in its fields:

   | Row | Role | Grading effect |
   | --- | --- | --- |
   | `{"test": …, "pass": …, "gate": true}` | **Gate** | Any failing gate → verdict `fail`, score 0. |
   | `{"test": …, "pass": …}` or `"weight": w > 0` | **Scored** | Contributes `w` (default 1) to the weighted score. |
   | `{"weight": 0, …}` | **Diagnostic** | Never graded; free-form detail. |
   | Malformed or unparseable | **Malformed** | A failing scored check; surfaced in the report. |

   A task with any scored row is a **scored task**: its record carries
   `score = Σ weight(passing) / Σ weight(all scored)`. The script's exit code is
   **script health only** — nonzero means the grader itself failed (verdict
   `fail`, score 0); a well-formed hook ends `exit 0`.
4. **Judge** — a separate session reads the grade and the agent trace and
   calls `Conclude` with `success` or `failure`. The judge is a binary gate
   protecting the score's validity, never a grade: a failing judge (like a
   failing gate or an unhealthy grader) zeroes the record's score.
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
| `HOOKS_DIR` | The task's `hooks/` dir on the host — read hidden fixtures from here. |
| `FAMILY_DIR` | Family root on the host. |
| `RESULTS_FD` | `invariants.sh` only — fd for NDJSON check rows (`=3`). |

## Hidden Test Suites

A task opts in with a `tests/` directory beside `hooks/` — an overlay mirror
of the agent CWD: a file's path under `tests/` is its staging path. Every
`*.test.js` file is one check run with `node --test` (`*.gate.test.js` = a
gate, others scored at weight 1, named by filename stem); other files are
support, staged but never graded. The harness restores the workdir
afterward, so the judge grades the agent's work. An invalid tree fails the
family load. Layout details in
[references/authoring.md](references/authoring.md).

## CLI

The full flag surface lives in [references/cli.md](references/cli.md);
task-authoring guidance in
[references/authoring.md](references/authoring.md).

## GitHub Action

The `forwardimpact/benchmark@v1` composite action wraps the CLI: it
installs deps, runs the benchmark, appends the report to the step summary, and
uploads `results.jsonl`.

```yaml
- uses: forwardimpact/benchmark@v1
  with:
    family: ./benchmarks/my-family
    runs: "5"
    judge-profile: judge
```

All CLI `run` flags are action inputs, plus CI extras and the
`results-path`/`trace-dir` outputs — see the action README. For parallelism
it takes `concurrency` and `shard-index`/`shard-total` with `mode` (`run` a
shard, or `merge` every shard's partial ledger); a `benchmark.yml` reusable
workflow fans shards out from one `shard-total` input — see the CI guide
below.

| Command | Purpose |
| --- | --- |
| `run` | Run every task N times against a family; append result records to `<output>/results.jsonl`. |
| `grade` | Grade a single task against a post-run workdir without invoking an agent — both producers, same derivation as `run`; the exit mirrors the verdict. |
| `report` | Aggregate `results.jsonl` into pass@k (plus mean score and score@k for scored tasks), check rows, judge commentary, and operational stats. |

## Typical Workflow

```sh
npx gemba-benchmark run --family=./families/coding --judge-profile=judge
npx gemba-benchmark report --format=text   # pass@k + score@k
```

## Judge Template Variables

| Variable | Source |
| --- | --- |
| `{{AGENT_INSTRUCTIONS}}` | Contents of `agent.task.md` |
| `{{AGENT_PROFILE}}` | Agent profile body (empty string if none) |
| `{{AGENT_TRACE_PATH}}` | Path to the cell's `trace--<case>--agent.agent.ndjson` lane |
| `{{GRADE_RESULT}}` | JSON grade object (verdict, gatesPass, score) plus the merged check rows |
| `{{SKILL_SET_HASH}}` | SHA-256 fingerprint from `apm.lock.yaml` |
| `{{TASK_ID}}` | Task name (directory under `tasks/`) |
| `{{TASK_DIR}}` | Agent working directory path |

## Grading Surfaces

Behavioral checks belong in the hidden `tests/`
suite; `hooks/invariants.sh` covers structural surfaces — a service probe,
a repository-state digest, artifact content via `gemba-trace assert` — with
gates for presence/anti-tamper and scored rows for content.

## Result Records

One record per `(taskId, runIndex)`, appended to `<output>/results.jsonl`,
each validating against
[`benchmark/result.js`](https://github.com/forwardimpact/monorepo/blob/main/libraries/libharness/src/benchmark/result.js).
Records carry the `grade`, the effective `score` (zeroed by a failing gate,
judge, or grader), skill-set hash, family revision, judge verdict, relative
trace paths, cost, turn count, and (on pre-flight failure) a `preflightError`.

Each cell keeps convention-named traces under `runs/<taskId>/<runIndex>/`
(`<case>` = `<taskId>-r<runIndex>`): `trace--<case>.raw.ndjson`,
agent/supervisor lanes, and a judge lane on judged cells — uploaded as
`trace--*` artifacts (failed cells included) and read by `gemba-trace` with
no benchmark-specific flags.

---

## Documentation

- [Run a Benchmark](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md)
  — Author a coding-task family, run a benchmark across multiple runs,
  and read the pass@k report.
- [Automate with GitHub Actions](https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md)
  — Run benchmarks in CI with the forwardimpact/benchmark action.
