# Plan 2130-a Part 02 — Layer 2 (runner/report): sharding + recursive merge

The runner gains a deterministic cell-granular shard selector and `report`'s
record loader is rewritten to discover ledgers recursively, per
[design 2130-a § Layer 2](design-a.md#layer-2--sharding-and-distribution-playwright-inspired).
All changes in `libraries/libharness`; **depends on Part 01** (`enumerateCells`,
completion-order `run()`). Run from the `libharness` package root.

Libraries used: libharness. No new dependency.

## Step 1 — `selectShard`

Partition the enumerated cells round-robin at `(task, runIndex)` granularity.

- **Modified:** `src/benchmark/runner.js`

```js
/**
 * Round-robin partition: cell at position p runs iff p % N === i-1.
 * 1-based i. Union over i∈1..N is the exact grid, each cell once; some
 * shards may be empty when N > cells.length.
 */
export function selectShard(cells, i, total) {
  return cells.filter((_, p) => p % total === i - 1);
}
```

Verification: for `N ∈ {1,2,3,5}` over the fixture grid, the union of all
shards equals `enumerateCells(...)` with no overlap and no gaps; `selectShard(c,
i, N)` is empty for `i > c.length`.

## Step 2 — `--shard=<i>/<N>` parsing and runner wiring

A first-class shard selector applied before scheduling; an unsharded run is the
identity `1/1`.

- **Modified:** `src/commands/benchmark-run.js`, `src/commands/benchmark-definition.js`,
  `src/benchmark/runner.js`

- Add a `parseShard(raw)` helper in `benchmark-run.js`: parse `"<i>/<N>"` to
  `{index, total}`, validate integers with `1 ≤ index ≤ total`; absent → `null`
  (identity). Thread `shard` into `parseRunOptions`' result.
- Add the `shard` option to the `run` command in `benchmark-definition.js`
  (`type: "string"`, description: `i/N`, default whole family).
- In `runner.js` `run()`: accept `shard` in the constructor; after
  `enumerateCells`, apply `const selected = this.shard ? selectShard(cells,
  this.shard.index, this.shard.total) : cells;` and pass `selected` to the
  `CellScheduler`. A zero-cell selection writes an empty `results.jsonl` and
  yields nothing — a valid run.
- **Relax the run command's zero-record guard for deliberately-empty shards.**
  Today `benchmark-run.js:57-64` returns exit 1 when zero records stream — the
  correct signal for "nothing ran" on a normal run, but wrong for a high-index
  shard that legitimately selects zero cells (design § Layer 2: "high-index
  shards select **zero** cells — a valid run"). In `benchmark-run.js`, when
  `opts.shard` is set and `count === 0`, exit `0` with a one-line stderr note
  (`shard i/N selected no cells`) instead of the failure. An unsharded run, or a
  sharded run that *should* have had cells, keeps the exit-1 guard. This is the
  only consumer change the completion-order/shard contract forces on the guard.

Verification: a `--shard=1/3` fixture run writes a partial `results.jsonl`
containing only its assigned cells, each schema-valid; a `--shard=9/3`
(`index > total`) is rejected at parse time; and an end-to-end
`runBenchmarkRunCommand` call for a high-index shard that selects **zero** cells
returns exit `0` with the stderr note (asserting the relaxed guard, not just the
runner).

## Step 3 — Recursive `loadRecords` merge in `report`

`report` discovers every `results.jsonl` under `--input` recursively and unions
records before grouping; the single-file read is deleted.

- **Modified:** `src/benchmark/report.js`, `src/commands/benchmark-run.js`
  (zero-record guard), `test/golden/fit-benchmark/cases.json` +
  `report-empty.*` goldens

- Rewrite `loadRecords(inputDir, runtime)` to walk `inputDir` recursively with a
  **purpose-built generator** (skip `.git`/`node_modules`, match files named
  `results.jsonl`), then parse/validate/union their lines exactly as today (same
  skip-and-count-on-malformed behavior). Do **not** reuse `task-family.js`'s
  private `walkFiles` — it resolves symlinks and is unexported; `report` wants a
  plain `readdir`-recurse with no symlink following, so write a small local
  walker. A lone root-level ledger is the trivial one-match case — one code path.
  Delete the `join(inputDir, "results.jsonl")` single read.
- An unexpected duplicate `(taskId, runIndex)` across shards is **warned and
  counted** to stderr (the partition guarantees none, so a duplicate signals
  misconfiguration), not silently merged — surface it; still include both in
  the group so the count is honest.
- **Pinned empty/missing contract (two distinct cases — do not conflate):**
  - *Input dir exists but contains no `results.jsonl`* → zero records, empty
    union, **exit 0** with an empty report. This is the design's "unions as the
    empty set" (design-a.md:76) and the valid high-index-shard outcome.
  - *Input dir is missing* → the recursive `readdir` ENOENT must propagate so
    `report` still **errors (exit 1)** as today. Two implementer-blind details:
    (a) do **not** wrap the top-level `readdir` in a defensive `try/catch` that
    returns `[]` — that would silently flip the missing-dir case to exit 0 and
    break the retained golden; only an *existing* empty dir yields the empty
    union. (b) Preserve the deliberate stack collapse the current `loadRecords`
    applies (report.js:442-448: `err.stack = \`Error: ${e.message}\``) so the CLI
    error stays free of node-internal async frames; a raw `readdir` ENOENT would
    regenerate to a noisier golden that passes `--verify` while regressing error
    presentation. The existing `report-empty` golden points `--input` at
    `test/golden/fit-benchmark/empty-runs`, **which does not exist on disk** — so
    it stays the missing-dir error case. The error now originates from `readdir`
    (not the old `readFile`); **regenerate `report-empty.*` and keep the `ENOENT`
    transform** in `cases.json`; the exit code stays `1`.
  - Cover the *exists-but-empty → exit 0* path with a new `report` unit test
    (Step 4), since no golden exercises it.

Verification: aggregating `N` shard partials (each from Step 2) yields pass@k
**identical** to a single non-sharded run over the same cells and to the
Part 01 `C`-only run of the same fixture; the regenerated `report-empty` golden
is `--verify` clean.

## Step 4 — Tests for the Layer-2 (runner/report) criteria

- **Created:** `test/benchmark-shard.test.js`,
  `test/benchmark-report-merge.test.js` (recursive discovery, nested-subdir
  union, duplicate-warning, and exists-but-empty cases — split into its own
  sibling because `benchmark-report.test.js` is already 389 LOC and these cases
  would push it past the 400-LOC `test-file-shape` ceiling)
- **Modified:** `test/work-tracker.test.js` (`parseShard` — this file already
  hosts the `parseRunOptions` option tests), `test/golden/fit-benchmark/run-help.*`
  (re-regenerated after Part 01: `--shard` lands in the same definition, so
  this part re-runs the golden capture — see Part 01 Step 7 for the exact
  package-root invocation)

| Criterion | Test |
| --- | --- |
| Exact partition | Step 1's union/overlap/gap assertions for representative `N` |
| Balanced + deterministic | each task's run indexes spread across shards for `N ≤ runs`; same `(family, runs, N)` → same partition on repeat |
| Self-contained partial ledger | Step 2's per-shard `results.jsonl` validity |
| `report` merges to one pass@k | Step 3's identical-pass@k assertion across `N` partials in nested subdirs |

In `benchmark-report-merge.test.js`, seed `results.jsonl` in **nested
subdirectories** (`shard-1/results.jsonl`, `shard-2/results.jsonl`) and assert
the union groups correctly and the duplicate path warns; add a case for an
**existing dir with no `results.jsonl`** asserting zero tasks / exit 0 (the
pinned empty-union contract from Step 3, which no golden covers).

Verification: `bun test test/*.test.js` green from `libraries/libharness`.
