# Plan 2240-a — Scored Benchmark Tasks

Implements [design-a.md](design-a.md) for [spec 2240](spec.md).

**Approach.** Build bottom-up along the design's data flow: the pure derivation
first, then the schemas that carry its output, then the two callers (runner,
`invariants` subcommand), then report aggregation and rendering, then the
authoring surface (`fit-trace assert --weight`), the `implement-feature`
conversion, and finally documentation. Every step lands with its tests; judged
tasks flow through untouched code paths at each step, so the existing suite
doubles as the compatibility check (spec criterion 2). The design's paths
predate the current layout: benchmark modules live under
`libraries/libharness/src/benchmark/` and CLI handlers under
`libraries/libharness/src/commands/`; the fit-trace CLI definition is inline in
`libraries/libharness/bin/fit-trace.js`.

Libraries used: libharness (benchmark runner/report/result, fit-trace assert),
zod (record schemas), libmock + libutil (test runtimes).

## Step 1: Score derivation module

One pure function owning the arithmetic of design § The scored-row convention.

- Created: `libraries/libharness/src/benchmark/score.js`,
  `libraries/libharness/test/benchmark-score.test.js`

`deriveScore(details)` → `{score, fullMarks, malformed} | null`:

- Skip rows that are not plain objects (the fd-3 parser pushes any valid JSON
  line verbatim, so a bare `null`, number, or string reaches `details`) and
  rows carrying `parseError` — both diagnostic only, never scored.
- A row is a scored check iff it has a `weight` key (`Object.hasOwn`).
- A scored check is **valid** iff `weight` is a finite number > 0 and `pass`
  is a boolean; otherwise it is malformed and counts as failing.
- Denominator: valid checks at their own weight; malformed checks with an
  invalid weight at unit weight 1; malformed checks with a valid weight at
  their own value. Numerator: valid checks with `pass === true`.
- `malformed` = malformed-check count. `fullMarks` = integer count predicate:
  `malformed === 0 && passingCount === scoredCount` — never a float
  comparison against `score === 1`.
- Zero scored checks → return `null`.

Test cases: weighted fraction over mixed weights; unweighted rows ignored;
all-diagnostic details → `null`; invalid weight (string, 0, negative,
Infinity, NaN) → failing at unit denominator weight + `malformed` counted;
valid weight with missing/non-boolean `pass` → failing at own weight;
`parseError` rows and non-object rows (`null`, `42`, `"text"`) skipped
without throwing; `fullMarks` true only when every scored check is
valid and passing; fractional weights (e.g. 0.1 × 3) still yield
`fullMarks: true` when all pass.

Verification: `bun test test/benchmark-score.test.js` in `libraries/libharness`.

## Step 2: Record schemas

Additive optional `score` / `malformedChecks` on both record shapes.

- Modified: `libraries/libharness/src/benchmark/result.js`,
  `libraries/libharness/test/benchmark-result.test.js`

| Schema | Change |
| --- | --- |
| `HAPPY_RECORD` | `score: z.number().min(0).max(1).optional()`, `malformedChecks: z.number().int().min(1).optional()` |
| `PREFLIGHT_RECORD` | both as `z.undefined().optional()` (branch stays score-free) |
| `INVARIANTS_RECORD_SCHEMA` | same two optional fields as `HAPPY_RECORD` |

Tests: happy record with `score: 0.6` accepted; `score: 1.5` and `score: -0.1`
rejected; `malformedChecks: 0` rejected; preflight record with a `score`
rejected; invariants record with `score` + `malformedChecks` accepted; the
existing fixtures pass unmodified.

Verification: `bun test test/benchmark-result.test.js`.

## Step 3: Runner verdict + score composition

Compose gates, full marks, and effective score in `#executeCell`.

- Modified: `libraries/libharness/src/benchmark/runner.js`
- Created: `libraries/libharness/test/benchmark-runner-score.test.js`

In `#executeCell`, after the judge block:

```js
const derivation = deriveScore(invariants.details);
const gatesPass =
  invariants.verdict === "pass" &&
  (judgeVerdict === null || judgeVerdict.verdict === "pass");
const verdict =
  gatesPass && (derivation === null || derivation.fullMarks) ? "pass" : "fail";
// on the record:
...(derivation && { score: gatesPass ? derivation.score : 0 }),
...(derivation && derivation.malformed > 0 && { malformedChecks: derivation.malformed }),
```

