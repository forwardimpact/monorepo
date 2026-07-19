# Plan 2240-a — Scored Benchmark Tasks

Implements [design-a.md](design-a.md) for [spec 2240](spec.md).

**Approach.** Build bottom-up along the design's data flow: the pure grading
derivation first, then the invariants integration and schemas that carry its
output, then the runner and the `invariants` subcommand, then report
aggregation and rendering, then the authoring surface (`fit-trace assert
--gate/--weight`), then the migration — fixtures and their suites before the
nine family hooks — and finally documentation. This is a clean break: existing
suites that assert exit-code-derived verdicts are updated to the row contract,
not preserved. Benchmark modules live under
`libraries/libharness/src/benchmark/` and CLI handlers under
`libraries/libharness/src/commands/`; the fit-trace CLI definition is inline
in `libraries/libharness/bin/fit-trace.js`.

Libraries used: libharness (benchmark runner/report/result/invariants,
fit-trace assert), zod (record schemas), libmock + libutil (test runtimes).

## Step 1: Grading module

One pure function owning the arithmetic of design § The row contract.

- Created: `libraries/libharness/src/benchmark/grade.js`,
  `libraries/libharness/test/benchmark-grade.test.js`

`gradeInvariants(details, exitCode)` →
`{verdict, gatesPass, score, fullMarks, malformed}`:

- Classify each details row per the contract's role order: diagnostic
  (`weight === 0`), gate (`gate === true`, boolean `pass`, no positive
  weight), scored (boolean `pass`, `weight` absent → 1 or finite > 0),
  else malformed. Rows the fd-3 parser marked `parseError` are malformed.
  Non-object rows (a bare `null`, number, or string is valid JSON and reaches
  `details` verbatim) are malformed.
- Malformed → failing scored check: own weight when it carries a valid finite
  weight > 0, else unit weight 1; increments `malformed`.
- `score = Σ weight(passing scored) / Σ weight(all scored)`; `null` when zero
  scored checks (binary task).
- `gatesPass` = every gate row passes (vacuously true).
- `fullMarks` = integer count predicate:
  `malformed === 0 && passingCount === scoredCount` — never a float
  comparison against `score === 1`. Vacuously true with zero scored checks.
- `verdict` = `exitCode === 0 && gatesPass && fullMarks ? "pass" : "fail"`.

Test cases: weighted fraction over mixed weights; absent weight defaults to
1; `weight: 0` rows ignored; gate rows excluded from the score; failing gate
→ `gatesPass` false with score still derived; exit 1 with all-passing rows →
verdict fail (crash cannot mint marks); zero scored checks → `score: null`
and row-less exit-0 → verdict pass (no-op-hook behavior); malformed shapes
(missing/non-boolean `pass`, non-boolean `gate`, `gate` + positive `weight`,
negative/Infinity/NaN/string weight, `parseError` row, non-object row) each
counted failing at the documented weight; `fullMarks` true only when every
scored check is valid and passing; fractional weights (0.1 × 3) still yield
`fullMarks: true` when all pass.

Verification: `bun test test/benchmark-grade.test.js` in
`libraries/libharness`.

## Step 2: Invariants integration + record schemas

Row-derived verdict inside `runInvariants`; additive schema fields.

- Modified: `libraries/libharness/src/benchmark/invariants.js`,
  `libraries/libharness/src/benchmark/result.js`, their tests

`invariants.js`: after parsing the fd-3 buffer, call `gradeInvariants`;
the result becomes `{verdict, details, exitCode, gatesPass, score?,
malformed?, stderr?}` — `verdict` no longer `exitCode === 0`, `exitCode`
kept as the diagnostic mirror, `score`/`malformed` present only when
non-null/positive. The absent-hook early return keeps
`{verdict: "pass", details: [], exitCode: 0, gatesPass: true}`.

`result.js`:

