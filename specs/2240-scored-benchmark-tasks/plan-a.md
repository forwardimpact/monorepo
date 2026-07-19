# Plan 2240-a — Scored Benchmark Tasks

Implements [design-a.md](design-a.md) for [spec 2240](spec.md).

**Approach.** Build bottom-up along the design's data flow: the pure grading
derivation first, then the hidden-test subsystem (layout discovery, then the
engine), then the invariants collector and record schemas, then the runner and
the `grade` subcommand, then report aggregation and rendering, then the
authoring surface (`fit-trace assert --gate/--weight`), then the migration —
fixtures and their suites before the family hooks — and finally documentation.
This is a clean break with no shims or fallbacks: existing suites that
assert exit-code-derived verdicts are updated to the row contract, not
preserved; every existing benchmark migrates in this plan — all nine tasks
across the three families (Step 11), the four libharness fixtures plus a new
scored fixture (Step 10), and all thirteen judge templates — and pre-break
ledgers are abandoned rather than accommodated. Benchmark modules live under
`libraries/libharness/src/benchmark/` and CLI handlers under
`libraries/libharness/src/commands/`; the fit-trace CLI definition is inline
in `libraries/libharness/bin/fit-trace.js`.

Libraries used: libharness (benchmark runner/report/result/invariants,
fit-trace assert), zod (record schemas), libmock + libutil (test runtimes).

## Step 1: Grading module

One pure function owning the arithmetic of design § The row contract.

- Created: `libraries/libharness/src/benchmark/grade.js`,
  `libraries/libharness/test/benchmark-grade.test.js`

`gradeChecks(details, healthy)` →
`{verdict, gatesPass, score, fullMarks, malformed}`:

- Classify each row per the contract's role order: gate (`gate === true`,
  boolean `pass`, no `weight` key), diagnostic (no `gate` key,
  `weight === 0`), scored (no `gate` key, boolean `pass`, `weight` absent →
  1 or finite > 0), else malformed — any `gate`+`weight` co-occurrence is
  malformed regardless of values. Rows the fd-3 parser marked `parseError`
  are malformed. Non-object rows (a bare `null`, number, or string is valid
  JSON and reaches `details` verbatim) are malformed. The `source` stamp is
  ignored.
- Malformed → failing scored check: own weight when it carries a valid finite
  weight > 0, else unit weight 1; increments `malformed`.
- `score = Σ weight(passing scored) / Σ weight(all scored)`; `null` when zero
  scored checks (binary task).
- `gatesPass` = every gate row passes (vacuously true).
- `fullMarks` = integer count predicate:
  `malformed === 0 && passingCount === scoredCount` — never a float
  comparison against `score === 1`. Vacuously true with zero scored checks.
- `verdict` = `healthy && gatesPass && fullMarks ? "pass" : "fail"`.

Test cases: weighted fraction over mixed weights; absent weight defaults to
1; `weight: 0` rows ignored; gate rows excluded from the score; failing gate
→ `gatesPass` false with score still derived; `healthy: false` with
all-passing rows → verdict fail (a crashed grader cannot mint marks); zero
scored checks → `score: null` and row-less healthy → verdict pass
(no-op-hook behavior); malformed shapes (missing/non-boolean `pass`,
non-boolean `gate`, `gate` alongside `weight: 0` / a positive weight / an
invalid weight, negative/Infinity/NaN/string weight, `parseError` row,
non-object row) each counted failing at the documented weight; `fullMarks`
true only when every scored check is valid and passing; fractional weights
(0.1 × 3) still yield `fullMarks: true` when all pass.

Verification: `bun test test/benchmark-grade.test.js` in
`libraries/libharness`.

## Step 2: Suite discovery and validation

The task loader learns the `tests/` layout convention; authoring errors fail
before any agent spend.

- Modified: `libraries/libharness/src/benchmark/task-family.js`,
  `libraries/libharness/test/benchmark-task-family.integration.test.js`

`discoverTasks` walks `<taskDir>/tests/` when it exists and sets on the Task
(the existing `walkFiles` helper silently *skips* dangling symlinks via
`resolveSymlinkToFile`, so the suite walk needs its own variant that yields
them for the validation rule to reject):