The preflight branch and `#buildPreflightFailureRecord` are untouched (design:
row-less zeros resolve at aggregation).

Tests mirror the `benchmark-runner-concurrency.test.js` setup — fixture family
`test/fixtures/benchmark-family`, `task: "pass"`, `runs: 1`, injected
`runAgent`/`runJudge`/`runInvariants` seams; each case injects an
`InvariantsResult` and asserts the yielded record:

| Injected invariants / judge | Expected record |
| --- | --- |
| exit 0, weighted 2 pass + 1 fail (w=1), judge pass | `verdict: "fail"`, `score ≈ 2/3` |
| exit 0, all weighted pass, judge pass | `verdict: "pass"`, `score: 1` |
| exit 1, all weighted rows passing | `verdict: "fail"`, `score: 0` |
| exit 0, all weighted pass, judge **fail** | `verdict: "fail"`, `score: 0` |
| exit 0, unweighted rows only | no `score` key, `verdict: "pass"` |
| exit 0, one malformed weighted row | `verdict: "fail"`, `malformedChecks: 1` |

Every record must pass `validateResultRecord`.

Verification: `bun test test/benchmark-runner-score.test.js` plus the existing
runner/e2e suites unmodified.

## Step 4: `invariants` subcommand

Same derivation, invariants-gate ∧ full-marks process exit (no judge here).

- Modified: `libraries/libharness/src/commands/benchmark-invariants.js`,
  `libraries/libharness/test/benchmark-invariants.integration.test.js`
  (gains a command-level `describe` block; at 144 lines it has ample room)

After `runInvariants`: derive, and compute the gate **once** —
`const gatePass = invariants.verdict === "pass"` — used for both faces (the
same `verdict` idiom Step 3 uses; never re-derive from `exitCode`). The record
gains `score` (`gatePass ? derivation.score : 0`) and `malformedChecks` when
> 0, both only when derivation is non-`null`. The record's `exitCode` field
keeps mirroring the script. The command's return becomes `ok` iff
`gatePass && (derivation === null || derivation.fullMarks)`.

Do **not** touch the command's description or the examples in
`src/commands/benchmark-definition.js` — the `test/golden/fit-benchmark/`
help goldens capture them.

Tests: build a minimal on-disk family (`mkdtemp` root with
`tasks/t1/agent.task.md` + `tasks/t1/hooks/invariants.sh`, the script
`chmod 0o755` — the task loader treats a non-executable hook as absent) and
invoke `runBenchmarkInvariantsCommand` with `createDefaultRuntime()` and
`--output` pointing at a temp file (avoids stdout capture): partial weighted
emission → record `score` fractional, return `ok: false`; full marks + exit 0
→ `ok: true`, `score: 1`; exit 1 with passing weighted rows → `score: 0`; no
weighted rows → record has no `score` key and today's exit semantics.

Verification: `bun test test/benchmark-invariants.integration.test.js`.

## Step 5: Report aggregation

`meanScore` + `scoreAtK` per scored task group.

- Modified: `libraries/libharness/src/benchmark/report.js`
- Created: `libraries/libharness/test/benchmark-report-score.test.js`,
  `libraries/libharness/test/report-helpers.js` (`benchmark-report.test.js`
  is 420 lines, already over the 400-line target in
  `.claude/rules/test-file-shape.md` — new coverage goes in the sibling, and
  the `baseRecord`/`jsonlRuntime` setup already copy-pasted between
  `benchmark-report.test.js` and `benchmark-report-merge.test.js` is lifted
  into the helper, which the new sibling imports; migrating the two existing
  files onto it is optional and out of scope)

In `aggregate`, per task group:

- Group is scored iff `group.some((r) => r.score !== undefined)`.
- Effective per-record score: `r.score ?? (r.verdict === "pass" ? 1 : 0)`
  (degenerate rule).
- `task.meanScore` = mean of effective scores; `task.scoreAtK[k]` for each
  `kValues` entry via the design § Estimator: sort effective scores ascending,
  `score@k = Σ_{i=k..n} s₍ᵢ₎ · C(i−1, k−1) / C(n, k)` using the existing
  BigInt `binomial` helper (`Number()` the two coefficients, same idiom as
  `passAtKValue`); `k > n` → `{error: "k > n"}`.
