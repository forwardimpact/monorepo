import { describe, test } from "node:test";
import assert from "node:assert";

import { CellScheduler } from "../src/benchmark/scheduler.js";

/** Build `m` trivial cells with a distinct task id per cell. */
function makeCells(m) {
  return Array.from({ length: m }, (_, i) => ({
    task: { id: `t${i}` },
    runIndex: 0,
  }));
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("CellScheduler", () => {
  test("keeps at most C cells in flight (max-in-flight high-water-mark = C)", async () => {
    const C = 3;
    const M = 11;
    let inFlight = 0;
    let highWater = 0;
    const runCell = async (cell) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await tick();
      inFlight--;
      return { taskId: cell.task.id, runIndex: cell.runIndex, verdict: "pass" };
    };
    const scheduler = new CellScheduler({ concurrency: C, runCell });
    const records = [];
    for await (const r of scheduler.run(makeCells(M))) records.push(r);

    assert.strictEqual(records.length, M);
    assert.strictEqual(highWater, C, "high-water-mark must equal the bound");
    assert.strictEqual(inFlight, 0, "all cells must drain");
  });

  test("yields every cell record exactly once", async () => {
    const M = 7;
    const runCell = async (cell) => ({
      taskId: cell.task.id,
      runIndex: cell.runIndex,
      verdict: "pass",
    });
    const scheduler = new CellScheduler({ concurrency: 2, runCell });
    const seen = [];
    for await (const r of scheduler.run(makeCells(M))) seen.push(r.taskId);

    assert.strictEqual(seen.length, M);
    assert.strictEqual(new Set(seen).size, M, "no record yielded twice");
  });

  test("a high concurrency over few cells caps in-flight at the cell count", async () => {
    const M = 2;
    let inFlight = 0;
    let highWater = 0;
    const runCell = async (cell) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await tick();
      inFlight--;
      return { taskId: cell.task.id, runIndex: cell.runIndex, verdict: "pass" };
    };
    const scheduler = new CellScheduler({ concurrency: 8, runCell });
    const records = [];
    for await (const r of scheduler.run(makeCells(M))) records.push(r);

    assert.strictEqual(records.length, M);
    assert.strictEqual(highWater, M);
  });

  test("a rejecting runCell cannot wedge the drain (defensive guard)", async () => {
    const runCell = async (cell) => {
      if (cell.task.id === "t1") throw new Error("boom");
      return { taskId: cell.task.id, runIndex: cell.runIndex, verdict: "pass" };
    };
    const scheduler = new CellScheduler({ concurrency: 2, runCell });
    const records = [];
    for await (const r of scheduler.run(makeCells(3))) records.push(r);

    assert.strictEqual(records.length, 3, "every cell still produces a record");
    const failed = records.find((r) => r.taskId === "t1");
    assert.strictEqual(failed.verdict, "fail");
    assert.match(failed.schedulerError, /boom/);
  });

  test("an empty cell list yields nothing", async () => {
    const scheduler = new CellScheduler({
      concurrency: 4,
      runCell: async () => ({ verdict: "pass" }),
    });
    const records = [];
    for await (const r of scheduler.run([])) records.push(r);
    assert.strictEqual(records.length, 0);
  });

  test("rejects a non-positive concurrency", () => {
    assert.throws(
      () => new CellScheduler({ concurrency: 0, runCell: async () => ({}) }),
      /concurrency must be an integer ≥ 1/,
    );
  });
});
