# Spec 1660 — fit-benchmark pass@k Threshold Gate

## Problem

`fit-benchmark` exists to answer one question with reproducible evidence: did a
skill-pack change make agents better at writing code? It runs each task N times
and reports pass@k via the OpenAI HumanEval unbiased estimator precisely because
a single agent run is a coin flip. Yet the only automated pass/fail signal the
tool emits ignores pass@k entirely.

Today `fit-benchmark run` fails (exit 1) when **any single run of any task** is
not `pass`, and `fit-benchmark report` always exits 0 — pass@k is computed and
printed but never gates anything. The composite action inherits the `run` exit
code. Three consequences follow:

1. **The gate contradicts the tool's own premise.** With five runs across five
   tasks, one flaky failure out of twenty-five fails the whole benchmark. The
   estimator that was built to absorb non-determinism is decorative; the gate
   demands determinism the tool assumes it cannot have.

2. **Intent cannot be expressed.** A team cannot say "this skill set should let
   the agent solve the TODO-API task at least four runs out of five." There is
   no knob for "pass@3 ≥ 0.8 per task." The pass@k table is read by eye.

3. **CI cannot gate on the evidence.** Because the only machine signal is
   all-runs-must-pass, PR and scheduled workflows either tolerate a near-useless
   gate or ignore the exit code and treat benchmarks as advisory.

The brittleness is structural, not a bug: the per-run exit rule predates any
notion of an aggregate target. Specs 0870, 0890, and 0980 each explicitly
deferred threshold-based gating to a later spec. This is that spec.

## Personas and Job

