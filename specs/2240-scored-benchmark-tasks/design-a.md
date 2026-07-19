# Design 2240-a — Scored Benchmark Tasks

Implements spec 2240. Check rows are the single authoritative grading
channel, with two producers kept structurally apart: a **hidden-test engine**
in libharness executes a per-task `tests/` tree by convention (stage each
hidden test into the agent CWD, run it, one row per test, restore), and the
**invariants script** shrinks to structural checks emitted as rows. A pure
derivation turns the merged rows plus grader health into a verdict and a
score in [0, 1]; an unhealthy grader can never mint marks. Clean break: every
hook in `benchmarks/` and the test fixtures migrates in this change.

## Architecture

```mermaid
flowchart LR
  TS["tests/ overlay<br/>hidden test files"] --> HT["runHiddenTests<br/>stage → run → restore"]
  INV["invariants.sh<br/>structural rows on fd 3"] --> RI["runInvariants<br/>rows + exit health"]
  HT & RI --> GR["gradeChecks(rows, healthy)<br/>grade.js (pure)"]
  GR --> RUN["runner #executeCell<br/>grade ∧ judge (binary gate)<br/>→ verdict, record.score"]
  RUN --> LEDGER[(results.jsonl)] --> REP["report<br/>meanScore + score@k"]
  GR --> CMD["grade subcommand<br/>same producers, exit mirrors verdict"]
```

Grading is one pure function with two callers; records are self-describing —
`report` never re-derives scores from details.

## The row contract (normative)

Single home for row and grading semantics; components reference, not
restate. Every row is a check by default. Roles, checked in order:

1. **Gate** — `gate` is exactly `true`, `pass` is boolean, and no `weight`
   key is present. Any failing gate → `gatesPass` false.
2. **Diagnostic** — no `gate` key and `weight` is exactly `0`. Free-form;
   never graded.
3. **Scored** — no `gate` key; `pass` boolean; `weight` absent (defaults to
   1) or finite > 0. `score = Σ weight(passing) / Σ weight(all scored)`.
4. **Malformed** — everything else: any `gate`+`weight` co-occurrence (a
   stray weight must never silently disarm a gate), a non-boolean `gate`,
   missing or non-boolean `pass` on a graded row, an invalid `weight`, an
   fd-3 line that fails to parse as JSON, a non-object row. Counts as a
   **failing scored check** (own weight when valid and positive, else unit
   weight 1) and increments `malformed`: dropping a defect could mint full
   marks; failing the whole run would zero completed work.

Rows carry provenance (`source: "tests" | "invariants"`), stamped where the
producers' rows merge — one composition shared by the runner and the `grade`
subcommand. Display metadata, never a grading input.

Derived predicates:

- `healthy` — invariants exited 0 AND the engine did not throw. Unhealthy →
  verdict `fail`, effective score 0 on scored tasks, whatever the rows say.
- `fullMarks` — integer count predicate: `malformed === 0` and every scored
  check passes. Never a float comparison, so fractional weights carry no
  equality hazard. Zero scored checks → binary task; `score` is `null` and
  no `score` field appears on the record or report.
