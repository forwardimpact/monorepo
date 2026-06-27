# Plan 2130-a Part 01 — Layer 1: in-process concurrency

In-process bounded concurrency for `BenchmarkRunner`, per
[design 2130-a § Layer 1](design-a.md#layer-1--in-process-concurrency). All
changes in `libraries/libharness`. Run from the `libharness` package root.

Libraries used: libharness, libutil (runtime clock), libmock (test runtime/clock).

## Step 1 — Add `enumerateCells`

Introduce the single, stable cell ordering both the scheduler and (Part 02) the
shard selector consume.

- **Modified:** `src/benchmark/runner.js`

Add an exported pure function:

```js
/**
 * Flatten the grid into a stable ordered cell list, task-major /
 * runIndex-minor. Load-bearing ordering: Part 02's round-robin shard balance
 * depends on a task's runIndexes being adjacent in this list.
 * @returns {{task: import("./task-family.js").Task, runIndex: number}[]}
 */
export function enumerateCells(tasks, runs) {
  const cells = [];
  for (const task of tasks)
    for (let runIndex = 0; runIndex < runs; runIndex++)
      cells.push({ task, runIndex });
  return cells;
}
```

Verification: a unit test asserts `enumerateCells([a,b], 2)` yields
`[a/0, a/1, b/0, b/1]` (task-major).

## Step 2 — `PortRegistry` replaces `allocatePort`

Give each in-flight cell a distinct, bindable port under a lock, closing the
close-then-return TOCTOU race.

- **Modified:** `src/benchmark/workdir.js`
- **Deleted:** the `allocatePort()` function in `src/benchmark/workdir.js`
  (the separate copy in `commands/benchmark-invariants.js` is single-task,
  non-concurrent, and stays).

Add a `PortRegistry` class: an `acquire(): Promise<number>` that probes a free
port (listen on 0 → read number → close), and **re-probes if the number is
already in its live in-use `Set`**; `release(port)` removes it. Serialize
`acquire` through a one-slot promise chain so two concurrent acquires cannot
read the same number before either is recorded.

```js
export class PortRegistry {
  #inUse = new Set();
  #tail = Promise.resolve();
  acquire() {
    const next = this.#tail.then(async () => {
      let port;
      do { port = await probeFreePort(); } while (this.#inUse.has(port));
      this.#inUse.add(port);
      return port;
    });
    this.#tail = next.catch(() => {});
    return next;
  }
  release(port) { this.#inUse.delete(port); }
}
```

`WorkdirManager` constructs one `PortRegistry` and uses it: `start()` calls
`this.ports.acquire()` (replacing `await allocatePort()`); `teardown()` calls
`this.ports.release(workdir.port)` after the existing process-group kill and
`isPortFree` probe. `probeFreePort` is the old `allocatePort` body, renamed.

Verification: a test acquiring `K` ports concurrently from one registry gets
`K` distinct numbers, each bindable at hand-off; releasing then re-acquiring
reuses freed numbers.

## Step 3 — `CellScheduler`

Run up to `C` cells concurrently and stream settled records in completion order.

- **Created:** `src/benchmark/scheduler.js`

A bounded pool built on a local permit semaphore (no new dependency). Given
`{concurrency, runCell}` and an array of cells, it keeps ≤ `C` `runCell(cell)`
calls in flight; as each settles it pushes the record onto an internal async
queue that the class exposes as an async iterable. The async-iterable drain is
what the runner consumes.

```js
export class CellScheduler {
  constructor({ concurrency, runCell }) { /* store; validate C >= 1 */ }
  /** @param {{task, runIndex}[]} cells @returns {AsyncGenerator<object>} */
  async *run(cells) {
    // permit semaphore size C; launch up to C, await Promise.race on the
    // in-flight set, yield each settled record, refill, until all cells done.
  }
}
```

Maintain an explicit in-flight `Set<Promise>`; `Promise.race` it, yield the
settled value, remove it, and launch the next cell while permits remain. A
`runCell` rejection is impossible by contract — `#runOne` already returns an
`agentError`/`schemaError` record rather than throwing — but guard defensively
so one bad cell cannot wedge the drain.

Verification: with a `runCell` stub that records concurrent entry/exit, a run of
`M` cells at `C` reports max-in-flight ≤ `C`; all `M` records are yielded
exactly once.

## Step 4 — Rate-limit backpressure — DESCOPED (moved to a follow-up spec)

Rate-limit backpressure is **out of scope for spec 2130** (descope decision,
2026-06-27). The review panel established it is not a thin implementation detail:
a 429 does not throw at the agent-session boundary — `AgentRunner.#consumeQuery`
(agent-runner.js:190-196) catches the query error and returns it as a
`{success:false, error}` field — and a robust retry seam (the shared `AgentRunner`
query call, used by supervise/facilitate/benchmark) is cross-cutting, with a
trace/cost-correctness contract under retry. That is a WHICH/WHERE decision the
design must own, so it is split to its own spec rather than wedged into this one.

Nothing else in this plan depends on it. Under concurrency, a cell that hits a
429 records an `agentError` (today's behavior, unchanged) and — thanks to Layer 1
— costs one slot, not the run; the run still completes. The follow-up spec adds
the retry on top of this scheduler.

**Companion action (outside kata-plan):** trim spec 2130 to match — remove the
"Rate-limit backpressure" in-scope row and the "Rate-limit failures back off"
[L1] success criterion (via `kata-spec`), and remove the § Layer 1
`retryRateLimited` row from design-a (via `kata-design`) — then open the
follow-up spec for the backpressure mechanism.

## Step 5 — `resolveConcurrency` + `--concurrency` flag

Concurrency is on by default with a flag/env override.

- **Modified:** `src/commands/benchmark-run.js`, `src/commands/benchmark-definition.js`

In `benchmark-run.js` add:

```js
import { availableParallelism } from "node:os";
const CONCURRENCY_CEILING = 4; // each cell spawns ~3 agent subprocesses
export function resolveConcurrency(values, env = {}) {
  const raw = values.concurrency ?? env.LIBHARNESS_BENCHMARK_CONCURRENCY;
  if (raw != null) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1)
      throw new Error("--concurrency must be a positive integer");
    return n;
  }
  const cores = availableParallelism?.() ?? 1;
  return Math.min(CONCURRENCY_CEILING, Math.max(2, Math.floor(cores / 2)));
}
```

Thread `concurrency: resolveConcurrency(values, env)` into the object
`parseRunOptions` returns. Add a `concurrency` option to the `run` command in
`benchmark-definition.js` (`type: "string"`, description naming the default
formula and `LIBHARNESS_BENCHMARK_CONCURRENCY` env).

**Default on the CI runner (recorded rationale).** On `ubuntu-latest` (2 vCPU)
the formula resolves to `2` (`max(2, ⌊2/2⌋)`), and each cell spawns ~3 agent
subprocesses — but those sessions are API-I/O-bound (waiting on the provider),
not CPU-bound, so 2-way overlap on 2 cores is intentionally conservative and
survivable. Layer-1 on the existing runner roughly halves single-job wall-clock;
the bulk of the CI speedup for the outcome go-see comes from **Layer 2 sharding
across machines** (Part 03), not from raising this in-job default. The
`CONCURRENCY_CEILING` constant stays low for the same subprocess-fan-out reason.

Verification: `resolveConcurrency({})` returns `> 1`;
`resolveConcurrency({concurrency: "8"})` returns `8`; env fallback honored; the
`run --help` golden (Step 7) shows `--concurrency`.

## Step 6 — Rewire `run()` to the scheduler + single-writer drain

Replace the serial nested loop with enumerate → schedule → single-writer drain;
`run()` yields in completion order.

- **Modified:** `src/benchmark/runner.js`

- Accept `concurrency` in the constructor (default `1` only as a defensive
  floor; the CLI always passes a resolved value).
- Accept an optional `watchdogMs` constructor opt (default `AGENT_WATCHDOG_MS`)
  and thread it to **both** sites that read the constant in `#runAgent` — the
  cosmetic message (runner.js:372) and the `setTimeout` arg (runner.js:375) — so
  the injection is not half-applied. The 20-min real-timer constant cannot fire
  inside a unit test, so the "stall costs one slot" test (Step 7) depends on this
  override; mirror the existing injectable `termGraceMs` pattern.
- In `run()`, after staging and task filtering, build
  `const cells = enumerateCells(tasks, this.runs)`.
- Construct `new CellScheduler({ concurrency: this.concurrency, runCell: (cell) =>
  this.#runOne(family, wm, cell.task, cell.runIndex, skillSetHash,
  judgeProfilesDir) })`.
- The drain loop is the **sole writer** of `results.jsonl`: `for await (const
  record of scheduler.run(cells)) { await writeRecord(resultsStream, record);
  yield record; }`. Delete the `for (task) for (runIndex)` loop. Keep the
  `finally { resultsStream.end }`.
- Update the file header comment: results stream in **completion order**, and
  the single-writer drain is the durability + crash-safety mechanism (each
  record appended the moment its cell settles; no sidecar).

Verification: covered by Step 7's concurrency, parity, durability, and stall
tests; existing `benchmark-e2e.integration.test.js` still passes at the default
concurrency.

## Step 7 — Tests for every L1 criterion

Cover the Layer-1 success criteria with the fake-agent seam; no live LLM spend.

- **Created:** `test/benchmark-scheduler.test.js`,
  `test/benchmark-runner-concurrency.test.js`,
  `test/benchmark-port-registry.test.js`
- **Modified:** `test/golden/fit-benchmark/run-help.stdout.txt` (regenerated),
  `test/work-tracker.test.js` (the existing host of the `parseRunOptions` option
  tests) for `resolveConcurrency`.

Each row maps to a spec § Success criteria [L1] line:

| Criterion | Test |
| --- | --- |
| Bounded by `C` | fake seam records max-in-flight high-water-mark ≤ `C` over `M` cells |
| On by default | a run with no `--concurrency` executes cells in parallel (high-water-mark > 1) |
| Verdict unchanged | same fixture at `C=1` and `C=8` → byte-identical pass@k + per-task `n`/`c` |
| Port collision-free | Step 2's `PortRegistry` concurrent-acquire test |
| One record per cell | concurrent run of `tasks×runs` → `results.jsonl` parses to exactly that many schema-valid records, none interleaved/truncated |
| Stall costs one slot | one cell forced to the watchdog with `C>1` (inject a short `watchdogMs`): others produce records, run completes, stalled cell is `agentError` |
| Rate-limit backoff | **descoped** — moved to a follow-up spec (Step 4); not a 2130 criterion once the spec is trimmed |

**Substituted verification method (called out).** The spec and design phrase the
bound as "completes in ≈ `ceil(M/C)` batch-durations against the clock seam." The
mock clock advances a single shared virtual `now` and resolves `sleep` on the
next microtask, so concurrent cells do not overlap in virtual time — a
`ceil(M/C)` virtual-wall-clock assertion is not meaningful. These tests instead
assert a **max-in-flight high-water-mark = `C`** and a **logical batch index**
(`floor(completionOrder / C)`), which verify the same boundedness property. The
fake-agent seam increments a shared counter on entry and decrements on exit
around an `await` tick to record the high-water-mark. The "stall costs one slot"
test injects a short `watchdogMs` (Step 6) so the stalled cell's watchdog fires
in-test rather than at 20 min. Regenerate the `run-help` golden by running, from
the `libharness` package root, `node ../../scripts/capture-cli-golden.mjs --bin
fit-benchmark` (the script lives at the monorepo root; the default golden dir
resolves against the package cwd), then confirm the `--verify` run is clean.

Verification: `bun test test/*.test.js` green from `libraries/libharness`.