| Schema | Change |
| --- | --- |
| `HAPPY_RECORD` | `score: z.number().min(0).max(1).optional()`, `malformedChecks: z.number().int().min(1).optional()`; the embedded invariants object accepts the new grade fields |
| `PREFLIGHT_RECORD` | both as `z.undefined().optional()` (branch stays score-free) |
| `INVARIANTS_RECORD_SCHEMA` | same two optional fields as `HAPPY_RECORD` |

Tests: existing invariants unit tests updated to the row contract (exit 1 +
passing rows → fail; failing gate row + exit 0 → fail; failing scored row +
exit 0 → fail with fractional score on the result); schema accept/reject
cases (`score: 1.5`, `malformedChecks: 0`, preflight with `score` rejected).

Verification: `bun test test/invariants.test.js test/benchmark-result.test.js`
(actual invariants test filename per repo layout).

## Step 3: Runner composition

Cell verdict and effective score in `#executeCell`.

- Modified: `libraries/libharness/src/benchmark/runner.js`
- Created: `libraries/libharness/test/benchmark-runner-score.test.js`

The existing composition `invariants.verdict ∧ judge` already yields the
spec's verdict now that `invariants.verdict` is row-derived. Add the record
fields:

```js
const judgePass = judgeVerdict === null || judgeVerdict.verdict === "pass";
const scoreValid =
  invariants.exitCode === 0 && invariants.gatesPass && judgePass;
...(invariants.score != null && { score: scoreValid ? invariants.score : 0 }),
...(invariants.malformed > 0 && { malformedChecks: invariants.malformed }),
```

The preflight branch and `#buildPreflightFailureRecord` are untouched
(row-less zeros resolve at aggregation).

Tests mirror the `benchmark-runner-concurrency.test.js` setup (fixture
family, injected `runAgent`/`runJudge`/`runInvariants` seams); each case
injects an `InvariantsResult` and asserts the yielded record:

| Injected invariants / judge | Expected record |
| --- | --- |
| healthy, gates pass, scored 2/3, judge pass | `verdict: "fail"`, `score ≈ 2/3` |
| healthy, gates pass, full marks, judge pass | `verdict: "pass"`, `score: 1` |
| exit 1, all rows passing | `verdict: "fail"`, `score: 0` |
| healthy, failing gate row, scored rows passing | `verdict: "fail"`, `score: 0` |
| healthy, full marks, judge **fail** | `verdict: "fail"`, `score: 0` |
| healthy, gate rows only (binary) | no `score` key, verdict from gates |
| one malformed row | `verdict: "fail"`, `malformedChecks: 1` |

Every record must pass `validateResultRecord`.

Verification: `bun test test/benchmark-runner-score.test.js`.

## Step 4: `invariants` subcommand

Process exit mirrors the row-derived verdict.

- Modified: `libraries/libharness/src/commands/benchmark-invariants.js`,
  `libraries/libharness/src/commands/benchmark-definition.js` (the command
  description stops saying the exit code is authoritative),
  `libraries/libharness/test/benchmark-invariants.integration.test.js`,
  `test/golden/fit-benchmark/` help goldens (deliberate refresh — the old
  description states the old contract)

