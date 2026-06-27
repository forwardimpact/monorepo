/**
 * Layer-2 recursive-merge coverage for `report` (spec 2130 § Success criteria
 * [L2]). `loadRecords` discovers every `results.jsonl` under `--input`
 * recursively and unions the records; merging shard partials equals reporting a
 * single non-sharded run over the same cells. Split from `benchmark-report.test.js`
 * (already 389 LOC) to stay under the test-file-shape ceiling.
 */

import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

import { aggregate } from "../src/benchmark/report.js";

const ROOT = "/merge-input";

function baseRecord(overrides) {
  return {
    taskId: "sample",
    runIndex: 0,
    verdict: "pass",
    invariants: { verdict: "pass", details: [], exitCode: 0 },
    submission: "x",
    judgeVerdict: { verdict: "pass", summary: "ok" },
    costUsd: 0,
    turns: 1,
    agentTracePath: "/tmp/a.ndjson",
    supervisorTracePath: "/tmp/s.ndjson",
    judgeTracePath: "/tmp/j.ndjson",
    profiles: { agent: null, supervisor: null, judge: null },
    model: { agent: "a", supervisor: "s", judge: "j" },
    skillSetHash: "sha256:a",
    familyRevision: "sha256:b",
    durationMs: 10,
    ...overrides,
  };
}

const jsonl = (records) =>
  records.map((r) => JSON.stringify(r)).join("\n") + "\n";

/** Build a runtime whose mock fs holds the given `{path: records[]}` map. */
function runtimeWith(files, { captureStderr } = {}) {
  const fsMap = {};
  for (const [path, records] of Object.entries(files))
    fsMap[path] = jsonl(records);
  const errs = [];
  const rt = createTestRuntime({ fs: createMockFs(fsMap) });
  if (captureStderr) rt.proc.stderr = { write: (s) => (errs.push(s), true) };
  return { rt, errs };
}

describe("report recursive merge", () => {
  test("unions results.jsonl across nested shard subdirectories", async () => {
    const { rt } = runtimeWith({
      [`${ROOT}/shard-1/results.jsonl`]: [
        baseRecord({ taskId: "x", runIndex: 0, verdict: "pass" }),
        baseRecord({ taskId: "x", runIndex: 3, verdict: "fail" }),
      ],
      [`${ROOT}/shard-2/results.jsonl`]: [
        baseRecord({ taskId: "x", runIndex: 1, verdict: "pass" }),
        baseRecord({ taskId: "x", runIndex: 4, verdict: "pass" }),
      ],
      [`${ROOT}/shard-3/results.jsonl`]: [
        baseRecord({ taskId: "x", runIndex: 2, verdict: "fail" }),
      ],
    });
    const report = await aggregate({
      inputDir: ROOT,
      kValues: [1],
      runtime: rt,
    });
    assert.strictEqual(report.tasks.length, 1);
    assert.strictEqual(report.tasks[0].n, 5);
    assert.strictEqual(report.tasks[0].c, 3);
    assert.strictEqual(report.totals.runs, 5);
  });

  test("merged shard partials yield pass@k identical to a single full run", async () => {
    const verdicts = ["pass", "fail", "pass", "pass", "fail", "pass"];
    const records = verdicts.map((v, i) =>
      baseRecord({ taskId: "t", runIndex: i, verdict: v }),
    );
    // Single run: one root-level ledger.
    const single = runtimeWith({ [`${ROOT}/results.jsonl`]: records });
    const singleReport = await aggregate({
      inputDir: ROOT,
      kValues: [1, 3, 5],
      runtime: single.rt,
    });
    // Sharded: round-robin the same records into 3 subdir ledgers.
    const sharded = runtimeWith({
      [`${ROOT}/shard-1/results.jsonl`]: records.filter((_, p) => p % 3 === 0),
      [`${ROOT}/shard-2/results.jsonl`]: records.filter((_, p) => p % 3 === 1),
      [`${ROOT}/shard-3/results.jsonl`]: records.filter((_, p) => p % 3 === 2),
    });
    const shardedReport = await aggregate({
      inputDir: ROOT,
      kValues: [1, 3, 5],
      runtime: sharded.rt,
    });
    assert.deepStrictEqual(
      shardedReport.tasks.map((t) => ({
        id: t.taskId,
        n: t.n,
        c: t.c,
        p: t.passAtK,
      })),
      singleReport.tasks.map((t) => ({
        id: t.taskId,
        n: t.n,
        c: t.c,
        p: t.passAtK,
      })),
    );
  });

  test("a duplicate (taskId, runIndex) across shards warns and keeps both", async () => {
    const { rt, errs } = runtimeWith(
      {
        [`${ROOT}/shard-1/results.jsonl`]: [
          baseRecord({ taskId: "x", runIndex: 0, verdict: "pass" }),
        ],
        [`${ROOT}/shard-2/results.jsonl`]: [
          baseRecord({ taskId: "x", runIndex: 0, verdict: "fail" }),
        ],
      },
      { captureStderr: true },
    );
    const report = await aggregate({
      inputDir: ROOT,
      kValues: [1],
      runtime: rt,
    });
    // Both copies counted (honest count), not silently merged.
    assert.strictEqual(report.tasks[0].n, 2);
    assert.ok(
      errs.some((e) => /duplicate cell x#0/.test(e)),
      "should warn on the duplicate cell",
    );
  });

  test("an existing dir with no results.jsonl is the empty union (zero tasks)", async () => {
    // A directory that exists (registered via mkdir) but holds no ledger.
    const rt = createTestRuntime({ fs: createMockFs({}) });
    await rt.fs.mkdir(`${ROOT}/empty`, { recursive: true });
    const report = await aggregate({
      inputDir: `${ROOT}/empty`,
      kValues: [1],
      runtime: rt,
    });
    assert.strictEqual(report.tasks.length, 0);
    assert.strictEqual(report.totals.runs, 0);
    assert.strictEqual(report.totals.skipped, 0);
  });
});