- **Grade verdict** = `healthy ∧ gatesPass ∧ fullMarks` (vacuously true parts
  when no gate or scored rows exist — a row-less healthy cell still passes,
  preserving today's no-op-hook behavior).
- **Effective record score** (scored tasks only) =
  `healthy ∧ gatesPass ∧ judgePass ? score : 0`. Full marks does not zero it
  — a fractional score with verdict `fail` is the point.
- Invariants hooks never manage exit codes for checks; they end `exit 0`
  unconditionally (early `exit 0` after a failing gate row is the documented
  dependency pattern).

## The hidden test suite (normative)

A task opts in with `tasks/<task>/tests/` — a sibling of `hooks/`, never
copied into the agent CWD (the workdir manager seeds family/task `workdir/`,
`specs/`, and staged `.claude/` — never `tests/` or `hooks/`). There is no
configuration file; the layout is the contract:

- `tests/` is an **overlay mirror** of the agent CWD: a file's path under
  `tests/` is its staging path under `$AGENT_CWD`
  (`tests/app/test/filter-no-match.test.js` → `app/test/`).
- Every `*.test.js` file is one check. A `*.gate.test.js` name marks a gate
  row; any other `*.test.js` is a scored row at weight 1. The check name is
  the basename stem (`todo.gate.test.js` → `todo`).
- Every other file under `tests/` is **support material**: staged for the
  whole pass at its mirrored path, never graded.
- Each check runs as `node --test <staged path>` from `$AGENT_CWD` under
  `buildHookEnv`, with a fixed 120 s timeout; a timeout is a failing row.

Validated eagerly in `loadTaskFamily` (authoring errors fail before agent
spend): at least one check file, every entry a regular file after symlink
resolution, check names unique.

Engine execution: stage support files (same backup-on-collision and
directory tracking as checks), then per check in sorted path order: back up
a collided target → copy the (symlink-resolved) file, creating missing
parent directories → spawn → emit `{test, pass: exit === 0, gate?, message?}`
(message: exit status + trimmed stderr tail on failure) → unstage, restore
the backup, remove created directories; support unstages and restores after
the last check. A stage or spawn failure (e.g. the agent deleted the
scaffold) is a *failing* row — agent fault, not grader fault; the engine
itself throwing is grader fault: the runner catches it, records the message
on `hiddenTests.error`, and fails `healthy`. Restoration means the judge
sees the workdir exactly as the agent left it.

## Components

| Component | Where | Responsibility |
| --- | --- | --- |
| Suite discovery + validation | `benchmark/task-family.js` | `paths.tests` + the walked check/support lists on the Task when `tests/` exists; eager validation per § hidden suite. No new dependency. |
| Hidden-test engine | new `benchmark/hidden-tests.js` | `runHiddenTests(task, ctx, runtime)` → `{details}` per § hidden suite; `{details: []}` when the task has no suite. |
| Invariants collector | `benchmark/invariants.js` | Loses its verdict: returns `{details, exitCode, stderr?}`. Unparseable fd-3 lines stay in `details` as `parseError` rows and grade as malformed. |
| Grading | new `benchmark/grade.js` | Pure `gradeChecks(details, healthy)` → `{verdict, gatesPass, score, fullMarks, malformed}` (`score` null for binary). Sole home of the arithmetic. |
| Cell composition | `benchmark/runner.js` `#executeCell` | Order: agent → invariants collector → hidden-test engine → stamp provenance, merge rows, grade → judge. Cell verdict `grade.verdict ∧ judge`; effective score per § contract. The record's `grade` is the normalized projection of `gradeChecks` — `fullMarks` dropped, `score` omitted when null, `malformed` omitted when 0. Preflight-failure records never reach grading and stay score-free (zeros realize in aggregation). |
| Record schema | `benchmark/result.js` | `invariants` shape drops `verdict`; new `grade: {verdict, gatesPass, score?, malformed?}` — schema-optional so pre-break ledgers still render, though the runner always writes it; optional `hiddenTests: {details, error?}` (present iff the task has a suite; `error` carries an engine crash); optional top-level `score` (0–1) — the effective judge-zeroed value `report` aggregates; preflight branch pins them `undefined`. |
| Judge templating | `benchmark/judge.js` | `{{GRADE_RESULT}}` — grade object + merged rows — replaces `{{INVARIANTS_RESULT}}`. |
| `grade` subcommand | `commands/benchmark-grade.js` (replaces `benchmark-invariants.js`) | Runs both producers against `--run-dir` with the same derivation; process exits 0 iff `grade.verdict === "pass"` (no judge here; judge-zeroing does not apply). |
| Report | `benchmark/report.js` | Group scored iff ≥ 1 record carries `score`; per scored task `meanScore` + `scoreAtK[k]` (§ Estimator); a score-less record in a scored group contributes its verdict as the degenerate score (pass = 1, fail = 0). Rendering: score and `score@k` columns only when the report has a scored task (binary rows render `—`); the checks table merges both producers with a Source column when any row carries `source: "tests"`; a positive `grade.malformed` renders a warning; rows without `grade` (pre-break ledgers, preflight) render `—`. |
| `fit-trace assert --gate/--weight` | `commands/assert.js` + `bin/fit-trace.js` | `--weight` validates finite ≥ 0; `--gate` adds `gate: true`; `--gate` with any `--weight` is an error. **Emit-then-fail on every failure path:** invalid grading flags *and* errored evaluations (today's catch path returns without writing a row — e.g. `--grep` against a file the agent deleted) emit a failing row before the nonzero exit, so a typo or a vanished target shrinks the score, never the denominator. |
| Hook migration | `benchmarks/*/tasks/*/hooks/invariants.sh`, libharness fixtures | § Migration. One helper — `check() { fit-trace assert "$@" >&"$RESULTS_FD" \|\| true; }` — structural checks only, `exit 0` at the end. |
| Leading example | `benchmarks/kata-skills/tasks/implement-feature/tests/` | `tests/app/test/`: `todo.gate.test.js` as the pristine-baseline gate (a symlink to the family workdir suite kills the drift pair), five feature `*.test.js` checks scored at weight 1, `feature-helpers.js` as support. `invariants.sh` and `hooks/feature.test.js` deleted; `preflight.sh` and the scope judge unchanged. |
| Docs | `fit-benchmark` SKILL.md, `references/{authoring,cli}.md`, Run a Benchmark guide, `benchmarks/README.md` | Rows-authoritative contract, roles table, exit-code demotion, `tests/` layout convention, hidden-test-vs-structural-check guidance. |

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Grading channel | Single: the rows, with roles as row fields | Dual channel (weights beside an authoritative exit code): semantics split across a data and a process channel, coupled by a documentation-only contract where one wrong helper zeroes every partial run. |
| Hidden-test execution | Harness engine driven by the `tests/` layout | Hook-authored shell (status quo and this design's first draft): every coding task re-implements staging, execution, exit-code plumbing, and pristine-baseline restoration; tangles structural and behavioral checking in one script; each copy can silently mis-grade. |
| Suite declaration | Pure filesystem convention: overlay mirror, `.gate.test.js` marker, fixed `node --test` runner at weight 1 | A manifest file — the benchmark system's first configuration surface, when every field it would carry (command, staging path, role, weight, timeout) has a workable opinionated default for the families we own. |
| Suite location | `tests/` sibling of `hooks/` | Inside `hooks/` — conflates executable hook scripts with data files. Inside `workdir/` — would seed into the agent CWD and leak the suite. |
| Check granularity | One process per check file; the exit status is the row | Parsing one suite's reporter output (TAP) — couples the engine to reporter formats; per-case granularity is expressed as per-case files instead. |
| Workdir restoration | Engine backs up collisions, unstages after grading | Leaving staged files — the judge sees non-agent files and may flag them as scope creep (the prior draft's open risk, now closed structurally). |
| Layout validation timing | Eager, in `loadTaskFamily` | At grade time — an authoring typo burns a full agent run before surfacing. |
| Exit code / engine health | Demoted to grader health: unhealthy → fail, score 0 | Ignored entirely — a grader that crashes after one passing row would score 1.0; health is the one completion signal a crash cannot fake. |
| Default weight | Absent `weight` = scored at 1; diagnostics opt out with `weight: 0` | Opt-in weights — leaves most emitted evidence ungraded and requires the dual-channel contract to gate anything. |
| Where the score is computed | At record time, one pure function | At report time from `details` — every consumer re-implements weighting; ledgers stop being self-describing. |
| Verdict for scored cells | `pass` requires health ∧ gates ∧ full marks ∧ judge | Gates-only verdict — pass@k saturates on partially-solved tasks and `run`'s exit code goes green on partial capability. |
| Score-less records in a scored group | Degenerate verdict score: pass = 1, fail = 0 | Skipping them inflates the mean exactly when the agent fails hardest. |
| Best-of-k statistic | Exact expected-max via order statistics (§ Estimator) | Mean only hides best-case capability; Monte Carlo is nondeterministic for the same ledger. |
| Subcommand | `invariants` becomes `grade`, running both producers | Keeping the name — it would either lie about scope or leave the primary grading path (the hidden suite) unvalidatable without an agent run. |
| Compatibility | None: clean break, all hooks and judge templates migrate in-change | A shim honoring exit-code verdicts — permanent dual semantics for nine hooks and four fixtures we own. |

## Estimator

`scoreAtK` generalizes pass@k to [0, 1]: the expected **maximum** score over
k runs drawn without replacement from n, scores sorted ascending `s₍₁₎…s₍ₙ₎`:

```text
score@k = Σ_{i=k..n}  s₍ᵢ₎ · C(i−1, k−1) / C(n, k)
```

Each term weights `s₍ᵢ₎` by the probability it is the k-subset's maximum.
Binary scores reduce exactly to HumanEval pass@k (same BigInt binomial
helper); `k > n` yields the same `{error: "k > n"}` value — one idiom.

## Interfaces

```js
// benchmark/grade.js — pure; sole home of the arithmetic
gradeChecks(details, healthy)
// → {verdict, gatesPass, score: number|null, fullMarks, malformed}

runHiddenTests(task, ctx, runtime)  // hidden-tests.js → {details: object[]}
runInvariants(task, ctx, runtime)   // collector → {details, exitCode, stderr?}

// ResultRecord (happy branch); grade-subcommand record is
// { taskId, grade, invariants, hiddenTests?, exitCode /* script mirror */ }
{ …existing, grade: {verdict, gatesPass, score?, malformed?},
  hiddenTests?: {details, error?}, score?: number }  // score = effective

// report JSON — additive, scored tasks only
task: { …existing, meanScore?: number, scoreAtK?: Record<k, number|{error}> }
```

## Migration

All hooks move in this change: drop `FAIL` bookkeeping, end with `exit 0`,
mark presence/sanity/anti-tamper checks `--gate`, leave content checks as
default-weight scored rows. A dependency gate uses `|| exit 0` in place of
the helper's `|| true`; checks `assert` cannot express echo their row JSON
directly. All thirteen `judge.task.md` templates (nine families, four
fixtures) rename the template variable.

| Task | Gate rows | Scored rows |
| --- | --- | --- |
| coaligned/author-job | jtbd-present | 6 tag/section checks |
| coaligned/bootstrap-repo | 3 presence checks | 6 content checks |
| fit-wiki/cli-fix (also rewrites `{"id","verdict"}` rows to `test`/`pass`) | summary-intact, memory-intact (anti-tamper) | audit-passes |
| kata/coordinate-finding | issue-present, change-present | 3 linkage checks |
| kata/design-feature | file-present, under-200-lines (review Blocker) | has-decisions, names-tradeoff |
| kata/implement-feature (all via the `tests/` overlay; hook deleted) | todo (pristine baseline, `.gate.test.js`) | 5 per-file hidden feature checks |
| kata/plan-feature | file-present | 4 structure checks |
| kata/product-issue-triage | issue-present | 3 triage-evidence checks |
| kata/spec-feature | file-present, no-how-leak (constraint) | 3 section checks + cites-jtbd |
| fixtures pass/fail/repo-state/preflight-broken | role per existing single check | — |
| fixture `scored` (new) | — | 2-check `tests/` overlay exercising the engine end-to-end |

Pre-migration ledgers still render — records carry their verdicts — but no
score comparison may span the semantics break; the first post-break run
starts a fresh baseline.

— Staff Engineer 🛠️
