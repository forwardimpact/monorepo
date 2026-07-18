# Spec 2240 — Scored Benchmark Tasks: A Mechanical Capability Gradient Alongside Binary Gates

Every `fit-benchmark` cell (`(task, runIndex)`) collapses to one bit: the
invariants exit code AND the judge verdict. The only signal a skill-pack change
can move is therefore the pass **rate** across repeated runs. pass@k measures
reliability, not capability: a task with a rich hidden test suite grades an
agent that solved 90% of it identically to an agent that produced nothing. This
spec adds a second task grading shape, **scored**, whose cell result carries a
mechanical score in [0, 1] derived from weighted invariant checks, so a skill
improvement shows up as a % movement instead of only a flipped bit.

Serves **Platform Builders** — the persona who hires `fit-benchmark` to *prove
a skill change improved outcomes* (see
[libraries/README.md § Jobs To Be Done](../../libraries/README.md#jobs-to-be-done)).
"Improved" is today only expressible as "flipped cells from fail to pass".
Partial capability gains, the common case while a skill matures, are invisible.

**Classification: internal.** The change lands in `libraries/libharness`,
`benchmarks/`, and published skill/library documentation — no `products/` or
`services/` surface.

## Problem

**One bit per cell.** The runner composes a cell verdict from two binary gates:
the invariants script's exit code and (when present) the judge's
success/failure conclusion. Nothing between 0 and 1 exists in the result
record, so nothing between 0 and 1 can exist in the report.

**The collection mechanism exists; no gradient uses it.** A task's invariants
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
pins at 0.0 with no gradient to climb. Task authors have no way to express "how
far did the agent get", so families are written as all-or-nothing suites and
the benchmark under-reports exactly the changes it exists to prove.

**The naive fix is worse.** Asking the judge for a graded rubric score would
manufacture a gradient from an LLM's opinion: ambiguous, noisy across runs,
and gameable by persuasive prose in the trace. The gradient must be mechanical.

## What

Two task grading shapes, distinguished per task **by convention — no
configuration**. Every task keeps today's gates; a task becomes scored by what
its invariants emit, exactly as a task opts into a judge by shipping
`judge.task.md` and into fixtures by shipping `workdir/`.

A **weighted check row** is an invariant check row carrying a positive numeric
weight alongside its pass/fail boolean. Rows without a weight keep their
current role: diagnostic detail, never scored.

| Shape | Grading | How a task opts in |
| --- | --- | --- |
| **Judged** (today's shape) | Invariants gate + optional judge gate; binary verdict | Default — nothing new |
| **Scored** | Judged shape **plus** a mechanical score in [0, 1] from weighted invariant checks | The invariants script emits at least one weighted check row |

Requirements:

| # | Requirement |
| --- | --- |
| 1 | **Mechanical score.** A scored cell's score is the weighted fraction of passing weighted checks emitted by the task's invariants. No LLM output contributes to the score. |
| 2 | **Judge is a gate, never a grade.** Judge verdicts remain binary pass/fail. A scored task may still carry a judge (e.g. scope discipline on a coding task); the judge protects the score's validity, it does not adjust it. |
| 3 | **Exit code is the gate, not the grade.** In a scored task the invariants exit code reports gate conditions only — scaffold sanity, regressions, tampering. A failing weighted check must not fail the exit code; otherwise every partial completion zeroes out and no fractional score can exist. This authoring contract is load-bearing and the documentation (requirement 9) states it. |
| 4 | **Gates protect the score.** A cell that fails any gate earns no partial credit. When invariants ran, the record carries score 0 regardless of its rows; when the cell never reached invariants (a preflight failure), no rows exist to declare a shape, so the zero is realized in aggregation (requirement 7). Partial credit cannot be earned by breaking the scaffold, gaming the hidden tests, or violating the task's constraints. |
| 5 | **Verdict semantics preserved.** A scored cell's verdict is `pass` only when every gate passes **and** every weighted check passes (full marks). pass@k keeps meaning "fully solved"; the `run` exit-code contract is unchanged. |
| 6 | **Convention over configuration.** No new file, manifest field, or CLI flag declares a task's shape; the emitted rows decide. Judged tasks, existing families, and existing ledgers behave identically to today. |
| 7 | **Report shows the gradient.** `report` adds, for scored tasks, a per-task mean score and a best-of-k score — the expected best score over k of the task's n runs, the continuous analog of pass@k — in both JSON and text formats, without disturbing the pass@k presentation for judged tasks. Records in a scored task's group that carry no score (preflight failures, pre-conversion ledgers) contribute their verdict as the degenerate score: pass = 1, fail = 0. |
| 8 | **Leading example.** `implement-feature` (kata-skills family) converts to a scored task: the app's baseline tests gate; each hidden feature test contributes one weighted check; the scope-discipline judge stays. One task demonstrates gate + score + judge composing. |
| 9 | **Authoring surface.** The documented hook contract can emit weighted checks through the standard assertion helper without coupling them to the gate exit code, and the skill/reference docs state when to author a scored task versus a judged one. |

## Scope

In scope, by surface:

| Surface | Change |
| --- | --- |
| libharness benchmark grading | Score derivation from weighted invariant check rows; verdict composition; result-record and invariants-record schemas gain an optional score |
| libharness benchmark report | Per-task mean score and best-of-k aggregation + rendering (JSON and text) |
| `fit-benchmark invariants` subcommand | Emits the score under the same gate composition as `run`, so authors can validate scored hooks against fixtures without paying for agent runs |
| `fit-trace` assertion command | Weight emission on assertion result rows |
| `benchmarks/kata-skills/tasks/implement-feature` | Converted to the leading scored example (hooks + family README rows) |
| Documentation | `fit-benchmark` skill + authoring/CLI references, the Run a Benchmark guide, `benchmarks/README.md` |

Excluded:

- **Baseline/delta comparison reporting** (e.g. `report --baseline`) — a future
  spec; mean score per task already gives the % that a before/after pair of
  reports compares.
- **Judge rubric or graded scoring** — explicitly rejected; judges stay binary.
- **Converting the remaining tasks.** One leading example ships here; other
  conversions are ordinary task authoring afterwards.
- **Score time-series / XmR integration** — recording scores across runs over
  time is an analysis concern outside the benchmark CLI.
- **Composite action and reusable workflow changes** — the report flows through
  the existing summary path; no new inputs are needed.

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | An invariants script emitting weighted check rows yields a record whose score equals the weighted passing fraction | Unit tests over the score derivation; `fit-benchmark invariants --run-dir` against a fixture with a known partial completion |
| 2 | A task emitting no weighted rows produces records without a score and byte-identical verdict behavior | Existing libharness benchmark suite and golden fixtures pass unmodified |
| 3 | A gate-failing record whose invariants emitted passing weighted rows carries score 0 | Unit test on the verdict/score composition |
| 4 | A row-less gate failure (preflight) in a scored task's group enters the per-task mean as 0, and a score-less `pass` record enters as 1 | Report unit test over a mixed group |
| 5 | A scored cell's verdict is `pass` iff every gate passes and every weighted check passes | Unit test on runner verdict composition |
| 6 | `report` renders mean score and best-of-k per scored task in text and JSON, and renders judged tasks exactly as today | Report unit/golden tests over a mixed ledger |
| 7 | `implement-feature` yields a fractional score on a partial implementation | `fit-benchmark invariants` with a hand-authored partial fixture: 0 < score < 1 |
| 8 | A complete correct implementation still records verdict `pass`, full marks | Same command on a complete fixture |
| 9 | Authors can emit a weighted check through the standard assertion helper without failing the gate | Assertion command test: weight appears on the emitted row; documented hook pattern separates scored checks from gate checks |
| 10 | Docs updated with the scored/judged distinction and the exit-code contract | Scored-task sections exist in the skill, the authoring reference, and the Run a Benchmark guide |

## Path to approval

Approval is human-only: the spec advances when `wiki/STATUS.md` shows the
`2240` row approved, written from a trusted human signal. This spec ships with
its design in one combined PR (lockstep co-execution); the design covers the
scored-row convention, the verdict and aggregation composition, the best-of-k
estimator, and the example-task conversion, and `kata-plan` follows approval.

— Staff Engineer 🛠️