- `paths.tests` — the suite root (null when absent).
- `task.tests.checks` — one entry per `*.test.js` file, in sorted path
  order: `{name, sourcePath, stagePath, gate}` where `stagePath` is the path
  relative to `tests/` (the overlay mirror), `gate` is true iff the name
  ends `.gate.test.js`, and `name` is the basename stem with the
  `.gate.test.js`/`.test.js` suffix stripped.
- `task.tests.support` — every other file, same `{sourcePath, stagePath}`
  shape.

Validation, eager so `loadTaskFamily` rejects broken suites: at least one
check file, every entry a regular file after symlink resolution (dangling
symlinks fail), check names unique across the suite. Throws with the failing
path in the message.

Tests: task without `tests/` → null (existing fixtures unchanged); a nested
overlay tree → checks in sorted order with correct `stagePath`/`gate`/`name`;
support files separated from checks; one loader test per validation rule
(empty suite, dangling symlink, duplicate stems).

Verification: `bun test test/benchmark-task-family.integration.test.js`.

## Step 3: Hidden-test engine

Stage → run → row → restore, per design § The hidden test suite.

- Created: `libraries/libharness/src/benchmark/hidden-tests.js`,
  `libraries/libharness/test/hidden-tests.test.js`

`runHiddenTests(task, ctx, runtime)` → `{details}`:

- No suite (`task.tests` null) → `{details: []}` immediately.
- Stage `support` files at their mirrored paths, backing up any collided
  file's bytes first and creating missing parent directories (tracked, so
  created directories are removed on cleanup).
- Per check in sorted path order: back up collision → copy the
  symlink-resolved source to `<AGENT_CWD>/<stagePath>` → spawn
  `["node", "--test", <stagePath>]` with `cwd: ctx.cwd` and `buildHookEnv`
  (same vars as the hooks) → row `{test: name, pass: exit === 0}` plus
  `gate: true` for gate checks; on failure, `message` carries the exit
  status and a trimmed stderr tail (cap ~500 chars) → unlink the staged
  file, restore the backup.
- Timeout: a fixed 120 s per check (module constant, injectable for tests);
  `runtime.clock` timer SIGKILLs the child and the row fails with a timeout
  message.
- Stage/spawn errors (ENOENT on a deleted scaffold, spawn failure) become a
  failing row with the error message — never a throw. After the last check,
  unstage `support`, restore backups, and remove created directories in a
  `finally`.

Tests (injected `runtime.subprocess` seam plus real `mkdtemp` trees): one
row per check with `gate` derived from the filename; exit 1 → failing row
with stderr tail; deleted scaffold → failing row, no throw; collided target
file restored byte-identical, staged files absent, created directories
removed after the run (restoration property, spec criterion 7); support
files staged during and gone after; timeout kills and fails the row;
suite-less task → empty details.

Verification: `bun test test/hidden-tests.test.js`.

## Step 4: Invariants collector + record schemas

`runInvariants` stops deriving a verdict; schemas carry the grade.

- Modified: `libraries/libharness/src/benchmark/invariants.js`,
  `libraries/libharness/src/benchmark/result.js`,
  `libraries/libharness/test/benchmark-invariants.integration.test.js`
  (home of the `runInvariants` unit tests; Step 6 renames it — see the
  sequencing note), `libraries/libharness/test/benchmark-result.test.js`

`invariants.js`: the result becomes `{details, exitCode, stderr?}` — no
`verdict` field. The absent-hook early return keeps
`{details: [], exitCode: 0}`. Unparseable fd-3 lines stay `parseError` rows
in `details` (they grade as malformed in Step 1).

Sequencing note: `commands/benchmark-invariants.js` (deleted in Step 6)
imports `validateInvariantsRecord` and branches on `invariants.verdict`, so
Steps 4–6 form one verification unit — the full suite is green only after
Step 6 lands.

`result.js`:

| Schema | Change |
| --- | --- |
| `INVARIANTS_SHAPE` | drops `verdict` |
| `HAPPY_RECORD` | new **required** `grade: {verdict, gatesPass, score?: 0–1, malformed?: int ≥ 1}` — no optional-for-compat softening; a pre-break record fails validation and `report` skips it via the existing schema-skip path; optional `hiddenTests: {details: unknown[], error?: string}`; optional top-level `score: 0–1` (effective, judge-zeroed — the value `report` aggregates) |
| `PREFLIGHT_RECORD` | `grade`, `hiddenTests`, `score` all `z.undefined().optional()` (branch stays grade-free) |
| `GRADE_RECORD_SCHEMA` | replaces `INVARIANTS_RECORD_SCHEMA`: `{taskId, grade, invariants, hiddenTests?, exitCode}` (`exitCode` mirrors the script, diagnostic only) |