- Judged groups gain neither field (JSON additive, scored tasks only).

Tests: binary 0/1 scores reproduce `passAtK` within `1e-12` for a pass/fail
mix (the per-term summation can drift a ulp from `passAtKValue`'s single
division — assert closeness, not strict equality); fractional case scores
`[0.5, 1]` → `score@1 = 0.75`, `score@2 = 1`; mixed
group (scored records + a score-less preflight fail + a score-less pass) →
mean applies 0 and 1 degenerates; group with no `score` on any record → no
`meanScore`/`scoreAtK` keys; `k > n` error shape.

Verification: `bun test test/benchmark-report-score.test.js` plus
`benchmark-report.test.js` / `benchmark-report-merge.test.js` unmodified.

## Step 6: Report rendering

Score columns and malformed warnings, only when the report contains a scored
task.

- Modified: `libraries/libharness/src/benchmark/report.js` (same PR-step file,
  rendering half), tests in `benchmark-report-score.test.js`
- `buildRunDetail` copies `score` and `malformedChecks` onto the run detail.
- Compute the report-level condition once — `report.tasks.some((t) =>
  t.meanScore !== undefined)` — and thread it as a parameter through
  `renderFullReport` → `renderTaskDetail` → `renderRunsTable` (a signature
  change to those private renderers).
- `renderPassAtKTable`: under that condition, append a `score` column (mean,
  `toFixed(4)`) and one `score@{k}` column per k; judged rows render `—`.
  No scored task → byte-identical table.
- `renderRunsTable`: append a `Score` column under the same condition (`—`
  for score-less runs).
- Task detail: for each run with `malformedChecks`, add a bullet to the
  Errors section: `- **Run N:** ⚠️ M malformed scored check row(s) — counted
  as failing`.

Tests: text report over a mixed ledger shows the new columns with `—` on the
judged row; a judged-only ledger renders **no** `score`/`score@`/`Score`
column and no score keys in JSON (the unmodified `benchmark-report.test.js`
assertions are the judged-unchanged proof — no snapshot capture needed);
malformed warning renders; compact report gains the same pass@k-table columns
(it shares `renderPassAtKTable`).

Verification: `bun test test/benchmark-report-score.test.js`; SC6 covered by
the mixed-ledger case.

## Step 7: `fit-trace assert --weight`

Weight emission through the standard assertion helper.

- Modified: `libraries/libharness/src/commands/assert.js`,
  `libraries/libharness/bin/fit-trace.js`,
  `libraries/libharness/test/assert.test.js`
- CLI definition (assert command options in `bin/fit-trace.js`): add
  `weight: { type: "string", description: "Attach a positive numeric weight
  to the emitted row, marking it a scored check" }`. Do not add examples —
  the top-level help golden lists commands and examples only, so the option
  is golden-neutral.
- `evaluateAssertion`: when `values.weight` is present, `Number()` it; not a
  finite number > 0 → throw `assert: --weight must be a positive number`;
  otherwise set `output.weight` to the numeric value. Exit semantics
  unchanged (the scored-helper `|| true` lives in the hook, not the command).

Tests: weight appears on the emitted row (pass and fail cases); invalid
weights (`0`, `-1`, `abc`) throw; no `--weight` → row byte-identical to today.

Verification: `bun test test/assert.test.js` and the golden suite
(`bin-smoke.integration.test.js`) unmodified.

## Step 8: Convert `implement-feature` to the leading scored example

Gate on the pristine baseline, score per hidden feature test, keep the judge.

- Created: `benchmarks/kata-skills/tasks/implement-feature/hooks/todo.test.js`
  (byte-copy of `benchmarks/kata-skills/workdir/app/test/todo.test.js` — the
  accepted drift pair), `hooks/feature-checks/feature-helpers.js` (no `.test.js`
  suffix so it never runs as a test; exports the `appDir`/`bin` derivation, a
  `store` loader, `runList`, and the sample todos — one home for the setup all
  five checks share),
  `hooks/feature-checks/{filter-selects-matching,filter-case-insensitive,filter-no-match,list-filter-output,list-no-filter}.test.js`
  (one `node:test` case each, split from today's `feature.test.js`, each
  importing `./feature-helpers.js` and deriving `appDir` as today)
