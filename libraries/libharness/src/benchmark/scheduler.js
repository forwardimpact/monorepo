/**
 * CellScheduler — bounded concurrent execution of benchmark cells.
 *
 * Keeps at most `concurrency` `runCell(cell)` calls in flight at once and
 * yields each settled record in **completion order** (not grid order). The
 * runner's drain loop consumes this async iterable as the sole writer of
 * `results.jsonl`, so concurrency lives here in execution while the ledger
 * stays single-writer (design 2130-a § Layer 1).
 */

/** Bounded pool that streams settled cell records in completion order. */
export class CellScheduler {
  /**
   * @param {object} opts
   * @param {number} opts.concurrency - Max cells in flight (integer ≥ 1).
   * @param {(cell: {task: object, runIndex: number}) => Promise<object>} opts.runCell -
   *   Runs one cell to a settled record. By contract `runCell` never rejects —
   *   the runner's `#runOne` returns an `agentError`/`schemaError` record rather
   *   than throwing — but a rejection is guarded so one bad cell cannot wedge
   *   the drain.
   */
  constructor({ concurrency, runCell }) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error("concurrency must be an integer ≥ 1");
    if (typeof runCell !== "function")
      throw new Error("runCell must be a function");
    this.concurrency = concurrency;
    this.runCell = runCell;
  }

  /**
   * Run every cell with bounded concurrency, yielding each settled record the
   * moment its cell completes.
   * @param {{task: object, runIndex: number}[]} cells
   * @returns {AsyncGenerator<object>}
   */
  async *run(cells) {
    let next = 0;
    /** @type {Set<Promise<{p: Promise<*>, record: object}>>} */
    const inFlight = new Set();

    const launch = () => {
      const cell = cells[next++];
      // The wrapper resolves to its own handle (for O(1) removal) plus the
      // settled record, and never rejects — a thrown runCell becomes a fail
      // record so the drain keeps consuming.
      const p = Promise.resolve()
        .then(() => this.runCell(cell))
        .then(
          (record) => ({ p, record }),
          (error) => ({ p, record: schedulerFailRecord(cell, error) }),
        );
      inFlight.add(p);
    };

    while (next < cells.length && inFlight.size < this.concurrency) launch();
    while (inFlight.size > 0) {
      const { p, record } = await Promise.race(inFlight);
      inFlight.delete(p);
      yield record;
      if (next < cells.length) launch();
    }
  }
}

/**
 * Defensive fallback when `runCell` rejects (contract says it cannot). Keeps
 * the drain consumable; the record is intentionally minimal and will be
 * skipped by `report`'s schema validation, counted as skipped.
 */
function schedulerFailRecord(cell, error) {
  return {
    taskId: cell.task?.id,
    runIndex: cell.runIndex,
    verdict: "fail",
    schedulerError: error?.message ?? String(error),
  };
}
