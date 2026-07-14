# Plan 2130-a — Parallel Benchmark Execution

Executes [design 2130-a](design-a.md) for [spec 2130](spec.md). Decomposed into
three independently executable parts; each part is a clean break per
[CONTRIBUTING § Clean breaks](../../CONTRIBUTING.md#checklists) — the serial
loop, `allocatePort`, and the single-file `loadRecords` read are deleted, not
branched.

> **Scope note — rate-limit backpressure descoped (2026-06-27).** The review
> panel established that the design's Layer-1 backpressure directive was not
> executable as written (a 429 does not throw — the agent runner returns it as a
> result field — and the robust retry seam is the cross-cutting shared
> agent-runner query call). By decision, backpressure is
> **split to a follow-up spec**; this plan ships Layer 1 (concurrency, ports,
> ledger, scheduler) and Layer 2 (sharding, merge, distribution). Under
> concurrency a 429'd cell records an `agentError` and costs one slot, not the
> run — the run still completes.
> **This change applies the descope to the upstream artifacts** in the same
> branch: spec.md (the in-scope backpressure row + the "rate-limit failures back
> off" [L1] criterion) and design-a.md (§ Layer 1 `retryRateLimited` row) are
> trimmed, so plan, spec, and design agree. A follow-up spec adds backpressure
> on top of this scheduler. See [Part 01 Step 4](plan-a-01.md).

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
| [01](plan-a-01.md) | Layer 1 — in-process concurrency: `enumerateCells`, `CellScheduler`, single-writer drain, `PortRegistry`, `resolveConcurrency` (Step 4 rate-limit backpressure **descoped** → follow-up spec) | `libraries/libharness` | — |
| [02](plan-a-02.md) | Layer 2 (runner/report) — `selectShard`, `--shard` parsing, recursive `loadRecords` merge | `libraries/libharness` | 01 (`enumerateCells`) |
| [03](plan-a-03.md) | Layer 2 (distribution) — sibling action `mode`/shard inputs + reusable workflow (edited via `gh`/`GH_TOKEN`, append-only patch tag), `fit-bootstrap` parallel-safety check, `eval-kata.yml` migration, `fit-benchmark` SKILL.md, docs | `forwardimpact/fit-benchmark`(+`fit-bootstrap`) siblings, `.github/`, `.claude/skills/`, `websites/` | 01, 02 (CLI flags) |

## Execution

- **Sequencing.** 01 → 02 are sequential (02 consumes `enumerateCells` and the
  completion-order contract). 03 is sequential after 02 — it requires the
  `--concurrency`, `--shard`, and recursive-`report` surfaces to exist and be
  green before the action and workflow can compose them.
- **Within a part**, steps are sequential as listed.
- **Agent routing.** 01 and 02 → an engineering agent (`staff-engineer` or a
  delegate); they are pure `libharness` code + tests. 03: the sibling
  action/workflow edits, the `fit-bootstrap` parallel-safety check, the
  `eval-kata.yml` migration, and the `fit-benchmark` SKILL.md → an engineering
  agent; the `websites/` guide updates → `technical-writer`.
- **Cross-sibling edits (in Part 03's scope).** The composite action and the new
  `benchmark.yml` reusable workflow live in the `forwardimpact/fit-benchmark`
  sibling; the new `fit-benchmark → fit-bootstrap` internal `uses:` edge and the
  `fit-bootstrap` parallel-safety requirement touch shared CI governed by
  [`.github/CLAUDE.md`](../../.github/CLAUDE.md). These edits are
  **executable in this environment** — `GH_TOKEN` + `gh` carry content
  read/write, enough to edit a sibling and cut an append-only `v1.0.x` patch tag
  (admin write is not needed; if it ever is, route to `security-engineer`). The
  monorepo consumes the tag via a SHA-pinned `uses:` with a `# v1` marker, per
  `.github/CLAUDE.md` (the `enum:sibling-composite-actions:count` stays `Five` —
  no new sibling). Part 03 § Sibling-edit mechanics gives the concrete procedure
  and sequencing (interface tagged before the consumer migrates). A
  `fit-bootstrap` change, if the parallel-safety check finds one is needed, is
  coordinated with its owner as that sibling's own patch tag.

## Risks

- **Clock seam can't model wall-clock parallelism.** `createMockClock`'s
  `setTimeout`/`sleep` advance a single shared virtual `now` and resolve on the
  next microtask, so concurrent fake cells do not "overlap" in virtual time.
  Verifying "bounded by `C`" must therefore assert a **max-in-flight counter**
  maintained by the fake-agent seam (high-water-mark ≤ `C`) and a logical batch
  index, not a virtual-clock wall time. Part 01 specifies this seam.
- **`report` input-dir behavior splits into two pinned cases.** Recursive
  discovery replaces the `<dir>/results.jsonl` `readFile`: an *existing* dir
  with no ledger now yields the empty union (exit 0), while a *missing* dir
  still errors (exit 1) via an uncaught `readdir` ENOENT. The `report-empty`
  golden (a missing dir) keeps exit 1 but its error shape changes — Part 02
  regenerates it, preserves the deliberate stack-collapse, and covers the
  existing-empty exit-0 path with a unit test.
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
