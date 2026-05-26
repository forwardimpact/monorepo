# Spec 0870 — fit-benchmark Coding Agent Task Families

## Problem

Today the only way to evaluate a coding agent in the monorepo is to write a
one-off `fit-eval supervise` invocation: a task file, a supervisor profile, an
agent profile, and a working directory the agent edits. This works for ad-hoc
evals but does not scale to the central question Platform Builders need
answered: do our skills (the `fit-*`/`kata-*` packs) actually make agents
better at writing code?

Three things are missing from the current `libeval` surface:

1. **A reusable task layout.** Each scenario today encodes its own conventions
   for task file location, working-directory contents, and grading. There is
   no standard "this is a coding task" structure that can be cloned, run, and
   graded reproducibly across runs and across skill-set versions.

2. **A grading pass the agent cannot see.** When the agent is told to "build a
   TODO API matching the spec," tests written by the agent during the session
   are not independent verification — they grade themselves. Reproducible
   evaluation needs fail-to-pass tests that ship with the task and never enter
   the agent's working directory.

3. **Aggregation across runs and tasks.** LLM output is non-deterministic. A
   single run is a coin flip. Today there is no mechanism for "run this task
   family multiple times across two skill-pack versions and report pass@k."

A fourth structural concern motivates a downstream design decision: the live
supervisor and the post-hoc grader should not be the same agent. A supervisor
whose job during the run is to help the agent finish cannot also issue an
unbiased verdict.

The blast radius of the gap is the central JTBD this surface serves: Platform
Builders cannot prove whether a skill change improved coding-agent outcomes.
Skill PRs ship on subjective review.

