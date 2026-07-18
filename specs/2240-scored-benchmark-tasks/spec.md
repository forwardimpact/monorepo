# Spec 2240 — Scored Benchmark Tasks: A Mechanical Capability Gradient Alongside Binary Gates

Every `fit-benchmark` cell (`(task, runIndex)`) collapses to one bit: the
invariants exit code AND the judge verdict. The only signal a skill-pack change
can move is therefore the pass **rate** across repeated runs — pass@k measures
reliability, not capability. A task with a rich hidden test suite grades an
agent that solved 90% of it identically to an agent that produced nothing. This
spec adds a second task grading shape — **scored** — whose cell result carries a
mechanical score in [0, 1] derived from weighted invariant checks, so a skill
improvement shows up as a % movement instead of only a flipped bit.

Serves **Platform Builders** — the persona who hires `fit-benchmark` to *prove
a skill change improved outcomes* (see
[libraries/README.md § Jobs To Be Done](../../libraries/README.md#jobs-to-be-done)).
"Improved" is today only expressible as "flipped cells from fail to pass";
partial capability gains — the common case while a skill matures — are
invisible.

**Classification: internal.** The change lands in `libraries/libharness`,
`benchmarks/`, and published skill/library documentation — no `products/` or
`services/` surface.

## Problem

**One bit per cell.** The runner composes a cell verdict from two binary gates:
the invariants script's exit code and (when present) the judge's
success/failure conclusion. Nothing between 0 and 1 exists in the result
record, so nothing between 0 and 1 can exist in the report.

**The evidence is already collected, then discarded.** A task's invariants
script emits structured per-check rows (`{"test": …, "pass": …}`) on the
results file descriptor; they land in the record's invariants details and the
report renders them per run — but no aggregate reads them. The
`implement-feature` task (kata-skills family) runs a hidden suite of five
feature tests plus the app's baseline tests and reduces all of it to one exit
code. An agent that implements the whole `--filter` feature except
case-insensitivity records the same `fail` as an agent that never edited a
file.

**Saturation in both directions.** Once a family passes reliably, pass@k pins
at 1.0 and further skill improvements are unmeasurable; a genuinely hard task
pins at 0.0 with no gradient to climb. Task authors have no way to express "how
far did the agent get", so families are written as all-or-nothing suites and
the benchmark under-reports exactly the changes it exists to prove.

**The naive fix is worse.** Asking the judge for a graded rubric score would
manufacture a gradient from an LLM's opinion — ambiguous, noisy across runs,
and gameable by persuasive prose in the trace. The gradient must be mechanical.

## What

Two task grading shapes, distinguished per task **by convention — no
configuration**. Every task keeps today's gates; a task becomes scored by what
its invariants emit, exactly as a task opts into a judge by shipping
`judge.task.md` and into fixtures by shipping `workdir/`.

| Shape | Grading | How a task opts in |
| --- | --- | --- |
| **Judged** (today's shape) | Invariants gate + optional judge gate; binary verdict | Default — nothing new |
| **Scored** | Judged shape **plus** a mechanical score in [0, 1] from weighted invariant checks | The invariants script emits at least one weighted check row |

Requirements:

| # | Requirement |
| --- | --- |
| 1 | **Mechanical score.** A scored cell's score is the weighted fraction of passing scored checks emitted by the task's invariants. No LLM output contributes to the score. |
| 2 | **Judge is a gate, never a grade.** Judge verdicts remain binary pass/fail. A scored task may still carry a judge (e.g. scope discipline on a coding task); the judge protects the score's validity, it does not adjust it. |
| 3 | **Gates protect the score.** A cell that fails any gate — preflight, invariants exit code, judge — records score 0. Partial credit cannot be earned by breaking the scaffold, gaming the hidden tests, or violating the task's constraints. |
| 4 | **Verdict semantics preserved.** A scored cell's verdict is `pass` only when every gate passes **and** the score is full marks. pass@k keeps meaning "fully solved"; the `run` exit-code contract is unchanged. |
| 5 | **Convention over configuration.** No new file, manifest field, or CLI flag declares a task's shape; the emitted rows decide. Judged tasks, existing families, and existing ledgers behave identically to today. |
| 6 | **Report shows the gradient.** `report` adds a per-task mean score and a best-of-k score for scored tasks, in both JSON and text formats, without disturbing the pass@k presentation for judged tasks. |
| 7 | **Leading example.** `implement-feature` (kata-skills family) converts to a scored task: the app's baseline tests gate; each hidden feature test contributes one scored check; the scope-discipline judge stays. One task demonstrates gate + score + judge composing. |
| 8 | **Authoring surface.** The documented hook contract can emit weighted checks through the standard assertion helper, and the skill/reference docs state when to author a scored task versus a judged one. |

## Scope

In scope, by surface:

| Surface | Change |
| --- | --- |
| libharness benchmark grading | Score derivation from invariant check rows; verdict composition; result-record and invariants-record schemas gain an optional score |
| libharness benchmark report | Per-task mean score and best-of-k aggregation + rendering (JSON and text) |
| `fit-benchmark invariants` subcommand | Emits the score so authors can validate scored hooks against fixtures without paying for agent runs |
| `fit-trace` assertion command | Weight emission on assertion result rows |
| `benchmarks/kata-skills/tasks/implement-feature` | Converted to the leading scored example (hooks + family README rows) |
| Documentation | `fit-benchmark` skill + authoring/CLI references, the Run a Benchmark guide, `benchmarks/README.md` |

Excluded:

- **Baseline/delta comparison reporting** (e.g. `report --baseline`) — a future
  spec; mean score per task already gives the % that a before/after pair of
  reports compares.
- **Judge rubric or graded scoring** — explicitly rejected; judges stay binary.
- **Converting the remaining tasks** — one leading example ships here; other
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
| 3 | A failed gate forces score 0 | Unit test: a gate-failing record with passing weighted rows carries score 0 |
| 4 | A scored cell's verdict is `pass` iff every gate passes and score is full marks | Unit test on runner verdict composition, including the float-safety of full marks |
| 5 | `report` renders mean score and best-of-k per scored task in text and JSON, and renders judged tasks exactly as today | Report unit/golden tests over a mixed ledger |
| 6 | `implement-feature` yields a fractional score on a partial implementation | `fit-benchmark invariants` with a hand-authored partial fixture: 0 < score < 1 |
| 7 | A complete correct implementation still records verdict `pass`, score full marks | Same command on a complete fixture |
| 8 | Authors can emit a weighted check through the standard assertion helper | Assertion command test: weight appears on the emitted row |
| 9 | Docs updated with the scored/judged distinction | Scored-task sections exist in the skill, the authoring reference, and the Run a Benchmark guide |

## Path to approval

Approval is human-only: the spec advances when `wiki/STATUS.md` shows the
`2240` row approved, written from a trusted human signal. This spec ships with
its design in one combined PR (lockstep co-execution); the design covers the
scored-row convention, score placement in the record, the verdict composition,
the best-of-k estimator, and the example-task conversion, and `kata-plan`
follows approval.

— Staff Engineer 🛠️