- Deleted: `hooks/feature.test.js`
- Modified: `hooks/invariants.sh`, `benchmarks/kata-skills/README.md`

`invariants.sh` (gate exit code never reflects scored checks):

```sh
#!/bin/sh
set -u
APP="$AGENT_CWD/app"
FAIL=0

if [ ! -d "$APP" ]; then
  echo '{"test":"app-present","pass":false}' >&"$RESULTS_FD"
  exit 1
fi

# Gate: pristine baseline restored from hooks/ (the agent-editable copy in
# app/test/ cannot vouch for itself), run alone so agent-added test files
# cannot flip the gate.
cp "$HOOKS_DIR/todo.test.js" "$APP/test/todo.test.js"
if (cd "$APP" && node --test test/todo.test.js >/dev/null 2>&1); then
  echo '{"test":"baseline-tests","pass":true}' >&"$RESULTS_FD"
else
  echo '{"test":"baseline-tests","pass":false,"message":"baseline suite failed"}' >&"$RESULTS_FD"
  FAIL=1
fi

# Scored checks: one hidden test file per check, its process exit is the row.
cp "$HOOKS_DIR/feature-checks/feature-helpers.js" "$APP/test/"
for CHECK in "$HOOKS_DIR"/feature-checks/*.test.js; do
  NAME=$(basename "$CHECK" .test.js)
  cp "$CHECK" "$APP/test/"
  if (cd "$APP" && node --test "test/$(basename "$CHECK")" >/dev/null 2>&1); then
    echo "{\"test\":\"$NAME\",\"pass\":true,\"weight\":1}" >&"$RESULTS_FD"
  else
    echo "{\"test\":\"$NAME\",\"pass\":false,\"weight\":1}" >&"$RESULTS_FD"
  fi
done

[ "$FAIL" = 0 ] && exit 0 || exit 1
```

`preflight.sh` and `judge.task.md` are unchanged. Family README: update the
`implement-feature` grading cell (baseline gate, five weighted feature
checks, scope judge), rewrite § Hidden tests for the split layout, and name
the `hooks/todo.test.js` ↔ `workdir/app/test/todo.test.js` drift pair.