The METR Task Standard
([github.com/METR/task-standard](https://github.com/METR/task-standard))
provides a vocabulary for portable agent-evaluation tasks the design will
adopt — `task family`, `task`, `instructions`, lifecycle hook names.
Vocabulary alignment is the portability claim.

## Personas and Job

The harness serves Platform Builders. Their Big Hire is to "Help me prove
whether agent changes improved outcomes with reproducible evidence"
([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve Agents),
hired against **Gear** — the umbrella product `libeval`/`fit-eval` ships
under. Without a reproducible coding-task harness, a skill change (a new
`fit-pathway` authoring rule, a `kata-spec` revision) cannot be measured as
cause-of-effect — skill PRs ship on review impressions. Closing this gap is
what unblocks the Big Hire. Empowered Engineers running skill-equipped agents
inherit the benefit downstream but are not the direct hire. End users running
agents in production are not in scope.

## Scope

### In scope

| Component | What changes |
|---|---|
| Benchmark capability | A new executable capability that runs benchmarks against a task family and aggregates results across runs. The CLI surface composition (subcommands, packaging) is a design decision. |
| Task family format | A conventional layout (local path or git remote) for grouping related coding tasks. The format borrows METR Task Standard vocabulary and lifecycle structure; the on-disk shape is a design decision. |
| Per-task content | Each task carries enough material to: prompt the agent, guide a live supervisor, guide a post-hoc judge, anchor the agent in the desired outcome (work specifications), seed the agent's working directory, and grade the agent's output. The grading material is never accessible from the agent's working directory. |
| Skill set under test | The task family declares the skills/agents installed in each task's working directory through a manifest whose contents uniquely identify the skill set. The manifest is the unit of measurement — different manifest contents produce comparable result records, with a stable identifier on each record. |
| Lifecycle | The harness drives a fixed sequence of phases per task: setup, agent execution, scoring, judging, and teardown. The harness rejects broken task templates without spending agent cost. |
| Judge phase | A separate evaluator session runs after scoring, consumes the scoring outcome and the agent trace, and emits a final verdict that the result record records. |
| Multi-run aggregation | The harness supports running each task multiple times in one invocation and aggregates pass@k across runs per the OpenAI HumanEval unbiased estimator. |
| Result records | One result record per task per run, even when tasks fail at any phase. Records carry the information needed to compute pass@k, attribute outcomes to a skill-set version, and reproduce a run. The record schema is a single declared shape shared by the harness and the report tooling. |
| Grading surface | The harness grades tasks via three post-run outcome categories: running-service behaviour, repository state, and process exit. |
| Documentation | A user-facing skill matching the published CLI per the skill–CLI parity rule (`.claude/skills/CLAUDE.md`), and a corresponding guide. |

### Out of scope, deferred

- **Containerised isolation.** Tasks run on the host. Sandboxing via Docker
  or a VM is a follow-up.
- **Library-API and CLI-invocation grading.** Beyond the three grading
  surfaces in scope.
- **Cross-model leaderboards.** The result schema supports model comparison;
  rendering that comparison is deferred.
- **Live PR-gate integration.** The capability is release-time. Wiring
  benchmark runs into automated merge gating is a separate spec.
- **Retroactive grading of historical fit-eval traces.** New tool, new traces.
- **Family-level cost-budget enforcement.** Per-task budgets surface from
  libeval.
- **Determinism / replay from trace.** Each run is a fresh agent session.
- **Intermediate scoring.** Only end-of-run scoring in this scope.
- **Concurrent runs across `(task, runIndex)` pairs.** v1 is serial.
- **Per-task tool/network permissions.** v1 runs every task with one default
  tool set built into the harness. Per-task permissions (e.g. METR's
  `full_internet` opt-in) are a v2 amendment once the default proves
  insufficient.

## Success Criteria

| Claim | Verification |
|---|---|
| The harness clones (or copies) a task family, executes every task in it the configured number of times, and writes one result record per task per run including for failures. | Test: a fixture family with one passing task and one task that fails its agent execution at a run count of two produces four result records and four trace files in the run-output directory; each record carries a distinct `(taskId, runIndex)` pair and references an existing, distinct trace file. |
| The grading material for a task is never present in the agent's working directory during the run. | Test: a sentinel filename inside the grading material is unreadable from the agent's working directory; an end-to-end run with an agent attempting to enumerate the directory tree produces a trace whose lines never contain the sentinel. |
| Hidden grading produces a pass/fail per task via the running-service surface. | Test: a fixture task whose grading script HTTP-probes the agent's app on a known port and asserts a JSON shape; with a stub agent producing a passing app, the result record's grading verdict is pass; with a stub producing a failing app, it is fail. |
| Hidden grading produces a pass/fail per task via the repository-state surface. | Test: a fixture task whose grading script asserts the existence and SHA-256 content of one or more files under the post-run working directory; a stub agent meeting the assertions produces a passing record; one missing the file produces a failing record. |
| Hidden grading produces a pass/fail per task via the process-exit surface. | Test: a fixture task whose grading script invokes a command in the post-run working directory and treats exit-zero as pass; the result record's grading verdict tracks the command's exit code. |
| The judge phase consumes the scoring outcome and the agent trace and emits a final verdict that the result record records. | Test: a fixture judge prompt referencing scoring results yields a judge-verdict on the result record; a known-bad scoring outcome plus a known-good trace produces a failing verdict. |
| The skill set under test is reproducible across runs. | Test: two consecutive runs against the same skill-set manifest produce result records whose skill-set identifier matches; a one-byte content change to the manifest produces a different identifier. |
| Pre-flight catches broken task templates before the agent runs. | Test: a task whose unmodified scaffolding fails its own start fails before agent execution with a non-zero exit and a structured error in the result record; the result record's agent cost is zero. |
| Result aggregation across runs reports pass@k per the OpenAI HumanEval unbiased estimator. | Test: the report tooling, given five runs of the same task with verdicts pass/fail/fail/pass/fail, reports `pass@1 = 0.4` and `pass@3 = 0.9` (the unbiased estimator `1 - C(n-c, k) / C(n, k)`). |
| Teardown leaves no descendant of the harness's process group. | Test: after a task that starts an HTTP server on a known port, the port is free and no descendant in the harness's process group remains. |
| The harness produces traces consumable by the monorepo's standard trace-analysis tooling. | Test: a trace from a benchmark run is accepted by the standard trace-analysis tool's overview command without errors; turn count matches between the source trace and the tool's output. |
| Result records share a single declared schema validated at write time. | Test: every record produced by the harness validates against the record's runtime schema validator; the report tooling validates inputs against the same validator and rejects records that fail. |
| The published skill and CLI carry parity per `.claude/skills/CLAUDE.md`. | Test: the skill's `## Documentation` list and the CLI's documentation array carry the same entries in the same order. |

— Staff Engineer 🛠️