Tests: invariants result carries no verdict; schema accept/reject cases
(`score: 1.5`, `grade.malformed: 0` rejected, preflight with `grade`
rejected, happy record without `grade` rejected — a pre-break ledger record
must fail validation, not render).

Verification:
`bun test test/benchmark-invariants.integration.test.js test/benchmark-result.test.js`.

## Step 5: Runner composition + judge templating

Merge, grade, and compose in `#executeCell`; the judge sees the grade.

- Modified: `libraries/libharness/src/benchmark/runner.js`,
  `libraries/libharness/src/benchmark/judge.js`
- Created: `libraries/libharness/test/benchmark-runner-score.test.js`

`#executeCell`, after the agent run: invariants collector → hidden-test
engine (`runHiddenTests` behind a new `runHiddenTests` test seam, defaulted
like the other hooks; an engine throw is caught — its message lands on
`hiddenTests.error` and health fails) → stamp `source` on each row
(`"invariants"` / `"tests"`) → merge (invariants rows first) →
`gradeChecks(rows, healthy)` where
`healthy = invariants.exitCode === 0 && !engineError` → judge → record.

The record's `grade` is the **normalized projection** of the raw
`gradeChecks` return — `fullMarks` dropped, `score` omitted when `null`,
`malformed` omitted when `0` — since the raw shape (`score: null` on every
binary task, `malformed: 0` on every clean run) fails the Step 4 schema:

```js
const grade = normalizeGrade(gradeChecks(rows, healthy));
const judgePass = judgeVerdict === null || judgeVerdict.verdict === "pass";
const verdict = grade.verdict === "pass" && judgePass ? "pass" : "fail";
const scoreValid = healthy && grade.gatesPass && judgePass;
grade,
...(task.tests && { hiddenTests: { details: hiddenRows,
    ...(engineError && { error: engineError.message }) } }),
...(grade.score !== undefined && { score: scoreValid ? grade.score : 0 }),
```

The preflight branch and `#buildPreflightFailureRecord` are untouched
(grade-less zeros resolve at aggregation).

`judge.js`: `runJudge`'s third parameter changes from the invariants result
to the grade result — `runJudge(task, workdir, gradeResult, deps, context)`
where `gradeResult = {...grade, rows}` (merged, source-stamped rows) — and
the template renders `{{GRADE_RESULT}}` as
`JSON.stringify(gradeResult, null, 2)`, dropping `{{INVARIANTS_RESULT}}`.
Update the seam-contract JSDoc on `runner.js` (`_runJudgeHook`) and the
injected judge mocks in `benchmark-e2e.integration`, `benchmark-shard`, and
`benchmark-runner-concurrency`, which read `invariants.verdict` today. The
judge runs after the engine's restoration, so it sees the workdir as the
agent left it.

Tests mirror the `benchmark-runner-concurrency.test.js` setup (fixture
family, injected `runAgent`/`runJudge`/`runInvariants`/`runHiddenTests`
seams); each case asserts the yielded record:

| Injected collectors / judge | Expected record |
| --- | --- |
| healthy, gates pass, scored 2/3, judge pass | `verdict: "fail"`, `score ≈ 2/3` |
| healthy, gates pass, full marks, judge pass | `verdict: "pass"`, `score: 1` |
| invariants exit 1, all rows passing | `verdict: "fail"`, `score: 0` |
| engine throws, all rows passing | `verdict: "fail"`, `score: 0` |
| healthy, failing gate row, scored rows passing | `verdict: "fail"`, `score: 0` |
| healthy, full marks, judge **fail** | `verdict: "fail"`, `score: 0` |
| healthy, gate rows only (binary) | no `score` key, `grade` without `score`/`malformed` keys, passes the schema |
| one malformed row | `verdict: "fail"`, `grade.malformed: 1` |
| engine throw | `hiddenTests.error` carries the message |
| rows from both producers | merged `source`-stamped rows reach the judge template |

Every record must pass `validateResultRecord`.

Verification: `bun test test/benchmark-runner-score.test.js`.

## Step 6: `grade` subcommand

