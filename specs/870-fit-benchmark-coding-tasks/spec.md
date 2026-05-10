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
   the agent's working directory.

3. **Aggregation across runs and tasks.** LLM output is non-deterministic. A
   single run is a coin flip. Today there is no mechanism for "run this task
   family multiple times across two skill-pack versions and report pass@k."

The blast radius of the gap is the central JTBD for `libeval`: Platform
Builders cannot prove whether a skill change improved coding-agent outcomes.
Skill PRs ship on subjective review.

The METR Task Standard
([github.com/METR/task-standard](https://github.com/METR/task-standard))
provides a vocabulary for portable agent-evaluation tasks (`task family`,
`task`, `instructions`, `permissions`, lifecycle hook names) that the design
will adopt. METR's specification expresses each task family as a Python
`TaskFamily` class; this spec borrows the vocabulary and the lifecycle
structure but not the Python class format. Vocabulary alignment is the
portability claim; the file format is a design decision.

---

## Personas and Jobs

The harness serves Platform Builders. Their Big Hire is to "prove whether agent
changes improved outcomes with reproducible evidence" ([JTBD.md](../../JTBD.md)
§ Platform Builders: Evaluate and Improve Agents); `libeval`/`fit-eval` is the
surface they hire. Without a reproducible coding-task harness, a skill change
(e.g., a new `fit-pathway` authoring rule, a `kata-spec` revision) cannot be
measured as cause-of-effect — skill PRs ship on review impressions. Closing
this gap is what unblocks the Big Hire. Empowered Engineers running
skill-equipped agents inherit the benefit downstream but are not the direct
hire for this spec.

---

## Scope

### In scope

| Component | What changes |
|---|---|
| Benchmark CLI | A new CLI delivered through the same package as `fit-eval` and `fit-trace`, exposing capabilities to execute a task family, re-grade an archived run, and aggregate results across runs. |
| Task family format | A conventional layout (local path or git remote) for grouping related coding tasks. The format borrows METR Task Standard vocabulary; the on-disk shape is a design decision. |
| Per-task artifacts | Each task carries: an agent-visible task description, a supervisor prompt for the live run, a judge prompt for the post-hoc evaluator, work specs the agent reads, scaffolding for the agent's working directory, and a hidden grading harness. The grading harness is never copied into the agent's working directory. |
| Skill set under test | The task family declares the set of skills/agents installed in each task's working directory through a lockfile-style manifest. The manifest is the unit of measurement — different lockfile contents produce comparable result records, with a stable identifier on each record. |
| Lifecycle | The harness drives a fixed sequence of phases per task: setup, agent execution, scoring, judging, and teardown. The harness pre-flights the unmodified scaffolding before agent execution to catch broken templates without spending agent cost. |
| Judge phase | A separate evaluator session runs after scoring, consumes the scoring outcome and the agent trace, and emits a final verdict via libeval's `Conclude` tool. The judge is distinct from the live supervisor to keep evaluation incentives separate from helping incentives. |
| Multi-run aggregation | The harness supports running each task multiple times in one invocation and aggregates pass@k across runs. |
| Result records | One result record per task per run. Records carry the information needed to compute pass@k, attribute outcomes to a skill-set version, and reproduce a run. The wire schema is fixed in the design and shared by the harness and the report command. |
| Network policy | Per-task permissions declaration aligned with METR vocabulary. Default deny external network; an explicit opt-in enables it. The enforcement mechanism is a design decision. |
| Test surface (initial) | v1 supports tasks gradable by HTTP probes against the running app, source-file existence and content checks, and command exit codes. Module-import probes and CLI-subprocess probes are deferred. |
| Documentation | A user-facing skill matching the published CLI per the skill–CLI parity rule (`.claude/skills/CLAUDE.md`), and a corresponding guide. |

### Out of scope, deferred

- **Containerised isolation.** Tasks run on the host. Sandboxing via Docker
  or a VM is a follow-up.
- **Library/CLI test surfaces.** v1 is HTTP-only.
- **Cross-model leaderboards.** The result schema supports model comparison;
  rendering that comparison is deferred.
- **Live PR-gate integration.** The CLI is release-time. Wiring benchmark
  runs into the `kata-release-merge` gate is a separate spec.
- **Retroactive grading of historical fit-eval traces.** New tool, new traces.
- **Family-level cost-budget enforcement.** Per-task budgets are surfaced
  from libeval.
- **Determinism / replay from trace.** Each run is a fresh agent session.
- **Intermediate scoring.** Only end-of-run scoring in v1.

---

## Success Criteria

| Claim | Verification |
|---|---|
| The harness clones (or copies) a task family, executes every task in it the configured number of times, and writes one result record per task per run. | Test: a fixture family with two tasks and a run count of two produces four result records and four trace files in the run-output directory; each record references a distinct trace path. |
| The hidden grading harness for a task is never present in the agent's working directory during the run. | Test: a sentinel filename inside the hidden grading harness is unreadable from the agent's working directory; an end-to-end run with an agent attempting to enumerate the directory tree produces a trace whose lines never contain the sentinel. |
| Hidden tests run against the post-run agent working directory from the template directory and produce a pass/fail per task. | Test: a fixture task whose grading script HTTP-probes the agent's app on a known port and asserts a JSON shape; with a stub agent producing a passing app, the result record's grading verdict is `"pass"`; with a stub producing a failing app, it is `"fail"`. |
| The judge phase consumes the scoring outcome and the trace and emits a final verdict via `Conclude`. | Test: a fixture judge prompt referencing scoring results yields a judge-verdict on the result record; a known-bad scoring outcome plus a known-good trace produces `"fail"`. |
| Tasks declare network permissions and the harness honours them. | Test: a task with default permissions, when the agent attempts to fetch an external URL, produces a tool-result error (request denied or no tool available); a task that opts into external network succeeds in the same scenario. |
| The skill set under test is reproducible across runs. | Test: two consecutive runs against the same skill-set lockfile produce result records whose skill-set identifier matches; a one-byte change to the lockfile produces a different identifier. |
| Pre-flight catches broken task templates before the agent runs. | Test: a task whose unmodified scaffolding fails its own start fails at the pre-flight phase with a non-zero exit and a structured error in the result record; the result record's agent cost is zero. |
| Result aggregation across runs reports pass@k. | Test: the report command, given five runs of the same task with verdicts pass/fail/fail/pass/fail, reports `pass@1 = 2/5` and `pass@3 = 9/10` per the OpenAI HumanEval convention `pass@k = 1 - C(n-c, k)/C(n, k)`. |
| Teardown leaves no dangling processes or occupied ports. | Test: after a task that starts an HTTP server on a known port, the port is free and no child of the harness PID remains. |
| The harness produces NDJSON traces in the format consumed by `fit-trace`. | Test: a trace from a benchmark run is accepted by `fit-trace overview` without errors; turn count matches between the source NDJSON and `fit-trace`'s output. |
| The result-record schema is fixed in the design and validated at write time. | Test: each result record validates against the schema declared in `design-a.md` § Result-record schema; the schema lives in one place and is referenced by both the harness and the report command. |

— Staff Engineer 🛠️
