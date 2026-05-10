# Spec 870 — fit-benchmark Coding Agent Task Families

## Problem

Today the only way to evaluate a coding agent in the monorepo is to write a
one-off `fit-eval supervise` invocation: a task file, a supervisor profile, an
agent profile, and a working directory the agent edits. This works for ad-hoc
evals but does not scale to the central question Platform Builders need
answered: do our skills (the `fit-*`/`kata-*` packs) actually make agents
better at writing code?

Three things are missing from the current `libeval` surface:

1. **A reusable task layout.** Each scenario today encodes its own conventions
   for task file location, working-directory contents, and grading. There is no
   standard "this is a coding task" structure that can be cloned, run, and
   graded reproducibly across runs and across skill-set versions.

2. **A grading pass the agent cannot see.** When the agent is told to "build a
   TODO API matching the spec," tests written by the agent during the session
   are not independent verification — they grade themselves. Reproducible
   evaluation needs fail-to-pass tests that ship with the task and never enter
   the agent's CWD.

3. **Aggregation across runs and tasks.** LLM output is non-deterministic. A
   single run is a coin flip. Today there is no mechanism for "run this task
   family three times across these two skill-pack versions and report pass@k."

The blast radius of the gap is the central JTBD for `libeval`: Platform
Builders cannot prove whether a skill change improved coding-agent outcomes.
Skill PRs ship on subjective review.

