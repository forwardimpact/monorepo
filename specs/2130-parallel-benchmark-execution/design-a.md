# Design 2130-a — Parallel Benchmark Execution

Implements spec 2130. The serial nested loop in `BenchmarkRunner.run()` becomes a
bounded concurrent scheduler (Layer 1), and the runner gains a deterministic
shard selector plus a multi-input merge in `report`, fanned across CI by a new
reusable workflow (Layer 2). A record's verdict, schema, and the per-cell
lifecycle (`#runOne`: setup → supervised agent → invariants → judge → teardown)
are unchanged; only *how many cells run at once* and *how the ledger is
assembled* change.

## Architecture

```mermaid
flowchart TB
  subgraph runner["BenchmarkRunner.run() (one process)"]
    EN[enumerateCells] --> SH{shard selector}
    SH -->|cells for this shard| SCHED[CellScheduler pool size C]
    SCHED -->|"#runOne (unchanged)"| W1[cell]
    SCHED --> W2[cell]
    SCHED --> W3[cell]
    W1 & W2 & W3 -->|completed record| CH[(completion channel)]
    CH --> DRAIN[single-writer drain loop]
    DRAIN -->|append| JSONL[(results.jsonl)]
    DRAIN -->|yield| OUT[CLI stdout / iterator]
    W1 & W2 & W3 -.acquire/release.-> PR[PortRegistry]
    W1 & W2 & W3 -.crash-safe.-> RF[(per-cell result.json)]
  end
```

Concurrency lives in execution (`CellScheduler` runs `C` cells at once); the
ledger stays **single-writer** because only the drain loop appends to
`results.jsonl` and yields. Workers communicate completions through a channel,
never touch the shared stream. This keeps Layer 1's durability guarantee without
a write mutex.

## Layer 1 — in-process concurrency

| Component | Where | Responsibility |
| --- | --- | --- |
| `enumerateCells(tasks, runs)` | `benchmark/runner.js` | Flatten the grid into a stable ordered `{taskId, runIndex}` list, **task-major / runIndex-minor**. This exact ordering is a load-bearing contract: Layer 2's round-robin balance depends on a task's runIndexes being adjacent in the list. Single source of the cell list for both the scheduler and the shard selector. |
| `CellScheduler` | new `benchmark/scheduler.js` | Bounded pool: keep ≤ `C` `#runOne` calls in flight; as one settles, start the next; push each settled record onto the completion channel. Built on a small permit semaphore (no new dependency). |
| completion channel + drain loop | `runner.js` `run()` | Async queue the scheduler pushes settled records into; the generator drains it, appends each record to the shard's `results.jsonl`, and yields. Sole writer of the ledger. |
| `PortRegistry` | `benchmark/workdir.js` | Replaces `allocatePort()`: hand out distinct, bindable ports under a lock with a live in-use set; re-probe if the OS returns an already-reserved number; release on teardown. |
| per-cell `result.json` | written by `#runOne`, under `WorkdirManager`'s run dir | After `#runOne` builds and validates a cell's record (before `wm.teardown`), it writes that record to `runs/<slug>/<i>/result.json`. This is the **crash-recovery** unit: a killed run can reconstruct `results.jsonl` from the per-cell files it already wrote. It is *not* the merge target — Layer 2 merges shard-level `results.jsonl` files (below). |
| `resolveConcurrency` | `commands/benchmark-run.js` | `--concurrency` flag > `LIBHARNESS_BENCHMARK_CONCURRENCY` env > default `min(CONCURRENCY_CEILING, max(2, ⌊cores/2⌋))` (where `CONCURRENCY_CEILING` is a plan-time constant, conservative because each cell spawns ~3 agent subprocesses). |
| `retryRateLimited` | `benchmark/runner.js` (`#runAgentSafe`) | Wrap the agent session: a 429/rate-limit-class failure retries with bounded exponential backoff inside the cell (under the 20-min watchdog) instead of immediately recording an `agentError`. |