The command's return is `ok` iff `invariants.verdict === "pass"`. The record
gains `score` / `malformedChecks` straight off the invariants result (no
judge runs here; the runner's judge-zeroing does not apply). The record's
`exitCode` field keeps mirroring the script.

Tests: on-disk family under `mkdtemp` (`agent.task.md` +
`hooks/invariants.sh`, `chmod 0o755`), `createDefaultRuntime()`, `--output`
to a temp file: partial scored emission + exit 0 → record `score` fractional,
`ok: false`; full marks → `ok: true`, `score: 1`; passing rows + exit 1 →
`score: 0`, `ok: false`; gate rows only → no `score` key.

Verification: `bun test test/benchmark-invariants.integration.test.js` and
the refreshed goldens.

## Step 5: Report aggregation

`meanScore` + `scoreAtK` per scored task group.

- Modified: `libraries/libharness/src/benchmark/report.js`
- Created: `libraries/libharness/test/benchmark-report-score.test.js`,
  `libraries/libharness/test/report-helpers.js` (lift the
  `baseRecord`/`jsonlRuntime` setup copy-pasted between
  `benchmark-report.test.js` and `benchmark-report-merge.test.js`; migrating
  the two existing files onto it is optional and out of scope)

In `aggregate`, per task group:

- Group is scored iff `group.some((r) => r.score !== undefined)`.
- Effective per-record score: `r.score ?? (r.verdict === "pass" ? 1 : 0)`
  (degenerate rule — covers preflight failures that never reached the hook).
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

## Step 6: Report rendering

Score columns and malformed warnings, only when the report contains a scored
task.

- Modified: `libraries/libharness/src/benchmark/report.js` (rendering half),
  tests in `benchmark-report-score.test.js`
- `buildRunDetail` copies `score` and `malformedChecks` onto the run detail.
- Compute the report-level condition once — `report.tasks.some((t) =>
  t.meanScore !== undefined)` — and thread it through `renderFullReport` →
  `renderTaskDetail` → `renderRunsTable`.
- `renderPassAtKTable`: under that condition, append a `score` column (mean,
  `toFixed(4)`) and one `score@{k}` column per k; binary rows render `—`.
- `renderRunsTable`: append a `Score` column under the same condition (`—`
  for score-less runs).
- Task detail: for each run with `malformedChecks`, an Errors bullet:
  `- **Run N:** ⚠️ M malformed check row(s) — counted as failing`.

Tests: mixed ledger shows the new columns with `—` on the binary row; a
binary-only ledger renders no score columns and no score keys in JSON;
malformed warning renders; compact report gains the same pass@k-table columns
(it shares `renderPassAtKTable`).

Verification: `bun test test/benchmark-report-score.test.js`.

## Step 7: `fit-trace assert --gate` and `--weight`

Role flags on the standard assertion helper, emit-then-fail on bad input.

- Modified: `libraries/libharness/src/commands/assert.js`,
  `libraries/libharness/bin/fit-trace.js`,
  `libraries/libharness/test/assert.test.js`
- CLI definition: `weight` (string, "attach a numeric weight; 0 marks the row
  diagnostic") and `gate` (boolean, "mark the row a gate check").
- `evaluateAssertion`: `--gate` sets `output.gate = true`; `--weight` is
  `Number()`ed — a finite number ≥ 0 sets `output.weight`, anything else is
  invalid; `--gate` with a positive `--weight` is invalid. **Emit-then-fail:**
  on an invalid combination, `runAssertCommand` still writes
  `{"test": <name>, "pass": false, "message": "assert: <reason>"}` to stdout
  before returning `{ok: false}`, so the row lands in the denominator as a
  failing check instead of vanishing (spec requirement 10). Assertion-failure
  exit semantics are otherwise unchanged (hooks append `|| true`; the exit
  code no longer matters inside `invariants.sh`).

Tests: `--gate` and `--weight` appear on emitted rows; `--weight 0` emits a
diagnostic row; invalid weights (`-1`, `abc`) and `--gate --weight 2`
emit a failing row *and* return `ok: false`; no flags → row byte-identical to
today.

Verification: `bun test test/assert.test.js`; fit-trace help goldens refresh
only if the new options surface in pinned output.

## Step 8: Migrate test fixtures and affected suites

The libharness suites become the first consumers of the new contract.

- Modified: the four hooks under
  `libraries/libharness/test/fixtures/benchmark-family/tasks/*/hooks/`,
  plus every suite asserting exit-code-derived verdicts
  (`benchmark-e2e.integration`, `benchmark-parity`,
  `benchmark-runner-concurrency`, `benchmark-shard`, invariants tests)

Fixture rewrites (all end `exit 0`; roles keep the tasks binary so e2e
verdict expectations and any score-free assertions hold):

| Fixture | Row |
| --- | --- |
| `pass` (service probe) | `{"test":"probe","pass":true/false,"gate":true}` |
| `fail` | `{"test":"forced-fail","pass":false,"gate":true}` |
| `repo-state` | `{"test":"file"/"sha", …, "gate":true}` |
| `preflight-broken` | unchanged (unreachable) |

Sweep the suites for assertions on `invariants.exitCode`-as-verdict and
update to row-role expectations. Add one e2e-level scored case only if the
existing fixture family can absorb it cheaply; otherwise Step 3's seam tests
carry the scored coverage.

Verification: full `bun test` in `libraries/libharness` green.

## Step 9: Migrate the nine family hooks

Mechanical rewrite per design § Migration: one
`check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }` helper, `--gate`
on presence/sanity/anti-tamper checks, content checks left as default-weight
scored rows, no `FAIL`, final `exit 0`, early `exit 0` after a failing
dependency gate.

- Modified: all nine `benchmarks/*/tasks/*/hooks/invariants.sh`, the three
  family READMEs (grading rows per task)
- `fit-wiki/cli-fix` additionally rewrites its nonstandard
  `{"id","verdict"}` rows to `test`/`pass` shape (they would grade as
  malformed under the row contract).
- `implement-feature` gets the full leading-example conversion:
  - Created: `hooks/todo.test.js` (byte-copy of `workdir/app/test/todo.test.js`
    — an accepted drift pair, named in the family README; `$FAMILY_DIR` is
    absent under the `invariants` subcommand),
    `hooks/feature-checks/feature-helpers.js` (no `.test.js` suffix; shared
    `appDir`/`bin` derivation, store loader, sample todos),
    `hooks/feature-checks/{filter-selects-matching,filter-case-insensitive,filter-no-match,list-filter-output,list-no-filter}.test.js`
    (one `node:test` case each, split from today's `feature.test.js`)
  - Deleted: `hooks/feature.test.js`
  - `invariants.sh`: `app-present` gate (early `exit 0` when missing);
    restore the pristine baseline from `$HOOKS_DIR` and run it alone as the
    `baseline-tests` gate row (the agent-editable copy cannot vouch for
    itself; agent-added test files cannot flip the gate); then per check
    file, `cp` + `node --test test/<file>` and emit
    `{"test": <name>, "pass": <exit==0>}` — a default-weight scored row from
    the process exit, no reporter parsing; end `exit 0`.
  - `preflight.sh` and `judge.task.md` unchanged.

Verification (spec criteria 9–10, run locally, nothing committed):
hand-build three `--run-dir` fixtures under `tmp/` — partial implementation
→ `fit-benchmark invariants` reports `ok: false` with `0 < score < 1`;
complete → `ok: true`, `score: 1`; empty `cwd/` → failing gate row, no
`score` key. `grep -rn 'FAIL' benchmarks/*/tasks/*/hooks/invariants.sh`
returns nothing. Spot-run one task per family end-to-end if budget allows.

## Step 10: Documentation

State the row contract and the exit-code demotion on every surface that
states the old contract.

- Modified: `.claude/skills/fit-benchmark/SKILL.md`,
  `.claude/skills/fit-benchmark/references/authoring.md`,
  `.claude/skills/fit-benchmark/references/cli.md`,
  `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`,
  `benchmarks/README.md`

| Surface | Content |
| --- | --- |
| SKILL.md | Lifecycle step 3 rewritten: rows are authoritative, roles table (gate/scored/diagnostic), exit code = script health; Result Records mentions the optional `score`; Grading Surfaces examples updated to row emission. |
| references/authoring.md | The invariants authoring contract rewritten around the single `check()` helper (no `FAIL` bookkeeping — both existing snippet sites): the roles table, default weight 1, `--gate` for presence/sanity/anti-tamper checks, `weight: 0` diagnostics, the crash rule (nonzero exit = grader failure, score 0), the early-`exit 0` dependency pattern, the process-exit direct-emission pattern, when a check is a gate versus scored, and validating hooks with `fit-benchmark invariants` before paying for agent runs. |
| references/cli.md | `invariants`: process exit mirrors the row-derived verdict; `report`: `meanScore`/`scoreAtK` fields, score columns, degenerate rule one-liner. |
| Run a Benchmark guide | `#### hooks/invariants.sh` rewritten to the row contract with a worked gate + scored example; § Aggregate Into pass@k gains mean score and `score@k` (expected best-of-k, continuous analog of pass@k). |
| benchmarks/README.md | Layout notes: `invariants.sh — structural rubric; rows are the verdict (exit code = script health)`; one paragraph on gate vs scored rows. |

Skill `## Documentation` lists and CLI `documentation` arrays are unchanged
(no new guides), so the parity rule needs no edit.

Verification:
`rg -n 'exit code' .claude/skills/fit-benchmark websites/fit/docs/libraries/prove-changes/run-benchmark benchmarks/README.md`
shows no surviving claim that the exit code is the verdict; `bun run check`
passes.

## Step 11: Full verification sweep

- Modified: none

`bun run check` at the repo root and `bun test` in `libraries/libharness`.
Golden diffs under `test/golden/` are expected **only** for the command
descriptions Steps 4 and 7 deliberately touched; any other golden diff is a
regression. Paste clean check + test output into the PR.

## Risks

- **Test blast radius.** Every suite that encodes "exit code is the verdict"
  breaks by design. Step 8 does the sweep in one place, before the family
  hooks move, so failures localize to the contract change rather than
  smearing across migration commits.
- **A crashed hook and a failed gate now look alike at the verdict level**
  (both `fail`, score 0). They differ on the record — nonzero `exitCode` +
  `stderr` versus a failing gate row — and the report's run detail shows
  both; no aggregate distinguishes them, which is acceptable for now.
- **Semantics break across ledgers.** Pre- and post-migration ledgers must
  not be compared; the PR description and `benchmarks/README.md` say so, and
  the first post-merge scheduled run starts the new baseline.
- **Baseline-gate scope narrows** (`implement-feature`): the gate runs only
  the restored pristine baseline, so an agent leaving broken tests of its own
  no longer fails the gate — intended (junk files are the scope judge's
  lane), but a behavior change reviewers should know.
- **The judge now sees seven hook-copied files** in `implement-feature`'s
  workdir (restored baseline, helpers, five check files). If the
  scope-discipline judge starts flagging them as agent scope creep, amend
  `judge.task.md` to exempt hook-restored test files — watch the first real
  runs.
- **Filename collisions in `app/test/`.** The hook `cp`s check files into the
  agent-writable tree; distinctive `filter-*`/`list-*` names make collisions
  unlikely, and a collision only overwrites in the ephemeral CWD.
- **`report.js` nearing the file-length lint ceiling.** Steps 5 and 6 both
  land in it; if the ceiling trips, extract the `scoreAtK` estimator next to
  `gradeInvariants` in `grade.js` rather than waiving the lint.
- **`Number(binomial(...))` overflow for very large n** in `scoreAtK` — the
  same exposure `passAtKValue` already carries; keeping the idiom is
  deliberate (one estimator idiom), not an oversight to fix here.

## Execution

Single unit, one implementation PR. Steps 1→6 are sequential (each consumes
the previous step's exports); Step 7 is independent and can interleave;
Step 8 depends on Steps 2–4; Step 9 depends on Steps 4 and 7 (hooks use the
new flags and are validated with the scored `invariants` subcommand); Step 10
last, after the contracts it documents are locked. Route the whole plan to an
engineering agent via `kata-implement` — the documentation step cites helper
patterns shipped in the same PR, so splitting it to `technical-writer` would
only add a handoff.

— Staff Engineer 🛠️
