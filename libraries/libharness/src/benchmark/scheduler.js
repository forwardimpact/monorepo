/**
 * CellScheduler — runs benchmark cells concurrently under a bound.
 *
 * The scheduler keeps at most `concurrency` `runCell(cell)` calls in flight
 * at once. It yields each settled record in **completion order**. It does
 * not yield them in grid order. The runner's drain loop consumes this async
 * iterable as the sole writer of `results.jsonl`. Concurrency lives here in
 * execution, and the ledger stays single-writer. The hot path needs no write
 * mutex.
 */

/** Bounded pool that streams settled cell records in completion order. */
export class CellScheduler {
  /**
   * @param {object} opts
   * @param {number} opts.concurrency - Max cells in flight (integer ≥ 1).
   * @param {(cell: {task: object, runIndex: number}) => Promise<object>} opts.runCell -
   *   Runs one cell to a settled record. By contract `runCell` never rejects.
   *   The runner's `#runOne` catches setup, agent, and schema failures. It
   *   returns a record instead of a throw. The scheduler still guards against
   *   a rejection, so one bad cell cannot wedge the drain.
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
   * Run every cell with bounded concurrency. Yield each settled record the
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
      // settled record. It never rejects. A thrown runCell becomes a fail
      // record, so the drain keeps consuming.
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
 * Defensive fallback when `runCell` rejects (the contract says it cannot).
 * The fallback keeps the drain consumable. The record is deliberately
 * minimal. `report`'s schema validation skips it and counts it as skipped.
 */
function schedulerFailRecord(cell, error) {
  return {
    taskId: cell.task?.id,
    runIndex: cell.runIndex,
    verdict: "fail",
    schedulerError: error?.message ?? String(error),
  };
}