The full mechanical grade against a post-run directory; replaces
`invariants`.

- Created: `libraries/libharness/src/commands/benchmark-grade.js`
- Deleted: `libraries/libharness/src/commands/benchmark-invariants.js`
- Modified: `libraries/libharness/src/commands/benchmark-definition.js`
  (subcommand renamed; description states rows are authoritative and both
  producers run; the `examples` array's `fit-benchmark invariants --family=…`
  entry updates to `grade`), `test/benchmark-invariants.integration.test.js`
  (renamed to `benchmark-grade.integration.test.js`),
  `test/golden/fit-benchmark/` help goldens (deliberate refresh — the old
  name and description state the old contract)

The command runs the invariants collector and the hidden-test engine exactly
as the runner does (no judge; judge-zeroing does not apply), grades, emits the
`GRADE_RECORD_SCHEMA` record, and returns `ok` iff
`grade.verdict === "pass"`. The record's `exitCode` field keeps mirroring the
script for diagnosis.

Tests: on-disk family under `mkdtemp` (`agent.task.md`, `hooks/invariants.sh`
`chmod 0o755`, and a `tests/` overlay), `createDefaultRuntime()`, `--output`
to a temp file: partial scored completion → fractional `score`, `ok: false`;
full marks → `ok: true`, `score: 1`; passing rows + invariants exit 1 →
`score: 0`, `ok: false`; gate rows only → no `score` key; hidden-suite
checks graded without an agent run.

Verification: `bun test test/benchmark-grade.integration.test.js` and the
refreshed goldens.

## Step 7: Report aggregation

`meanScore` + `scoreAtK` per scored task group.

- Modified: `libraries/libharness/src/benchmark/report.js`
- Created: `libraries/libharness/test/benchmark-report-score.test.js`,
  `libraries/libharness/test/report-helpers.js` (lift the
  `baseRecord`/`jsonlRuntime` setup copy-pasted between
  `benchmark-report.test.js` and `benchmark-report-merge.test.js`, and
  migrate both files onto it in the same step — the lift only collapses the
  duplication if the copies go; the migration is mechanical and
  behavior-free)

In `aggregate`, per task group:

- Group is scored iff `group.some((r) => r.score !== undefined)`.
- Effective per-record score: `r.score ?? (r.verdict === "pass" ? 1 : 0)`
  (degenerate rule — covers preflight failures that never reached grading).
- `task.meanScore` = mean of effective scores; `task.scoreAtK[k]` per design
  § Estimator: sort effective scores ascending,
  `score@k = Σ_{i=k..n} s₍ᵢ₎ · C(i−1, k−1) / C(n, k)` using the existing
  BigInt `binomial` helper (`Number()` the two coefficients, same idiom as
  `passAtKValue`); `k > n` → `{error: "k > n"}`.
- Binary groups gain neither field (JSON additive, scored tasks only).

Tests: binary 0/1 scores reproduce `passAtK` within `1e-12` (per-term
summation can drift a ulp from the single-division form — assert closeness);
fractional scores `[0.5, 1]` → `score@1 = 0.75`, `score@2 = 1`; mixed group
(scored records + a score-less preflight fail + a score-less pass) applies
0 and 1 degenerates; all-binary group → no `meanScore`/`scoreAtK` keys;
`k > n` error shape.

Verification: `bun test test/benchmark-report-score.test.js`.

## Step 8: Report rendering

Score columns, merged checks table, and malformed warnings.

- Modified: `libraries/libharness/src/benchmark/report.js` (rendering half),
  tests in `benchmark-report-score.test.js`
- `buildRunDetail` copies `grade`, `hiddenTests`, and `score` onto the run
  detail; the runs-table "Invariants" column becomes "Checks", driven by
  `grade.verdict` — preflight rows (the one grade-less branch in the schema)
  render `—`.
- Compute the report-level condition once — `report.tasks.some((t) =>
  t.meanScore !== undefined)` — and thread it through `renderFullReport` →
  `renderTaskDetail` → `renderRunsTable`.
- `renderPassAtKTable`: under that condition, append a `score` column (mean,
  `toFixed(4)`) and one `score@{k}` column per k; binary rows render `—`.
- `renderRunsTable`: append a `Score` column under the same condition (`—`
  for score-less runs).