**Streaming contract change.** `run()` now yields in **completion order**, not
grid order. The CLI consumer already treats records order-independently
(`stdout` mirror, `anyFail`, zero-record guard), and `report` groups by `taskId`,
so pass@k is unaffected. This is the one observable behavior change and is called
out in the spec.

**Port hand-off, honestly.** A truly held socket cannot be bound by the agent
later, so `PortRegistry` reserves the *number* (lock + in-use set + re-probe),
not the socket — closing the OS race window that the close-then-return allocator
left open. The reservation lives for the cell and is released at teardown
alongside the existing process-group kill and port-free probe.

## Layer 2 — sharding and distribution (Playwright-inspired)

Playwright's model: `--shard=i/N` runs a slice locally, each slice writes a blob
report, and `merge-reports` stitches the blobs into one. We mirror it.

| Component | Where | Responsibility |
| --- | --- | --- |
| `--shard=<i>/<N>` | `commands/benchmark-run.js` → runner | 1-based like Playwright. Parsed to `{index, total}`; validate `1 ≤ i ≤ N`. The runner applies `selectShard` to the enumerated cells before scheduling. When `N > cell count`, the high-index shards select **zero** cells — a valid empty run that writes an empty (header-less) `results.jsonl` the merge tolerates. |
| `selectShard(cells, i, N)` | `benchmark/runner.js` | Round-robin partition: cell at position `p` runs iff `p % N === i-1`. Deterministic; the union over `i∈1..N` is the exact grid, each cell once; some shards may be empty (above). |
| multi-input merge | `loadRecords` in `benchmark/report.js` | The recursion lives in `loadRecords`: `report --input=<dir>` discovers **every** `results.jsonl` under the tree (not just `<dir>/results.jsonl`) and unions the records before grouping. The per-cell `result.json` files are ignored by the merge — shards are the merge unit. A single top-level ledger (today's shape) still works as the one-file case. |
| reusable workflow | **new** sibling artifact `forwardimpact/fit-benchmark/.github/workflows/benchmark.yml` (`on: workflow_call`) | Owns the matrix a step-level composite action cannot. Inputs mirror the action plus `shard-total`; `ANTHROPIC_API_KEY` as a secret. External consumers reference it `@v1`; the monorepo's own `eval-kata.yml` SHA-pins it per `.github/CLAUDE.md`. |
| `mode: run\|merge` | `forwardimpact/fit-benchmark` composite action | **Additive, default-preserving:** with no new inputs the action behaves exactly as today (`mode: run`, single job, now Layer-1 concurrent). `merge` runs `report` over a download dir and writes the step summary + combined artifact, keeping both halves behind one SHA-pinned action. |

```mermaid
flowchart LR
  D[workflow_call: shard-total=N] --> P[prepare: emit shards JSON 1..N]
  P --> M{{matrix: shard in 1..N}}
  M --> S1["shard 1: fit-bootstrap + action run --shard=1/N → upload benchmark-shard-1"]
  M --> S2["shard 2: … → benchmark-shard-2"]
  M --> SN["shard N: … → benchmark-shard-N"]
  S1 & S2 & SN --> MG["merge (needs: shard): download benchmark-shard-* → action mode=merge → report + summary"]
```

The shard count is dynamic, so a `prepare` job emits `[1..N]` as JSON and the
shard job consumes `matrix: fromJSON(needs.prepare.outputs.shards)`. Each shard
uploads a **shard-scoped** artifact name (`benchmark-shard-<i>`, the shard index
playing the disambiguating role that `case:` plays for matrix trace artifacts in
`.github/CLAUDE.md`) so `N` concurrent uploads never collide and `merge` — via
`download-artifact` with a `benchmark-shard-*` pattern — collects all of them.

### `fit-bootstrap` and the matrix

| Job | Bootstrap | Why |
| --- | --- | --- |
| shard ×N | `fit-bootstrap@<sha>` (full env) | Each shard runs real agent sessions; it needs the same env eval runs today. New sibling→sibling `uses:` edge, governed by the sibling. Must be **parallel-safe**: cache keys shard-independent (reads only), and `N` concurrent wiki-token mints tolerated. |
| merge ×1 | **none** — minimal `setup-node` only | `report` reads JSONL and computes pass@k; it touches no wiki, no agent runtime, no apm staging. Paying for `fit-bootstrap` here would provision an environment the merge never uses. |

`IS_SANDBOX=1` stays on each shard's agent-spawning step (the action sets it);
the merge job spawns no agent and needs none. The monorepo's own `eval-kata.yml`
migrates to call the reusable workflow with a `shard-total`, dogfooding the path;
the single-job composite-action entry remains for consumers who want one box.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Ledger safety under concurrency | Single-writer drain loop fed by a completion channel; workers never write the shared stream | A write mutex around `results.jsonl` — serializes I/O on the hot path and still needs the channel to preserve yield semantics |
| Crash safety | Per-cell `result.json` as a crash-recovery unit, plus the assembled shard `results.jsonl` | Only the append stream — a killed run loses all completed cells |
| Port collisions | `PortRegistry`: reserve the number under a lock + re-probe | Hold the listening socket (agent then can't bind it) or per-slot static port ranges (brittle across families/hosts) |
| Shard balance | Round-robin `p % N` at **cell** granularity | Playwright's contiguous blocks — cell durations are highly skewed (`implement-feature`, stall-prone `coordinate-finding`), so contiguous risks one shard owning a slow task's whole run block |
| Merge surface | Recursive `results.jsonl` discovery under `--input` | A new `merge` subcommand — `report` already aggregates; recursive discovery makes the one-file and many-shard cases one code path |
| Merge in CI | Reuse the composite action via `mode: merge` | A raw `npx fit-benchmark report` step — leaves an unpinned invocation outside the SHA-pinned action surface |
| Merge-job env | No `fit-bootstrap`; minimal node setup | Add a minimal mode to `fit-bootstrap` — extra coupling for a job with no wiki/agent/monorepo deps |
| Default concurrency | On by default, flag+env override (formula in the Layer-1 table) | Opt-in flag defaulting to 1 — fails the spec's transparency requirement (consumers get no speedup unchanged) |

## Interfaces

- `BenchmarkRunner` gains `concurrency` and `shard?: {index, total}` opts;
  `run()`'s yield order becomes completion order (documented contract).
- `CellScheduler({concurrency, runCell})` → async iterable of settled records.
- `PortRegistry.acquire(): Promise<number>` / `release(port): void`.
- `aggregate({inputDir, …})` / `loadRecords` discover `**/results.jsonl`
  recursively (added behavior — `loadRecords` reads a single file today); an
  unexpected duplicate `(taskId, runIndex)` is warned and counted, not silently
  merged (the partition guarantees none, so a duplicate signals misconfiguration).
- CLI: `fit-benchmark run --concurrency=<n> --shard=<i>/<N>`;
  `fit-benchmark report --input=<dir>` (now recursive).
- Action inputs: `concurrency`, `shard-index`, `shard-total`, `mode`.
- Reusable workflow inputs: family, runs, max-turns, judge-profile, concurrency,
  `shard-total`; secret `ANTHROPIC_API_KEY`.

## Verification surface

Layer-1 criteria use the runner's existing fake-agent + clock seams (max-in-flight
≤ C, `ceil(M/C)` batches, `C=1` vs `C=8` identical pass@k, port distinctness,
one-record-per-cell, stall isolates to one slot) — no live LLM spend. Layer-2
criteria check `selectShard` is an exact partition, recursive merge equals a
single run, and a `shard-total=K` dispatch yields `K` shard jobs + 1 merge job.

— Staff Engineer 🛠️