The gate serves **Platform Builders**. Their Big Hire is to "Help me prove
whether agent changes improved outcomes with reproducible evidence"
([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve Agents),
hired against **Gear**. Proof that cannot fail a build is not proof a team can
act on. A configurable per-task pass@k target turns the reported number into an
enforceable contract — the difference between a benchmark a workflow can gate on
and a table someone has to remember to read. Teams Using Agents inherit the
benefit downstream when their CI gates skill PRs; they are not the direct hire.

## Scope

The gate is configured by two settings: `--pass-k` names an integer *k*, and
`--pass-threshold` names a fraction *t* in `[0,1]`. The gate passes only when
**every task** satisfies pass@*k* ≥ *t*; one task short fails the benchmark.

### In scope

| Component | What changes |
|---|---|
| Pass/fail verdict | A **per-task** pass@k gate decides the benchmark's pass/fail, **replacing** the current "any run not `pass` ⇒ fail" rule. **Both** `fit-benchmark run` (over the records it just produced) and `fit-benchmark report` (over an existing result set) apply the gate and exit non-zero when any task fails it; the two commands produce the same verdict for the same records. |
| Gate configuration | `--pass-k` (positive integer) and `--pass-threshold` (fraction in `[0,1]`) on both `run` and `report`. Both must be supplied together; supplying one alone is a configuration error. |
| No-gate default | When neither flag is set, the benchmark applies **no per-task gate** and does not fail on any per-task outcome (informational). It exits non-zero only when there are no result records to evaluate at all — an unreadable or malformed family that produces no records, or a result set with zero valid records. This is the clean break from all-runs-must-pass. |
| Insufficient runs | When a gated task has fewer completed runs than *k* (`n < k`, so pass@*k* is undefined), that task **fails** the gate and the report marks it as insufficient runs. |
| `--k` removal | The `--k` reporting flag is **removed**; the report always renders pass@1, pass@3, and pass@5. `--pass-k` (which k gates) may name any positive integer, independent of which k the report displays. |
| Composite action | `forwardimpact/fit-benchmark@v1` gains `pass-k` and `pass-threshold` inputs, **drops** the `k` input, and forwards the new inputs to the gated `run` command so the job's exit status reflects the per-task gate. The action edit lands in the sibling repo per [`.github/CLAUDE.md`](../../.github/CLAUDE.md) § Editing a published action; this spec covers the interface, the design/plan covers the cross-repo mechanics. |
| Report attribution | The report surface exposes, per task, the gated k, the observed pass@k, and a pass/fail-against-gate indicator, in both `--format=text` and `--format=json` output, so a reader sees why the benchmark failed without recomputing. |
| Documentation & parity | The `fit-benchmark` skill, its CLI reference, and the run-benchmark guides reflect the new flags, the removed `--k`/`k`, the fixed report columns, and the new exit-code contract — keeping skill–CLI parity per `.claude/skills/CLAUDE.md`. |

### Out of scope, deferred

- **Family-aggregate threshold.** Only a per-task gate ships; a single pooled
  pass@k across all tasks is a possible later amendment.
- **Per-k threshold maps.** One `(--pass-k, --pass-threshold)` pair gates all
  tasks; a different target per task or per k is deferred.
- **Before/after delta gating.** Failing on a regression relative to a baseline
  `results.jsonl` is separate from an absolute threshold.
- **PR merge-gate wiring.** This spec makes the exit code meaningful; wiring
  benchmark runs into branch-protection required checks remains workflow-author
  territory.
- **Backward-compatible `--k` alias.** The removal is a clean break; workflows
  passing `--k` or the action `k` input must migrate. No deprecation shim ships.
- **Per-task threshold overrides in the family manifest.** v1 configures the
  gate only through the flag / action input.

## Success Criteria

Pass@k uses the HumanEval estimator `1 − C(n−c, k) / C(n, k)`; the fixture
verdicts below are constructible at `n = 5` (e.g. `c = 1 ⇒ pass@3 = 0.6`,
`c = 2 ⇒ pass@3 = 0.9`, `c = 1 ⇒ pass@4 = 0.8`, `c = 1 ⇒ pass@5 = 1.0`).

| Claim | Verification |
|---|---|
| With both flags set, the benchmark passes only when every task's pass@`k` ≥ `t`. | Test: a `report` over a fixture `results.jsonl` with task A at pass@3 = 0.9 and task B at pass@3 = 0.6, under `--pass-k=3 --pass-threshold=0.8`, exits non-zero; raising task B to pass@3 = 0.9 makes the same command exit 0. |
| The gate is per-task, not pooled — one failing task fails the benchmark. | Test: a fixture with three tasks at pass@3 = 0.9 and one at pass@3 = 0.6, under `--pass-k=3 --pass-threshold=0.8`, exits non-zero; removing the one failing task makes it exit 0. |
| `run` and `report` produce the same gate verdict for the same result records. | Test: the same record set, gated through the `run` path (over just-produced records) and the `report` path (over the persisted `results.jsonl`), yields the same pass/fail. |
| With neither flag set, no per-task gate is applied. | Test: a `report` over a fixture where every task has at least one failing run, with no `--pass-k`/`--pass-threshold`, exits 0. |
| The old "any run not `pass` ⇒ fail" behavior no longer applies. | Test: a fixture with a single failing run among otherwise-passing runs, no flags, exits 0 (would have exited 1 before). |
| With no gate, the absence of any evaluable record still exits non-zero. | Test: `run` against an unreadable/malformed family that produces no records exits non-zero; `report` over a results set with zero valid records exits non-zero; a results set with at least one valid record and failing runs exits 0. |
| Supplying only one of the two flags is a configuration error. | Test: `--pass-k=3` with no `--pass-threshold` (and vice versa) exits non-zero with a message naming the missing flag, before any run or aggregation. |
| `--pass-threshold` rejects values outside `[0,1]` and `--pass-k` rejects non-positive integers. | Test: `--pass-threshold=1.5` and `--pass-k=0` each exit non-zero with a message, before any run. |
| A gated task with fewer runs than `k` fails the gate as insufficient runs. | Test: a fixture task with n = 3 under `--pass-k=4 --pass-threshold=0.5` fails and the report marks it insufficient runs; a task with n = 5 meeting the threshold passes. |
| `--k` is removed and the report always renders pass@1, pass@3, pass@5 in both formats. | Test: `report --k=1,3` exits non-zero as an unknown option; both the text and JSON reports expose exactly the pass@1, pass@3, and pass@5 figures per task and no other display k. |
| `--pass-k` is independent of the fixed report columns and gates on the named k. | Test: a fixture task at pass@4 = 0.8 (and pass@5 = 1.0) gated on `--pass-k=4 --pass-threshold=0.9` **fails** while the report still shows the 1/3/5 columns — proving the verdict tracks pass@4, not pass@5; lowering the threshold to 0.8 makes it pass. |
| The report attributes a benchmark failure to the offending task(s) in both formats. | Test: a failing-gate report exposes, per task, the gated k (which may differ from the displayed 1/3/5), the observed pass@k at that k, and a pass/fail-against-gate indicator in both `--format=text` and `--format=json`; the failing task is distinguishable from passing ones. |
| The composite action exposes `pass-k`/`pass-threshold`, drops `k`, and wires them to the gated command. | Test (interface-level): the action's documented inputs list `pass-k` and `pass-threshold` and no `k`, and the action forwards them to `fit-benchmark run` so the job exit status reflects the per-task gate. The sibling-repo job run itself is out of this repo's test scope. |
| Skill, CLI reference, and guides reflect the new contract with no stale `--k`/`k`. | Test: a scan finds the new flags/inputs and the fixed pass@1/3/5 report description, and finds no remaining `--k` flag or action `k` input references in the `fit-benchmark` skill, CLI reference, or run-benchmark guides. |
| Skill and CLI carry parity per `.claude/skills/CLAUDE.md`. | Test: the skill's documentation list and the CLI's published documentation entries carry the same entries in the same order. |

## Amendment 1 — `fit-benchmark` action fully aligned with the CLI flag interface

The base scope (§ In scope, Composite action) added `pass-k`/`pass-threshold`
inputs and dropped `k`, but specified only that the action "forwards the new
inputs." The `forwardimpact/fit-benchmark` action holds a stronger standing
invariant — *"All `fit-benchmark run` CLI flags are exposed as action
inputs"* (the run-benchmark CI-workflow guide). Partial alignment would break
that invariant the moment the CLI interface changes. This amendment makes the
action's input surface **fully aligned** with the new CLI interface, not merely
augmented.

### In scope (amends the Composite action row)

| Component | What changes |
|---|---|
| Action input surface | The action's inputs mirror the CLI gate flags one-for-one: `pass-k` and `pass-threshold` carry the same names, semantics, and *unset ⇒ no gate* default as `--pass-k`/`--pass-threshold`; the `k` input is removed with no alias. The standing "every `run` flag is an input" invariant continues to hold after the change. |
| Validation pass-through | The action does not re-implement gate validation: it forwards the inputs to `fit-benchmark run`, so the CLI's both-or-neither and range checks surface at the action boundary — a misconfigured input fails the step rather than silently degrading to no-gate. |
| CI-workflow guide | The action input table in the run-benchmark CI-workflow guide drops the `k` row and adds `pass-k`/`pass-threshold` rows (default empty ⇒ informational), and the surrounding prose continues to state the all-run-flags-are-inputs invariant accurately. |

### Out of scope (unchanged)

- **Cross-repo mechanics.** The `action.yml` edit is realized in the sibling
  `forwardimpact/fit-benchmark` repo via the Issue-with-diff → append-only
  patch tag → Dependabot SHA-bump path in
  [`.github/CLAUDE.md`](../../.github/CLAUDE.md) § Editing a published action.
  This repo's workflow `uses:` references and docs migrate off `k` in lockstep
  with the SHA bump (the base spec's cross-repo-drift risk already covers this).

### Success Criteria (append)

| Claim | Verification |
|---|---|
| The action's documented inputs mirror the CLI gate flags with matching defaults and no `k`. | Test: the CI-workflow input table lists `pass-k` and `pass-threshold` with an empty (no-gate) default and contains no `k` row; the "all `run` flags are inputs" sentence still reads true against the current CLI flag set. |
| A misconfigured gate input fails the action step rather than degrading silently. | Test (interface-level): an action invocation passing only `pass-k` (no `pass-threshold`) surfaces the CLI's non-zero exit as a failed job; passing both within range runs the gate. The sibling-repo job run itself is out of this repo's test scope. |

— Claude (kata-spec)