Verification (SC 7/8, run locally, nothing committed): hand-build three
`--run-dir` fixtures under `tmp/` — (a) `cwd/app` copied from the family
`workdir/` plus a **partial** hand-written `filterTodos` (case-sensitive
match, no CLI flag) → `bunx fit-benchmark invariants
--family=benchmarks/kata-skills --task=implement-feature --run-dir=…` exits 1
with `0 < score < 1`; (b) a complete implementation → exits 0 with
`score: 1`; (c) an empty `cwd/` → gate fail and **no** `score` key (the hook
exits after the unweighted `app-present` row, so the derivation is `null`;
that record's zero is realized at aggregation, per design).

## Step 9: Documentation

State the scored/judged distinction and the exit-code authoring contract on
every surface the spec names.

- Modified: `.claude/skills/fit-benchmark/SKILL.md`,
  `.claude/skills/fit-benchmark/references/authoring.md`,
  `.claude/skills/fit-benchmark/references/cli.md`,
  `websites/fit/docs/libraries/prove-changes/run-benchmark/index.md`,
  `benchmarks/README.md`

| Surface | Content |
| --- | --- |
| SKILL.md | Two-shape table (judged/scored, opt-in by emitted rows); Lifecycle step 3 gains one sentence: weighted rows make the task scored, exit code stays the gate; Result Records mentions the optional `score`. |
| references/authoring.md | New § Scored tasks, placed inside the existing § invariants authoring contract so the gate helper is stated once and the scored variant sits beside it (the file already carries the gate snippet at two sites — do not add a third): gate `assert() { fit-trace assert "$@" >&"$RESULTS_FD" \|\| FAIL=1; }` vs scored `scored() { fit-trace assert "$@" >&"$RESULTS_FD" \|\| true; }` with `--weight`; the exit-code contract (a failing weighted check must not fail the gate); the process-exit direct-emission pattern (one JSON row per hidden test run); when to author scored vs judged; and the failure mode that an **invalid** `--weight` makes `assert` exit without emitting a row, which `\|\| true` then swallows — silently shrinking the denominator — so always validate scored hooks with `fit-benchmark invariants` against a fixture before paying for agent runs. |
| references/cli.md | `invariants`: exit is now gate ∧ full-marks for scored tasks (record `exitCode` still mirrors the script); `report`: `meanScore`/`scoreAtK` fields and the score columns, degenerate rule one-liner. |
| Run a Benchmark guide | Under `#### hooks/invariants.sh`: a `##### Scored tasks` subsection with the row convention and gate/score split; § Aggregate Into pass@k: bullets for mean score and `score@k` (expected best-of-k, continuous analog of pass@k). |
| benchmarks/README.md | One paragraph in the task-family layout notes: a task whose `invariants.sh` emits `weight` rows is scored; exit code remains the gate. |

Skill `## Documentation` lists and CLI `documentation` arrays are unchanged
(no new guides), so the parity rule needs no edit.

Verification:
`rg -n 'weight' .claude/skills/fit-benchmark websites/fit/docs/libraries/prove-changes/run-benchmark benchmarks/README.md`
shows every surface; `bun run check` passes (markdown format/lint).

## Step 10: Full verification sweep

- Modified: none

Run `bun run check` at the repo root and `bun test` in `libraries/libharness`.
Confirm SC2 explicitly: `git diff --stat` shows no edits under
`test/golden/` and the pre-existing benchmark suites
(`benchmark-e2e.integration`, `benchmark-report`, `benchmark-report-merge`,
`benchmark-parity`, `benchmark-shard`, `benchmark-runner-concurrency`) pass
without modification.

Verification: clean check + test output pasted into the PR.

## Risks

- **Baseline-gate scope narrows.** Today the gate runs the whole `app/test/`
  suite, including files the agent added; after Step 8 it runs only the
  restored pristine baseline. An agent leaving broken tests of its own no
  longer fails the gate — intended (the gate guards regressions and scaffold
  sanity; junk files are the scope judge's lane), but it is a behavior change
  a reviewer comparing old ledgers should know about.
- **Per-file hidden-test runs change failure granularity.** If the agent broke
  `src/store.js` exports outright, today one suite fails once; after the
  split every check file fails individually, yielding score 0 rather than a
  single aggregate row. Same verdict, different detail rows — README's task
  table must describe the new shape so ledger diffs aren't misread.
- **Filename collisions in `app/test/`.** The hook `cp`s check files into the
  agent-writable tree; an agent that happened to create a same-named file is
  silently overwritten. Distinctive `feature-*`/`filter-*` names make this
  unlikely; a collision only ever overwrites in the ephemeral CWD.
- **The judge now sees seven hook-copied files.** The judge session runs
  after invariants, so the workdir it inspects contains the restored
  `todo.test.js`, `feature-helpers.js`, and five check files (today: one
  copied file). If the scope-discipline judge starts flagging them as agent
  scope creep, amend `judge.task.md` to exempt hook-restored test files —
  watch the first real runs for this.
- **`report.js` is nearing the file-length lint ceiling.** Steps 5 and 6 both
  land in it; if the ceiling trips, extract the `scoreAtK` estimator next to
  `deriveScore` in `score.js` (its natural second home) rather than waiving
  the lint.
- **`Number(binomial(...))` overflow for very large n** in `scoreAtK` — the
  same exposure the existing `passAtKValue` already carries; keeping the
  idiom is deliberate (one estimator idiom, design § Estimator), not an
  oversight to fix here.
- **Golden sensitivity.** The fit-benchmark and fit-trace help goldens pin
  command descriptions and examples; Steps 4 and 7 add behavior without
  touching either. Any accidental description edit surfaces as a golden diff
  in Step 10 — treat that as a regression, not a golden refresh.

## Execution

Single unit, one implementation PR. Steps 1→6 are sequential (each consumes
the previous step's exports); Step 7 is independent and can interleave; Step 8
depends on Step 4 (its verification uses the scored `invariants` subcommand);
Step 9 last, after the contracts it documents are locked. Route the whole plan
to an engineering agent via `kata-implement` — the documentation step cites
helper code shipped in the same PR, so splitting it to `technical-writer`
would only add a handoff.

— Staff Engineer 🛠️
