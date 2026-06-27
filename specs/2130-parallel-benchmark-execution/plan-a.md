# Plan 2130-a — Parallel Benchmark Execution

Executes [design 2130-a](design-a.md) for [spec 2130](spec.md). Decomposed into
three independently executable parts; each part is a clean break per
[CONTRIBUTING § Clean breaks](../../CONTRIBUTING.md#read-do) — the serial loop,
`allocatePort`, and the single-file `loadRecords` read are deleted, not branched.

> **Open blocker — design revision required before full approval.** The review
> panel confirmed that the design's Layer-1 **rate-limit backpressure** directive
> rests on a false premise: a 429 does not throw at the agent-session boundary —
> `AgentRunner.#consumeQuery` (agent-runner.js:190-196) catches it and returns a
> `{success:false, error}` field — and the robust retry seam (the shared
> `AgentRunner` query call) is cross-cutting, a WHICH/WHERE decision the design
> must own. **Spec 2130 returns to `kata-design`** to revise the § Layer 1
> backpressure row (detection signal, owning component, trace/cost contract under
> retry). Every other step in this plan is independent of backpressure and is
> execution-ready; only [Part 01 Step 4](plan-a-01.md) waits on the amended
> design. Until then the spec's "rate-limit failures back off" [L1] criterion is
> unmet, so this plan is not yet approvable.

## Approach

Land Layer 1 (in-process concurrency) first because it introduces
`enumerateCells` — the load-bearing task-major/runIndex-minor ordering that
Layer 2's shard partition depends on — and converts `run()` to completion-order
streaming. Layer 2's runner/report work (shard selector + recursive merge) then
builds on that enumeration. The CI distribution layer (composite-action `mode`,
reusable workflow, `eval-kata.yml` migration) lands last because it composes the
finished CLI flags. The per-cell lifecycle (`#runOne`), the `ResultRecord`
schema, and pass@k math are untouched throughout.

## Part index

| Part | Scope | Tree | Depends on |
| --- | --- | --- | --- |
| [01](plan-a-01.md) | Layer 1 — in-process concurrency: `enumerateCells`, `CellScheduler`, single-writer drain, `PortRegistry`, `resolveConcurrency` (Step 4 rate-limit backpressure **blocked on design revision**) | `libraries/libharness` | — |
| [02](plan-a-02.md) | Layer 2 (runner/report) — `selectShard`, `--shard` parsing, recursive `loadRecords` merge | `libraries/libharness` | 01 (`enumerateCells`) |
| [03](plan-a-03.md) | Layer 2 (distribution) — composite-action `mode`/shard inputs, reusable workflow, `eval-kata.yml` migration, `fit-bootstrap` parallel-safety coordination, docs | `forwardimpact/fit-benchmark` sibling, `.github/`, `websites/` | 01, 02 (CLI flags) |

## Execution

- **Sequencing.** 01 → 02 are sequential (02 consumes `enumerateCells` and the
  completion-order contract). 03 is sequential after 02 — it requires the
  `--concurrency`, `--shard`, and recursive-`report` surfaces to exist and be
  green before the action and workflow can compose them.
- **Within a part**, steps are sequential as listed.
- **Agent routing.** 01 and 02 → an engineering agent (`staff-engineer` or a
  delegate); they are pure `libharness` code + tests. 03 splits: the
  action/workflow/`eval-kata.yml` changes → an engineering agent who coordinates
  the cross-sibling edge per § Cross-sibling coordination below; the
  `websites/` guide updates → `technical-writer`.
- **Cross-sibling coordination (gates 03).** The composite action and the new
  `benchmark.yml` reusable workflow live in the `forwardimpact/fit-benchmark`
  sibling, and the new `fit-benchmark → fit-bootstrap` `uses:` edge plus the
  `fit-bootstrap` parallel-safety requirement touch shared CI governed by
  [`.github/CLAUDE.md`](../../.github/CLAUDE.md). Per spec § Path to approval,
  these are coordinated with the sibling owners and land as append-only patch
  tags on the siblings, consumed here via SHA-pinned `uses:` (Dependabot bump),
  before `eval-kata.yml` migrates. Part 03 states the required interface; the
  sibling edits themselves are out of this monorepo's tree.

## Risks

- **Clock seam can't model wall-clock parallelism.** `createMockClock`'s
  `setTimeout`/`sleep` advance a single shared virtual `now` and resolve on the
  next microtask, so concurrent fake cells do not "overlap" in virtual time.
  Verifying "bounded by `C`" must therefore assert a **max-in-flight counter**
  maintained by the fake-agent seam (high-water-mark ≤ `C`) and a logical batch
  index, not a virtual-clock wall time. Part 01 specifies this seam.
- **`report` input-dir behavior splits into two pinned cases.** Recursive
  discovery replaces the `<dir>/results.jsonl` `readFile`: an *existing* dir with
  no ledger now yields the empty union (exit 0), while a *missing* dir still
  errors (exit 1) via an uncaught `readdir` ENOENT. The `report-empty` golden
  (a missing dir) keeps exit 1 but its error shape changes — Part 02 regenerates
  it, preserves the deliberate stack-collapse, and covers the existing-empty
  exit-0 path with a unit test.
- **Concurrent teardown of disjoint process groups.** `WorkdirManager.teardown`
  signals `-pgid` and probes the port; under concurrency several teardowns run
  at once. They target disjoint process groups and distinct ports, but Part 01
  must confirm no shared mutable state in the teardown path (it currently uses
  only locals + `runtime`).

Libraries used: libharness (benchmark runner, report, workdir, result schema),
libutil (production runtime clock), libmock (`createMockClock` test seam),
libconfig (benchmark config). No new dependency — the permit semaphore is local
to `scheduler.js`.

— Staff Engineer 🛠️
