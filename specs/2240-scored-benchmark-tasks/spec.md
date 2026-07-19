# Spec 2240 — Scored Benchmark Tasks: Row-Authoritative Grading with a Mechanical Capability Gradient

Every `fit-benchmark` cell (`(task, runIndex)`) collapses to one bit: the
invariants exit code AND the judge verdict. The only signal a skill-pack change
can move is therefore the pass **rate** across repeated runs. pass@k measures
reliability, not capability: a task with a rich hidden test suite grades an
agent that solved 90% of it identically to an agent that produced nothing.

This spec replaces the grading contract. The structured rows a task's
invariants script emits become the **single authoritative grading channel**:
every row is a check, a row's role (gate, scored, diagnostic) is carried in
its own fields, and a mechanical score in [0, 1] is derived from the scored
rows. The script's exit code is demoted to script health — nonzero means "the
grader itself failed", never "the agent failed". This is a **clean break**:
the benchmark has no consumers outside this repository, so we take the
evergreen contract now and migrate every existing hook in the same change
instead of carrying a dual-channel compatibility mode as tech debt.

Serves **Platform Builders** — the persona who hires `fit-benchmark` to *prove
a skill change improved outcomes* (see
[libraries/README.md § Jobs To Be Done](../../libraries/README.md#jobs-to-be-done)).
"Improved" is today only expressible as "flipped cells from fail to pass".
Partial capability gains, the common case while a skill matures, are invisible.

**Classification: internal.** The change lands in `libraries/libharness`,
`benchmarks/`, and published skill/library documentation — no `products/` or
`services/` surface.

## Problem

**One bit per cell.** The runner composes a cell verdict from two binary
gates: the invariants script's exit code and (when present) the judge's
success/failure conclusion. Nothing between 0 and 1 exists in the result
record, so nothing between 0 and 1 can exist in the report.

**The collection mechanism exists; nothing reads it.** A task's invariants
script emits structured per-check rows (`{"test": …, "pass": …}`) on the
results file descriptor; they land in the record's invariants details and the
report renders them per run, but no aggregate reads them. The
`implement-feature` task (kata-skills family) runs a hidden suite of five
feature tests plus the app's baseline tests and reduces all of it to a single
aggregate row and one exit code. An agent that implements the whole `--filter`
feature except case-insensitivity records the same `fail` as an agent that
never edited a file.

**Saturation in both directions.** Once a family passes reliably, pass@k pins
at 1.0 and further skill improvements are unmeasurable; a genuinely hard task
pins at 0.0 with no gradient to climb. Task authors have no way to express
"how far did the agent get", so families are written as all-or-nothing suites
and the benchmark under-reports exactly the changes it exists to prove.

**Two channels invite a fragile coupling.** The incremental fix — weights on
rows while the exit code keeps gating — splits grading semantics across a data
channel and a process channel, held together by a documentation-only contract
("a failing scored check must not fail the exit code"). One wrong helper in a
hook silently zeroes every partial run. With no external users, the coupling
is pure downside; the rows can simply be the contract.

**The naive gradient is worse.** Asking the judge for a graded rubric score
would manufacture a gradient from an LLM's opinion: ambiguous, noisy across
runs, and gameable by persuasive prose in the trace. The gradient must be
mechanical.

## What

One grading channel: the NDJSON rows on the results fd. Every row is a check
by default; a row declares its role with its own fields. The exit code stops
carrying any verdict meaning.

| Row | Role | Grading effect |
| --- | --- | --- |
| `{"test": …, "pass": …, "gate": true}` | **Gate** | Any failing gate → verdict `fail`, score 0. |
| `{"test": …, "pass": …}` or with `"weight": w > 0` | **Scored** | Contributes `w` (default 1) to the weighted score. |
| `{"weight": 0, …}` | **Diagnostic** | Never graded; free-form detail. |
| Malformed or unparseable | **Malformed** | Counts as a failing scored check; surfaced in the report. |

A task with at least one scored row is a **scored task** and its records carry
a score in [0, 1]; a task emitting only gate rows stays **binary**. Both
shapes may carry a judge.

Requirements:

| # | Requirement |
| --- | --- |
| 1 | **Rows are authoritative.** Every row the invariants script emits on the results fd is a check unless it opts out with `weight: 0`. No second channel carries grading semantics. |
| 2 | **Roles live in the row.** `gate: true` marks a gate check; a positive `weight` (default 1 when the key is absent) marks a scored check; `weight: 0` marks a diagnostic. `gate` and a positive `weight` are mutually exclusive on one row. |
| 3 | **Exit code is script health only.** A nonzero exit means the grader itself failed: the run records verdict `fail` and score 0 — a crashed hook can never mint marks from the rows it happened to emit before dying. Check outcomes must never drive the exit code; a well-formed hook ends with `exit 0` unconditionally (early `exit 0` after a failing gate is fine — the gate row already carries the failure). |
| 4 | **Mechanical score.** A scored cell's score is the weighted fraction of passing scored checks: `Σ weight(passing) / Σ weight(all scored)`. No LLM output contributes to the score. |
| 5 | **Judge is a gate, never a grade.** Judge verdicts remain binary pass/fail. A scored task may still carry a judge (e.g. scope discipline on a coding task); the judge protects the score's validity, it does not adjust it. |
| 6 | **Gates protect the score.** A failing exit-health check, a failing gate row, or a failing judge forces the record's score to 0. Partial credit cannot be earned by breaking the scaffold, gaming the hidden tests, or violating the task's constraints. |
| 7 | **Verdict semantics.** A cell's verdict is `pass` iff the script exited 0 AND every gate row passes AND every scored check passes (full marks) AND the judge (when present) passes. pass@k keeps meaning "fully solved"; the `run` exit-code contract is unchanged. |
| 8 | **Malformed fails loud.** A row with a missing or non-boolean `pass`, an invalid `weight` or `gate` value, a `gate`+positive-`weight` conflict, or an unparseable line counts as a *failing* scored check (at its own weight when valid, else unit weight 1), is tallied on the record, and is surfaced in the report. Silently dropping a defect could mint full marks from a broken hook. |
| 9 | **Report shows the gradient.** `report` adds, for scored tasks, a per-task mean score and a best-of-k score — the expected best score over k of the task's n runs, the continuous analog of pass@k — in both JSON and text formats. Binary tasks render exactly as today. A record without a score in a scored group (a preflight failure never reached the hook) contributes its verdict as the degenerate score: pass = 1, fail = 0. |
| 10 | **Authoring surface.** `fit-trace assert` gains `--gate` and `--weight`; hooks need one helper with no exit-code bookkeeping. An invalid `--weight` (or `--gate`/`--weight` conflict) emits a *failing* row before exiting nonzero, so an authoring typo shrinks the score, never the denominator. |
| 11 | **Clean break with full migration.** Every `invariants.sh` in `benchmarks/` and in the libharness test fixtures migrates to the row contract in this change. No compatibility mode, flag, or dual-channel shim ships. Pre-migration ledgers still render (records carry their verdicts) but are not comparable across the semantics break, and no comparison may span it. |
| 12 | **Leading example.** `implement-feature` (kata-skills family) becomes the worked scored task: the app's baseline tests as a gate row, each hidden feature test as one weight-1 scored row, the scope-discipline judge unchanged. One task demonstrates gate + score + judge composing. |
| 13 | **Documentation.** Every surface that states the old contract ("exit code is authoritative/is the verdict") states the new one: rows authoritative, roles table, exit code = script health, and when to author gates versus scored checks. |

## Scope

In scope, by surface:

| Surface | Change |
| --- | --- |
| libharness benchmark grading | Pure grading derivation from rows + exit health; invariants verdict composed from it; result-record and invariants-record schemas gain optional score fields |
| libharness benchmark runner | Cell verdict composition with the judge gate; effective-score zeroing |
| libharness benchmark report | Per-task mean score and best-of-k aggregation + rendering (JSON and text); malformed-row warnings |
| `fit-benchmark invariants` subcommand | Grades with the same derivation; process exit mirrors the graded verdict so authors can validate hooks against fixtures without paying for agent runs |
| `fit-trace assert` | `--gate` and `--weight` flags; emit-then-fail on invalid grading flags |
| `benchmarks/` (all three families) | All nine `invariants.sh` hooks migrate: presence/sanity checks become gate rows, content checks become scored rows, `FAIL`-driven exit codes are removed; `implement-feature` converts to the leading scored example; `fit-wiki/cli-fix` rewrites its nonstandard row shape to `test`/`pass` |
| libharness test fixtures + suites | The four fixture hooks and every test asserting exit-code-derived verdicts move to the row contract; help-text goldens refresh where command descriptions change |
| Documentation | `fit-benchmark` skill + authoring/CLI references, the Run a Benchmark guide, `benchmarks/README.md` |

Excluded:

- **Baseline/delta comparison reporting** (e.g. `report --baseline`) — a future
  spec; mean score per task already gives the % that a before/after pair of
  reports compares.
- **Judge rubric or graded scoring** — explicitly rejected; judges stay binary.
- **Score time-series / XmR integration** — recording scores across runs over
  time is an analysis concern outside the benchmark CLI.
- **Composite action and reusable workflow changes** — the report flows through
  the existing summary path; no new inputs are needed.
- **`preflight.sh`** — the smoke probe keeps its exit-code contract; it emits
  no rows and grades nothing.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | A hook emitting scored rows yields a record whose score equals the weighted passing fraction, with absent `weight` defaulting to 1 | Unit tests over the grading derivation; `fit-benchmark invariants --run-dir` against a fixture with a known partial completion |
| 2 | A nonzero exit records verdict `fail` and score 0 regardless of emitted rows — a crashed hook cannot mint marks | Unit test: passing rows + exit 1 → fail, score 0 |
| 3 | A failing gate row forces verdict `fail` and score 0 despite passing scored rows | Unit test on the grading composition |
| 4 | A failing judge forces score 0 on the record | Runner unit test |
| 5 | Verdict is `pass` iff exit 0 ∧ all gate rows pass ∧ full marks ∧ judge passes | Unit test on runner verdict composition |
| 6 | Malformed and unparseable rows count as failing scored checks and surface in the report; an invalid `--weight` emits a failing row before `assert` exits nonzero | Derivation unit tests; assert command test |
| 7 | A task emitting only gate rows carries no score and renders as a binary task | Grading + report unit tests |
| 8 | `report` renders mean score and best-of-k per scored task in text and JSON; a score-less preflight failure in a scored group enters the mean as 0 | Report unit tests over a mixed ledger |
| 9 | `implement-feature` yields a fractional score on a partial implementation and verdict `pass` with score 1 on a complete one | `fit-benchmark invariants` with hand-authored partial and complete fixtures |
| 10 | Every `invariants.sh` under `benchmarks/` and the test fixtures follows the row contract: no `FAIL`-driven exit, roles on rows | Inspection + `grep -rn 'FAIL' benchmarks/*/tasks/*/hooks/invariants.sh` returns nothing; family suites pass |
| 11 | Docs updated: rows-authoritative contract, roles table, exit-code demotion on every surface that stated the old contract | Scored-task sections exist in the skill, the authoring reference, the CLI reference, the Run a Benchmark guide, and `benchmarks/README.md` |

## Path to approval

Approval is human-only: the spec advances when `wiki/STATUS.md` shows the
`2240` row approved, written from a trusted human signal. This revision
supersedes the earlier dual-channel draft (weights beside an authoritative
exit code) after review concluded the coupling contract between the two
channels was the design's weakest point and a clean break is affordable while
the benchmark has no external consumers. This spec ships with its design in
one combined PR (lockstep co-execution); the design covers the row contract,
the grading and aggregation composition, the best-of-k estimator, the
authoring surface, and the full hook migration, and `kata-plan` follows
approval.

— Staff Engineer 🛠️
