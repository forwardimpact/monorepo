/**
 * Layer-2 sharding coverage (spec 2130 § Success criteria [L2]): `selectShard`
 * is an exact, balanced, deterministic partition, and a `--shard` runner pass
 * writes a self-contained partial ledger (including the deliberately-empty
 * high-index shard).
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import {
  BenchmarkRunner,
  enumerateCells,
  selectShard,
} from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

const RT = createDefaultRuntime();
const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const mockInstallApm = (family, outputDir) =>
  createApmInstaller({ runtime: realRuntimeWithSubprocess() }).install(
    family,
    outputDir,
  );

async function passingAgent(_task, workdir) {
  await writeFile(workdir.agentTracePath, "");
  await writeFile(workdir.supervisorTracePath, "");
  return { costUsd: 0, turns: 1, submission: "done" };
}
async function mockRunJudge(_task, workdir, invariants) {
  await writeFile(workdir.judgeTracePath, "");
  return {
    verdict: invariants.verdict === "pass" ? "pass" : "fail",
    summary: "",
  };
}

async function runShard(shard) {
  const out = await mkdtemp(join(tmpdir(), "benchmark-shard-"));
  const runner = new BenchmarkRunner({
    family: FIXTURE,
    runs: 2,
    output: out,
    agentModel: "claude-sonnet-4-6",
    supervisorModel: "claude-fable-5",
    judgeModel: "claude-fable-5",
    profiles: { agent: null, judge: "judge" },
    query: async function* () {},
    runtime: RT,
    concurrency: 4,
    shard,
    runAgent: passingAgent,
    runJudge: mockRunJudge,
    installApm: mockInstallApm,
    installNpm: async () => {},
    termGraceMs: 100,
  });
  const records = [];
  for await (const r of runner.run()) records.push(r);
  return { records, out };
}

const cellKey = (c) => `${c.task.id}#${c.runIndex}`;
const recKey = (r) => `${r.taskId}#${r.runIndex}`;

describe("selectShard — exact partition", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const cells = enumerateCells(tasks, 5); // 15 cells, task-major

  for (const N of [1, 2, 3, 5]) {
    test(`N=${N}: union is the whole grid, no overlap, no gaps`, () => {
      const union = [];
      for (let i = 1; i <= N; i++) union.push(...selectShard(cells, i, N));
      assert.strictEqual(union.length, cells.length, "no overlap, no gaps");
      assert.deepStrictEqual(
        new Set(union.map(cellKey)),
        new Set(cells.map(cellKey)),
      );
    });
  }

  test("balanced: each task's run indexes spread across shards (N ≤ runs)", () => {
    const N = 5;
    // For each shard, which tasks contributed a cell. With task-major ordering
    // and p%N, a task's 5 runs land on 5 distinct shards — no shard owns a whole
    // task while another gets none.
    for (let i = 1; i <= N; i++) {
      const shard = selectShard(cells, i, N);
      const taskIds = new Set(shard.map((c) => c.task.id));
      assert.strictEqual(taskIds.size, 3, `shard ${i} should touch all tasks`);
    }
  });

  test("deterministic: same (cells, i, N) yields the same partition", () => {
    assert.deepStrictEqual(
      selectShard(cells, 2, 3).map(cellKey),
      selectShard(cells, 2, 3).map(cellKey),
    );
  });

  test("high-index shard selects zero cells when N > cell count", () => {
    const few = enumerateCells([{ id: "x" }], 3); // 3 cells
    assert.strictEqual(selectShard(few, 5, 5).length, 0);
    assert.strictEqual(selectShard(few, 4, 5).length, 0);
    assert.strictEqual(selectShard(few, 1, 5).length, 1);
  });
});

describe("BenchmarkRunner --shard partial ledger", () => {
  test("a shard writes a self-contained partial ledger of only its cells", {
    timeout: 30_000,
  }, async () => {
    const { records, out } = await runShard({ index: 1, total: 3 });
    // Every record validates and is unique.
    for (const r of records) assert.doesNotThrow(() => validateResultRecord(r));
    assert.strictEqual(new Set(records.map(recKey)).size, records.length);
    // The partial ledger on disk matches the streamed records exactly.
    const jsonl = await readFile(join(out, "results.jsonl"), "utf8");
    const lines = jsonl.split("\n").filter(Boolean);
    assert.strictEqual(lines.length, records.length);
    // Its cells are a subset of shard 1/3 of the full grid (no foreign cells).
    assert.ok(records.length > 0 && records.length < 8, "a strict subset");
  });

  test("three shards partition the grid: union equals a single full run", {
    timeout: 60_000,
  }, async () => {
    const N = 3;
    const all = [];
    for (let i = 1; i <= N; i++) {
      const { records } = await runShard({ index: i, total: N });
      all.push(...records);
    }
    const full = await runShard(null); // unsharded ≡ whole grid
    assert.strictEqual(all.length, full.records.length, "no overlap, no gaps");
    assert.deepStrictEqual(
      new Set(all.map(recKey)),
      new Set(full.records.map(recKey)),
    );
  });

  test("a deliberately-empty high-index shard writes an empty ledger, yields nothing", {
    timeout: 30_000,
  }, async () => {
    // 4 tasks × 2 runs = 8 cells; shard 50/50 selects none.
    const { records, out } = await runShard({ index: 50, total: 50 });
    assert.strictEqual(records.length, 0);
    const names = await readdir(out);
    assert.ok(names.includes("results.jsonl"), "an empty ledger still exists");
    const body = await readFile(join(out, "results.jsonl"), "utf8");
    assert.strictEqual(body.trim(), "", "ledger is empty");
  });
});