- The per-task checks table (`collectInvariantRows` renamed accordingly)
  merges both producers' rows and adds a Source column when any row carries
  `source: "tests"`.
- Task detail: for each run with a positive `grade.malformed`, an Errors
  bullet: `- **Run N:** ⚠️ M malformed check row(s) — counted as failing`.

Tests: mixed ledger shows the new columns with `—` on the binary row; a
binary-only ledger renders no score columns and no score keys in JSON;
merged checks table with Source column when hidden-test rows exist; malformed
warning renders; a preflight record renders `—` in the Checks column; a
pre-break-shaped record (no `grade`) fails validation and lands in
`totals.skipped` with the existing warning; compact report gains the same
pass@k-table columns (it shares `renderPassAtKTable`).

Verification: `bun test test/benchmark-report-score.test.js`.

## Step 9: `fit-trace assert --gate` and `--weight`

Role flags on the standard assertion helper, emit-then-fail on every
failure path.

- Modified: `libraries/libharness/src/commands/assert.js`,
  `libraries/libharness/bin/fit-trace.js`,
  `libraries/libharness/test/assert.test.js`
- CLI definition: `weight` (string, "attach a numeric weight; 0 marks the row
  diagnostic") and `gate` (boolean, "mark the row a gate check").
- `evaluateAssertion`: `--gate` sets `output.gate = true`; `--weight` is
  `Number()`ed — a finite number ≥ 0 sets `output.weight`, anything else is
  invalid; `--gate` with any `--weight` (0 included — a stray weight must
  never silently disarm a gate) is invalid.
- **Emit-then-fail on every failure path:** `runAssertCommand`'s catch
  branch today returns the error envelope *without writing a row* (an
  errored evaluation — e.g. `--grep` against a file the agent deleted —
  vanishes from the denominator once hooks append `|| true`). Rework it so
  every failure — invalid grading flags and thrown evaluations alike —
  writes `{"test": <name>, "pass": false, "message": "assert: <reason>"}`
  to stdout before returning `{ok: false}` (spec requirement 13).
  Assertion-failure exit semantics are otherwise unchanged (the exit code
  no longer matters inside `invariants.sh`).

Tests: `--gate` and `--weight` appear on emitted rows; `--weight 0` emits a
diagnostic row; invalid weights (`-1`, `abc`), `--gate --weight 2`, and
`--gate --weight 0` emit a failing row *and* return `ok: false`; `--grep`
against a missing file emits a failing row and returns `ok: false`; no flags
→ row byte-identical to today.

Verification: `bun test test/assert.test.js`; fit-trace help goldens refresh
only if the new options surface in pinned output.

## Step 10: Migrate test fixtures and affected suites

The libharness suites become the first consumers of the new contract.

- Modified: the four hooks under
  `libraries/libharness/test/fixtures/benchmark-family/tasks/*/hooks/`, the
  four fixture `judge.task.md` files (same variable rename as Step 11 —
  `judge.js` stops substituting `{{INVARIANTS_RESULT}}` in Step 5, and
  `benchmark-e2e.integration.test.js:234` asserts the judge prompt is
  substituted), plus every suite asserting exit-code-derived verdicts
  (`benchmark-e2e.integration`, `benchmark-runner-concurrency`,
  `benchmark-shard`, the invariants suite)
- Created: `test/fixtures/benchmark-family/tasks/scored/` — a fixture task
  with a two-check `tests/` overlay (one trivially passing, one trivially
  failing `node --test` file) so the e2e suite exercises the engine, a
  fractional score, and the restoration property against a real subprocess.

Fixture hook rewrites (all end `exit 0`; roles keep these tasks binary so
e2e verdict expectations and any score-free assertions hold):

| Fixture | Row |
| --- | --- |
| `pass` (service probe) | `{"test":"probe","pass":true/false,"gate":true}` — keep the `: > "$SENTINEL"` side effect (the e2e isolation property depends on it) |
| `fail` | `{"test":"forced-fail","pass":false,"gate":true}` |
| `repo-state` | `{"test":"file"/"sha", …, "gate":true}` |
| `preflight-broken` | unchanged (unreachable) |

Sweep the suites for assertions on `invariants.verdict` /
`invariants.exitCode`-as-verdict and update to grade-based expectations.
The new `scored` fixture also moves the fixture family's task count from
four to five: update the pinned assertions
(`benchmark-task-family.integration.test.js` task-id list,
`benchmark-e2e.integration.test.js` `records.length === 8`,
`benchmark-shard.test.js` cell-count bounds).

Verification: full `bun test` in `libraries/libharness` green.

## Step 11: Migrate the family tasks

Structural rows in the eight remaining hooks; the leading example moves to
the `tests/` overlay; judge templates rename.

- Modified: eight `benchmarks/*/tasks/*/hooks/invariants.sh` (mechanical
  rewrite per design § Migration: one
  `check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }` helper,
  `--gate` on presence/sanity/anti-tamper checks, content checks left as
  default-weight scored rows, no `FAIL`, final `exit 0`, early `exit 0` after
  a failing dependency gate), all nine `judge.task.md` files
  (`{{INVARIANTS_RESULT}}` → `{{GRADE_RESULT}}`), the three family READMEs
  (grading rows per task)
- `fit-wiki/cli-fix` additionally rewrites its nonstandard
  `{"id","verdict"}` rows to `test`/`pass` shape (they would grade as
  malformed under the row contract).
- `implement-feature` gets the overlay conversion, all under
  `tests/app/test/` (the mirror of the app's test directory):
  - Created: `todo.gate.test.js` — the pristine-baseline gate — as a symlink
    to `../../../../../workdir/app/test/todo.test.js` (the engine resolves
    symlinks at stage time, so the baseline has one source and no drift
    pair); `feature-helpers.js` (support: shared `appDir`/`bin` derivation,
    store loader, sample todos — no `.test.js` suffix, so never graded); and
    five scored check files — each one `node:test` case split from today's
    `feature.test.js`: `filter-selects-matching`, `filter-case-insensitive`,
    `filter-no-match`, `list-filter-output`, `list-no-filter`
    (all `<name>.test.js`)
  - Deleted: `hooks/invariants.sh`, `hooks/feature.test.js`
  - `preflight.sh` unchanged. `judge.task.md`: besides the variable rename,
    rewrite the prose describing the old mechanism ("The invariants already
    ran the hidden tests") to say the harness ran the hidden suite — the
    engine's restoration means the judge needs no exemption for staged
    files.

Verification (spec criteria 12–13, run locally, nothing committed):
hand-build three `--run-dir` fixtures under `tmp/` — partial implementation
→ `fit-benchmark grade` reports `ok: false` with `0 < score < 1`; complete →
`ok: true`, `score: 1`; empty `cwd/` → failing baseline gate row, score 0.
`grep -rn 'FAIL\|cp .*test' benchmarks/*/tasks/*/hooks/invariants.sh`
returns nothing. Spot-run one task per family end-to-end if budget allows.

## Step 12: Documentation

State the row contract, the hidden-suite layout, and the exit-code demotion
on every surface that states the old contract.

- Modified: `.claude/skills/fit-benchmark/SKILL.md`,
  `.claude/skills/fit-benchmark/references/authoring.md`,
  `.claude/skills/fit-benchmark/references/cli.md`,
  `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`,
  `benchmarks/README.md`

| Surface | Content |
| --- | --- |
| SKILL.md | Lifecycle step 3 rewritten: rows are authoritative, roles table (gate/scored/diagnostic), two producers (hidden `tests/` overlay run by the harness; `invariants.sh` for structural checks), exit code = script health; Result Records mentions `grade` and the optional `score`; Grading Surfaces examples updated. |
| references/authoring.md | Two authoring paths, clearly split: **hidden test suites** — the `tests/` layout convention (overlay mirror, `*.test.js` = one scored check, `*.gate.test.js` = gate, other files = support, fixed `node --test` runner, symlinked baseline pattern, restoration guarantee) with the worked `implement-feature` example; **structural checks** — the single `check()` helper (no `FAIL` bookkeeping — both existing snippet sites), the roles table, default weight 1, `--gate` for presence/sanity/anti-tamper, `weight: 0` diagnostics, the crash rule, the early-`exit 0` dependency pattern, when a check belongs in the suite versus the script, and validating either with `fit-benchmark grade` before paying for agent runs. |
| references/cli.md | `grade` (replacing `invariants`): runs both producers, process exit mirrors the graded verdict; `report`: `meanScore`/`scoreAtK` fields, score columns, degenerate rule one-liner. |
| Run a Benchmark guide | Task layout gains `tests/`; `#### hooks/invariants.sh` rewritten to structural checks with a gate + scored example; a new `#### tests/` section with a worked overlay example; § Aggregate Into pass@k gains mean score and `score@k` (expected best-of-k, continuous analog of pass@k). |
| benchmarks/README.md | Layout tree gains `tests/ — hidden test suite; staged and run by the harness, one row per check`; `invariants.sh — structural rubric; rows are the verdict (exit code = script health)`; one paragraph on the layout convention and gate vs scored rows. |

Skill `## Documentation` lists and CLI `documentation` arrays are unchanged
(no new guides), so the parity rule needs no edit.

Verification: `rg -n 'exit code'` over the skill directory, the Run a
Benchmark guide, and `benchmarks/README.md` shows no surviving claim that
the exit code is the verdict; `grep -rn 'INVARIANTS_RESULT'` over `.claude`,
`benchmarks`, `libraries`, and `websites` returns nothing (the variable
survives today in the skill's template-variable table and twice in the Run
a Benchmark guide, which Steps 10–12 must all clear); `bun run check`
passes.

## Step 13: Full verification sweep

- Modified: none

`bun run check` at the repo root and `bun test` in `libraries/libharness`.
Golden diffs under `test/golden/` are expected **only** for the command
rename and descriptions Steps 6 and 9 deliberately touched; any other golden
diff is a regression. Paste clean check + test output into the PR.

## Risks

- **Test blast radius.** Every suite that encodes "exit code is the verdict"
  breaks by design. Step 10 does the sweep in one place, before the family
  hooks move, so failures localize to the contract change rather than
  smearing across migration commits.
- **A crashed grader and a failed gate now look alike at the verdict level**
  (both `fail`, score 0). They differ on the record — nonzero `exitCode` +
  `stderr` versus a failing gate row — and the report's run detail shows
  both; no aggregate distinguishes them, which is acceptable for now.
- **Semantics break across ledgers.** Pre-break ledgers are abandoned by
  design: their records fail the new schema and `report` skips them with the
  existing per-record warning — no rendering fallback exists. The PR
  description and `benchmarks/README.md` say so, and the first post-merge
  scheduled run starts the new baseline.
- **Restoration fidelity.** The engine's backup/restore is the judge's
  guarantee that it grades the agent's work; a bug here silently biases the
  scope judge. Step 3's restoration test asserts byte-identical collided
  files and absent staged files, and the new `scored` fixture exercises it
  end-to-end against a real subprocess.
- **Symlinked baseline.** `tests/app/test/todo.gate.test.js` as a symlink
  removes the drift pair but relies on symlink support (fine on the
  macOS/Linux dev and CI targets; the canonical-tree hash already resolves
  symlinks). If a platform constraint appears, fall back to a byte-copy
  named as an accepted drift pair in the family README.
- **Hung hidden tests.** A wedged test process would stall the cell inside
  the grading phase, outside the agent watchdog. The engine's fixed 120 s
  per-check timeout bounds it; the timeout row keeps the failure visible.
- **The convention is rigid on purpose.** `node --test`, weight 1, and
  filename-marked gates cover every current family; a family needing a
  different runner or weights is a future spec, not a config knob. The risk
  is a workaround culture (wrapper `.test.js` shims); the authoring docs say
  to write the spec instead.
- **`report.js` nearing the file-length lint ceiling.** Steps 7 and 8 both
  land in it; if the ceiling trips, extract the `scoreAtK` estimator next to
  `gradeChecks` in `grade.js` rather than waiving the lint.
- **`Number(binomial(...))` overflow for very large n** in `scoreAtK` — the
  same exposure `passAtKValue` already carries; keeping the idiom is
  deliberate (one estimator idiom), not an oversight to fix here.

## Execution

Single unit, one implementation PR. Steps 1→8 are sequential along the data
flow (each consumes the previous step's exports), with two exceptions:
Step 2 and Step 1 are independent, and Step 9 is independent and can
interleave anywhere. Step 10 depends on Steps 4–6; Step 11 depends on
Steps 6 and 9 (hooks use the new flags and are validated with the `grade`
subcommand); Step 12 last, after the contracts it documents are locked.
Route the whole plan to an engineering agent via `kata-implement` — the
documentation step cites helper patterns shipped in the same PR, so splitting
it to `technical-writer` would only add a handoff.

— Staff Engineer 🛠️