The METR Task Standard
([github.com/METR/task-standard](https://github.com/METR/task-standard)) is a
production format for portable agent-evaluation tasks (over 1,000 tasks across
AI R&D, cybersecurity, and general autonomy; in use at the UK AI Safety
Institute). Adopting its vocabulary lets the monorepo's coding-task families
exchange tasks with the broader ecosystem rather than fork.

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | Evaluate and Improve Agents — Big Hire is to prove whether agent changes improved outcomes with reproducible evidence; hired on Gear, of which `libeval`/`fit-eval` is the surface ([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve Agents) | A skill change today (e.g., a new `fit-pathway` authoring rule, a `kata-spec` revision) cannot be measured as cause-of-effect because there is no reproducible coding-task harness. Skill changes ship on PR-review impressions. The harness gap is what blocks the Big Hire. |

---

## Scope

### In scope

| Component | What changes |
|---|---|
| `fit-benchmark` CLI | New CLI in `libraries/libeval/bin/fit-benchmark.js`, published via `@forwardimpact/libeval` alongside `fit-eval` and `fit-trace`. Subcommands: `run` (execute a task family or single task), `score` (re-grade an archived run), `report` (aggregate across runs/tasks). |
| Task family format | Conventional directory layout (local path or git remote) for grouping related coding tasks. Names follow METR's task-standard convention — snake_case directory, one task per subdirectory under `tasks/`. |
| Task layout | Per-task: `instructions.md` (the only task description shown to the agent), `supervisor.task.md` (libeval supervisor prompt), `judge.task.md` (post-hoc evaluator prompt), `specs/` (work specs the agent reads), `workdir/` (scaffold copied to the agent's temp CWD), `scoring/` (hidden grading harness — never copied into the agent's CWD). |
| Skill set under test | `apm.yml`/`apm.lock.yml` at the task-family root declares which skills/agents are installed in each task's temp CWD. This is the dimension being evaluated — different `apm.lock.yml` SHAs produce comparable result records. |
| Lifecycle hooks | METR-aligned phases: `install` (family-level: clone, install apm), `start` (per-task: temp CWD, copy `workdir/` and `specs/`, pre-flight smoke probe), run (libeval `Supervisor` + `AgentRunner`), `score` (hidden `scoring/` runs against post-run workdir, then judge), `teardown` (process-group kill, port free, archive). |
| Multi-run aggregation | `--runs` flag, default `3`. Each run produces an isolated temp CWD and an independent result record. Reports aggregate as pass@k. |
| Result records | One JSON record per task per run, persisted under a run-output directory. Schema fixed by this spec — fields named in § Success Criteria. |
| Network policy | Per-task `permissions` declaration, default no internet. `"full_internet"` opts in. Aligned with METR's `get_permissions()`. |
| Test surface (initial) | Outside-in only: HTTP probes against the running app, source-file existence and content checks, command exit codes. The contract is enforced by skills under test, not by file protection. |
| Documentation | New `.claude/skills/fit-benchmark/SKILL.md` and a `websites/fit/docs/libraries/prove-changes/run-benchmark/` guide. Both linked per the skill–CLI parity rule (`.claude/skills/CLAUDE.md`). |

### Out of scope, deferred

- **Containerised isolation.** Tasks run in a temp CWD on the host. Sandboxing
  via Docker or a VM (METR's `aux_vm_spec`) is a follow-up.
- **Library/CLI test surfaces.** v1 is HTTP-only. Module-import probes and
  CLI-subprocess probes are deferred until a concrete task needs them.
- **Cross-model leaderboards.** The result schema supports model comparison;
  the `report` subcommand does not yet render leaderboards.
- **Live PR-gate integration.** The CLI is release-time. Wiring benchmark runs
  into the `kata-release-merge` gate is a separate spec.
- **Retroactive grading of historical fit-eval traces.** New tool, new traces.
- **Cost-budget enforcement at family level.** Per-task budgets (max-turns,
  time, cost) are surfaced from libeval. Family-level aggregate caps deferred.
- **Determinism / replay.** No re-execution against a recorded trace; each run
  is a fresh agent session. `score` re-grades an archived workdir, not a
  re-played agent.
- **Intermediate scoring.** Only end-of-run scoring in v1 (METR's
  `intermediate_score`/`aggregate_scores` are deferred).

---

## Success Criteria

| Claim | Verification |
|---|---|
| `fit-benchmark run <family>` clones (or copies) the task family, executes every task in it `--runs N` times, and writes one result record per task per run. | Test: a fixture family with two tasks and `--runs 2` produces 4 result records and 4 trace files in the run-output directory; each record references a distinct trace path. |
| The `scoring/` directory of a task is never present in the agent's CWD during the run. | Test: a sentinel filename in `scoring/` is unreadable from the agent's CWD; an end-to-end run with an agent attempting `ls -R` produces a trace whose lines never contain the sentinel. |
| Hidden tests run against the post-run workdir from the template directory and produce a pass/fail per task. | Test: a fixture task whose `scoring/run.sh` HTTP-probes the agent's app at `localhost:$PORT` and asserts a JSON shape; with a stub agent that produces a passing app, the result record's scoring verdict is `"pass"`; with a stub that produces a failing app, it is `"fail"`. |
| The judge phase consumes scoring output and the NDJSON trace and emits a final verdict via `Conclude`. | Test: a fixture `judge.task.md` referencing scoring results yields a `judgeVerdict` field on the result record; a known-bad scoring outcome plus a known-good trace produces `"fail"`. |
| Tasks declare network permissions and the harness honours them. | Test: a task with default permissions cannot reach an external URL from the agent's tools; a task with `permissions: ["full_internet"]` can. |
| Skill set under test is reproducible: the same `apm.lock.yml` content produces identical skill installations across runs and a stable `skillSetHash` field on the result record. | Test: two consecutive runs against the same `apm.lock.yml` produce result records whose `skillSetHash` matches; a one-byte change to `apm.lock.yml` changes the hash. |
| Pre-flight smoke probe catches broken task templates before the agent runs. | Test: a task whose `workdir/` does not boot fails at the `start` phase with a clear error and zero agent cost spent on it. |
| Result aggregation across runs reports pass@k. | Test: `fit-benchmark report <run-id>` over three runs of the same task with verdicts pass/fail/pass emits `pass@1: 2/3, pass@3: 1/1`. |
| Teardown leaves no dangling processes or occupied ports. | Test: after a task that starts an HTTP server on a known port, the port is free and no child of the harness PID remains. |
| `fit-benchmark` shares libeval's primitives — no duplicated agent/supervisor logic. | Code review: `fit-benchmark`'s run path composes `AgentRunner`, `Supervisor`, `TraceCollector`, `MessageBus` from `@forwardimpact/libeval`; no fork of those classes. |
| Result-record schema is stable. | Each record contains: `taskId`, `runIndex`, `verdict`, `scoring`, `submission`, `judgeVerdict`, `costUsd`, `turns`, `tracePath`, `profiles`, `model`, `skillSetHash`, `familySha`, `permissions`, `durationMs`. Documented in the design and exercised in a schema-fixture test. |

— Staff Engineer 🛠️
