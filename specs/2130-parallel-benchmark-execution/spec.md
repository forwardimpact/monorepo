# Spec 2130 — Parallel Benchmark Execution: In-Process Concurrency + Cross-Machine Sharding

`fit-benchmark` runs a task family strictly serially. The `kata-skills` eval
(`eval-kata.yml`, run 28264945754) ran for **six hours and was cancelled at the
GitHub Actions ceiling** without producing a verdict. The benchmark's value —
proving a skill change made agents better — is worthless if a run cannot finish
inside CI. This spec makes a benchmark run fast enough to complete, by executing
independent work concurrently on one machine **and** across many.

Serves **Platform Builders** — the persona who hires `fit-benchmark` to *prove
a skill change improved outcomes* (see
[libraries/README.md § Jobs To Be Done](../../libraries/README.md#jobs-to-be-done)).
A pass@k verdict is worthless if the run cannot finish inside a CI budget. The
cancelled `kata-skills` eval is the *triggering consumer* (Teams Using Agents —
run a continuously improving agent team), but the job-to-be-done belongs to the
Platform Builder running the benchmark.

**Classification: internal.** The change lands in `libraries/libharness` and in
`.github/` (a new reusable workflow) — both internal trees. The shared rubric
keys classification on **where the change lands**, not on whether the tool is
later published; this is internal infrastructure that serves a Platform Builder
job, not a change under `products/` or `services/`.

## Problem

**The runner is serial by construction.** The benchmark runner walks a nested
loop — for every task, for every run index — and awaits each cell
(`(task, runIndex)`) end-to-end before starting the next: setup → supervised
agent session → invariants → judge → teardown. Wall-clock is therefore the
**sum of all cells**.

**The magnitude.** The `kata-skills` family is 6 tasks × `runs: 5` = **30
cells**. Each cell carries a supervised agent session (lead + agent-under-test)
plus a judge session, bounded only by a **20-minute per-agent watchdog**. Thirty
cells in series against that bound is multi-hour by design; the observed run hit
360 minutes and was cancelled. The workflow already carries scar tissue from
this: `eval-kata.yml` notes a *prior* timeout (run 27922619997) where "5
coordinate-finding stalls exhausted it," and raised the job budget to the
360-minute hard ceiling — which the next run then also exhausted. Raising the
timeout is not a fix; the ceiling is fixed and the work grows with
tasks × runs.

**Stall amplification.** Because cells run in series, one stalled cell riding its
full 20-minute watchdog delays *every* cell behind it. A single pathological
task (the family's `coordinate-finding` is the documented offender) can consume
a third of the entire budget before its own watchdog even fires.

**The work is already independent — the architecture just doesn't exploit it.**
Each cell is allocated its own per-task working directory, its own TCP port, and
its own process group for teardown. The only state shared across cells is the
**one-time apm/skill staging directory** (built once before the loop, read-only
during runs) and the **single `results.jsonl` append stream**. Cells do not
depend on each other's outcomes; pass@k is computed from per-cell verdicts whose
values do not depend on execution order. This is embarrassingly parallel work
running one-at-a-time.

**Three latent hazards block naive concurrency.** The serial loop gets these for
free; any concurrency layer must solve them or it will corrupt results:

| Hazard | Today | Under concurrency |
| --- | --- | --- |
| **Port allocation** | The port allocator opens a listener on port 0, reads the assigned port, **closes the listener, then returns the bare number**. | Two cells racing the allocate→bind window can be handed the **same** port; a real allocate-and-hold contract is required. |
| **Results durability** | A single append stream is written one awaited line at a time. | Concurrent writers can interleave or lose lines; the verdict ledger must stay one-valid-record-per-cell. |
| **API rate / cost** | One agent session at a time naturally rate-limits itself. | `concurrency × shards` simultaneous agent sessions can trip provider 429s. Graceful 429 backoff is **deferred to a follow-up spec** (see § Excluded); under this spec a 429'd cell records an `agentError` and costs one slot, not the run. |

**The single-machine ceiling is real.** Even perfect in-process concurrency is
bounded by one runner's CPU, memory, file descriptors, and the per-job timeout.
Each cell spawns ~3 agent subprocesses, so one `ubuntu-latest` box holds only a
handful before contention. Beating the **per-job** ceiling requires more than one
machine — which a step-level composite action cannot orchestrate on its own.

## Goal

Make a `fit-benchmark` run complete well within a CI budget by running
independent cells concurrently, on two composable axes — **many cells per
machine** and **many machines per run** — without changing the pass@k a
consumer would have gotten from the serial runner, and without requiring any
consumer to opt in for the first axis.

## Solution shape (two composable layers)

Adopt the model proven by parallel test runners (Playwright): **workers within a
machine, shards across machines, then a merge.**

- **Layer 1 — In-process concurrency (Option 1).** A bounded worker pool runs up
  to `C` cells concurrently inside one runner process. Native to the runner,
  **on by default**, transparent to every consumer. Divides single-job
  wall-clock by what one machine holds, and converts a stall from a
  whole-run tax into a single occupied slot.

- **Layer 2 — Cross-machine sharding (Option 3, Playwright-inspired).** A
  first-class `--shard=<i>/<N>` selector runs a deterministic, balanced subset of
  the grid; each shard emits a partial result ledger; `report` merges partials
  into one pass@k. A **reusable workflow** (new sibling artifact) fans the shards
  across a CI matrix and runs a dependent merge job, so a consumer gets
  cross-machine parallelism from a single `shard-total` input. Beats the
  per-job ceiling by using `N` jobs.

The layers compose: each of `N` shard jobs runs Layer-1 concurrency internally,
so effective parallelism is `N × C`.

## Scope

### In scope — Layer 1 (libharness / `fit-benchmark` CLI)

| Change | Detail |
| --- | --- |
| Bounded concurrent execution of cells | The runner executes up to `C` cells concurrently, replacing the serial nested loop. `C` is **>1 by default** (transparent speedup) and overridable by a `--concurrency` flag and a matching action input. The default value (CPU/rate-limit aware) and the scheduling mechanism are design concerns; default-on is not. |
| Concurrency-safe port allocation | Each in-flight cell receives a **distinct, bindable** port; the current close-then-return allocator's TOCTOU race (two cells handed the same number) is eliminated. The reservation mechanism is a design concern. |
| Durable, concurrency-safe result ledger | One valid `ResultRecord` per cell regardless of `C` — no interleaved, lost, or truncated lines — and a killed run **retains the cells already completed** (crash-safe). The on-disk shape that achieves both is a design concern. |
| Order-independent verdict contract | `run()` may yield records in completion order rather than grid order. Every consumer of the record stream — the CLI's stdout mirror, `anyFail`, the zero-record guard, and `report`'s aggregation — must be order-independent; `report` groups by `taskId`, so pass@k does not depend on order. This contract change is stated, not hidden. |
| Per-cell isolation preserved | The existing per-task CWD, process group, watchdog, and teardown-with-port-verification continue to bound each cell independently; concurrent teardown of disjoint process groups must not collide. |
| Staging stays a one-time prelude | apm/skill staging runs once before fan-out and is read-only during runs; it is not duplicated per cell. |

### In scope — Layer 2 (sharding + distribution)

| Change | Detail |
| --- | --- |
| `--shard=<i>/<N>` selector | The runner flattens the family into a stable, ordered list of cells and runs only the cells assigned to shard `i` of `N`. The N shards form an exact **partition** of the grid — every cell runs on exactly one shard, none twice, none dropped. |
| Cell-granular, balanced assignment | Assignment is at `(task, runIndex)` granularity, not per-task, so a long task's runs spread across shards (interleaved/round-robin), avoiding the "one slow task monopolizes one job" imbalance. Deterministic and stable across invocations. |
| Multi-input merge in `report` | `report` aggregates across **multiple shard partial ledgers** into one pass@k, equal to reporting a single non-sharded run over the same cells. (Today it reads one `results.jsonl` from one directory.) |
| Reusable workflow (new sibling artifact) | A `workflow_call` reusable workflow shipped by the `forwardimpact/fit-benchmark` sibling lets a consumer get cross-machine parallelism from a single `shard-total` input: it fans the shards across CI machines, then merges their partial ledgers into one combined report. Inputs mirror the composite action plus `shard-total`. The internal job topology (matrix, shard-scoped artifact hand-off, dependent merge job) is a design concern. |
| Composite action becomes the per-shard primitive | The action gains `concurrency`, `shard-index`, `shard-total`, and `mode` inputs. An unsharded run is the identity case `shard-index: 1, shard-total: 1` — not a preserved legacy path. The reusable workflow composes this one primitive across the matrix; a consumer may also invoke it directly in their own job. |

### `fit-bootstrap` and the matrix (the distribution consideration)

A composite action is a **step**; a matrix is a **job** construct. So
cross-machine parallelism cannot be delivered by the composite action alone — it
requires either the consumer authoring a matrix or a `workflow_call` reusable
workflow that owns the matrix. The reusable workflow is the transparent path,
and it changes how `fit-bootstrap` is consumed:

| Concern | Requirement |
| --- | --- |
| Per-shard environment | Each matrix shard job sets up its own benchmark environment via `fit-bootstrap` (a new sibling→sibling `uses:` edge from the fit-benchmark reusable workflow to `fit-bootstrap`, governed by the sibling per `.github/CLAUDE.md`). `fit-bootstrap` must be safe to run in `N` parallel jobs: cache reads, wiki-checkout token minting, and any workspace setup must be shard-independent with no cross-job write contention. |
| Merge-job environment | The merge job needs only the `report` CLI and the shard artifacts — **not** a per-run agent scaffold. Either `fit-bootstrap` supports a setup sufficient for `report` without the full benchmark environment, or the reusable workflow provisions the merge job's minimal environment directly. Which one is a design decision; the requirement is that merge does not pay for a benchmark env it never uses. |
| Artifact-name collisions | Per-shard partial artifacts must carry shard-unique names (the established matrix `case:`/shard-index disambiguation in `.github/CLAUDE.md`), so `N` concurrent uploads do not collide and the merge job can collect them all. |
| Sandbox flag | Each shard's agent-spawning step still sets `IS_SANDBOX=1` (per `.github/CLAUDE.md`); sharding does not change the bypass-permissions requirement. |

### Excluded

- **Cross-job work-stealing / dynamic load balancing.** Static cell-granular
  sharding is the 80/20; a shared queue across CI jobs needs external
  coordination and is out of scope.
- **Changing what a cell does** — the supervised agent + invariants + judge
  lifecycle, the watchdog duration, grading surfaces, and the result schema's
  meaning are unchanged. (The ledger's *storage shape* may change; a record's
  fields do not.)
- **Reducing per-cell cost or token usage.** This spec compresses wall-clock;
  total spend across a run is unchanged but is incurred faster, so a consumer's
  budget or rate ceiling may surface sooner — acknowledged, not addressed here.
- **Auto-scaling shard count to family size.** `shard-total` is a consumer
  input; deriving an optimal `N` automatically is a later concern.
- **Rate-limit backpressure (429 backoff/retry).** Deferred to a follow-up spec.
  A 429 does not throw at the agent-session boundary — the agent runner returns
  it as a result field — and a robust retry seam is the cross-cutting shared
  agent-runner query call, a design-owned decision better made on its own. Under
  this spec a 429'd cell records an `agentError` and, thanks to Layer-1
  concurrency, costs one slot rather than the run.
- **Provider rate-limit raising.** The run must tolerate existing limits;
  negotiating higher limits is operational, not in scope.
- **Backward-compatibility shims or fallback flags.** This is a **clean break**:
  the serial loop, the old port allocator, and the single-file report read are
  replaced outright and deleted, not kept behind a `--legacy`/compat flag or a
  dual ledger representation (see design § Clean break). Layer 1's transparency
  is a default-value choice, not a compat shim.

## Success criteria

Verifiable at merge time. Layer-1 criteria are testable with the runner's
existing fake-agent test seam against the injected clock, so they need no live
LLM spend. Tagged **[L1]** (in-process concurrency) or **[L2]** (sharding +
distribution).

| Criterion | Layer | Verification |
| --- | --- | --- |
| Cells execute concurrently, bounded by `C`. | L1 | With the fake-agent seam, a run of `M` cells at concurrency `C` records a **max-in-flight ≤ C** and completes in ≈ `ceil(M/C)` batch-durations against the clock seam — not `M`. |
| Concurrency is on by default. | L1 | A run invoked with no concurrency flag uses `C > 1`; the default is exercised by a test asserting parallel execution without passing `--concurrency`. |
| The verdict is unchanged by concurrency. | L1 | The same fixture run at `C = 1` and `C = 8` produces byte-identical pass@k and identical per-task `n`/`c`. |
| Port allocation is collision-free under concurrency. | L1 | `K` cells allocated concurrently receive `K` distinct ports, each actually bindable at hand-off (the allocate-and-hold contract); a test that previously could collide under the close-then-return allocator now cannot. |
| The result ledger is one valid record per cell under concurrency. | L1 | After a concurrent run of `tasks × runs` cells, `results.jsonl` parses with exactly that many records, every one schema-valid, none truncated or interleaved. |
| A stall costs one slot, not the run. | L1 | With one cell forced to stall to its watchdog and `C > 1`, the other cells produce records and the run completes; the stalled cell is recorded as an `agentError`, and total wall-clock is bounded by `ceil(M/C)` batches, not `M`. |
| `--shard=i/N` runs an exact partition. | L2 | For representative `N`, the union of all shards' executed cell-sets equals the full grid with **no overlap and no gaps** — each `(task, runIndex)` runs on exactly one shard. |
| Shard assignment is balanced and deterministic. | L2 | Each task's run indexes are distributed across shards (no shard gets a whole task while another gets none for `N ≤ runs`), and the same `(family, runs, N)` yields the same partition on repeat invocations. |
| Each shard emits a self-contained partial ledger. | L2 | A `--shard` run writes a partial `results.jsonl` containing only its assigned cells, valid on its own. |
| `report` merges shard partials into one pass@k. | L2 | Aggregating the `N` shard partials yields pass@k identical to a single non-sharded run over the same cells (and identical to the `C`-only run of the same fixture). |
| The reusable workflow fans out and merges. | L2 | A dispatch of the reusable workflow with `shard-total = K` produces `K` shard jobs plus one dependent merge job; the merge job downloads all `K` shard-scoped artifacts and emits a single combined report and results artifact. |
| An unsharded invocation runs the whole family in one job. | L2 | The action with `shard-total` unset (≡ `1/1`) runs every cell in one job and produces the same report shape, now under Layer-1 concurrency — the identity case of the shard primitive, not a separate code path. |
| The merge job carries no agent scaffold. | L2 | The merge job provisions only what `report` needs (a minimal Node setup — no apm/skill staging, no wiki checkout, no agent runtime). |
| Shards run concurrently without cross-job contention. | L2 | A `shard-total = K` dispatch runs the `K` shard jobs in parallel; each provisions its own independent environment and writes its own shard-scoped artifact, and the run does not serialize the shards. |

**Outcome criterion (go-see)** — the durable target, measured on the live eval
*after* merge, tracked rather than gating: a representative `kata-skills` run
(6 tasks × `runs: 5`) completes and produces a pass@k report **well within the
GitHub Actions per-job ceiling** — the six-hour cancellation does not recur.
Initial go-see: the first post-merge dispatch finishes with a verdict instead of
a timeout.

## Path to approval

Approval is human-only: the spec advances when `wiki/STATUS.md` shows the `2130`
row at `spec approved`, written from a trusted human signal (`spec:approved`
label, APPROVED review, approval comment, or in-session approval). On approval
the spec proceeds to `kata-design` (WHICH/WHERE — the worker-pool placement and
the streaming-contract change in the runner, the port-reservation mechanism, the
durable ledger shape and its merge primitive, the cell-flattening and partition
function for `--shard`, the multi-input `report` merge, and the reusable workflow
topology and its `fit-bootstrap` consumption)
and then `kata-plan`.

The new `forwardimpact/fit-benchmark` → `fit-bootstrap` sibling edge and the
requirement that `fit-bootstrap` be safe under matrix fan-out touch a shared CI
artifact governed by `.github/CLAUDE.md`; that cross-sibling change is
coordinated with the owners of those siblings before the dependent work lands.

— Staff Engineer 🛠️
