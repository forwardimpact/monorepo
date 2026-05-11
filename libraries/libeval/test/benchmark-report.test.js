import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { aggregate, renderTextReport } from "../src/benchmark/report.js";

function baseRecord(overrides) {
  return {
    taskId: "tf/sample",
    runIndex: 0,
    verdict: "pass",
    scoring: { verdict: "pass", details: [], exitCode: 0 },
    submission: "x",
    judgeVerdict: { verdict: "pass", summary: "ok" },
    costUsd: 0,
    turns: 1,
    agentTracePath: "/tmp/agent.ndjson",
    judgeTracePath: "/tmp/judge.ndjson",
    profiles: { agent: null, supervisor: null, judge: null },
    model: "m",
    skillSetHash: "sha256:a",
    familyRevision: "sha256:b",
    durationMs: 100,
    ...overrides,
  };
}

async function writeJsonl(records) {
  const dir = await mkdtemp(join(tmpdir(), "benchmark-report-"));
  const path = join(dir, "results.jsonl");
  const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await writeFile(path, body);
  return dir;
}

describe("aggregate", () => {
  test("pass@1 = 0.4 and pass@3 = 0.9 for verdicts pass/fail/fail/pass/fail", async () => {
    const verdicts = ["pass", "fail", "fail", "pass", "fail"];
    const records = verdicts.map((v, i) =>
      baseRecord({ taskId: "tf/x", runIndex: i, verdict: v }),
    );
    const dir = await writeJsonl(records);
    const report = await aggregate({ inputDir: dir, kValues: [1, 3] });
    assert.strictEqual(report.tasks.length, 1);
    const t = report.tasks[0];
    assert.strictEqual(t.taskId, "tf/x");
    assert.strictEqual(t.n, 5);
    assert.strictEqual(t.c, 2);
    assert.strictEqual(t.passAtK[1], 0.4);
    assert.strictEqual(Math.abs(t.passAtK[3] - 0.9) < 1e-9, true);
    assert.strictEqual(report.totals.skipped, 0);
  });

  test("k > n yields a structured error row", async () => {
    const records = [baseRecord({ taskId: "tf/x", runIndex: 0 })];
    const dir = await writeJsonl(records);
    const report = await aggregate({ inputDir: dir, kValues: [3] });
    assert.deepStrictEqual(report.tasks[0].passAtK[3], { error: "k > n" });
  });

  test("schema-invalid records are skipped and counted under totals.skipped", async () => {
    const good = baseRecord({ taskId: "tf/x", runIndex: 0 });
    const bad = { taskId: "tf/x", runIndex: 1 }; // missing required fields
    const dir = await writeJsonl([good, bad]);
    const report = await aggregate({ inputDir: dir, kValues: [1] });
    assert.strictEqual(report.totals.skipped, 1);
    assert.strictEqual(report.tasks[0].n, 1);
  });

  test("groups by taskId and reports tasks sorted lexicographically", async () => {
    const records = [
      baseRecord({ taskId: "tf/b", runIndex: 0, verdict: "pass" }),
      baseRecord({ taskId: "tf/a", runIndex: 0, verdict: "fail" }),
      baseRecord({ taskId: "tf/a", runIndex: 1, verdict: "pass" }),
    ];
    const dir = await writeJsonl(records);
    const report = await aggregate({ inputDir: dir, kValues: [1] });
    assert.deepStrictEqual(
      report.tasks.map((t) => t.taskId),
      ["tf/a", "tf/b"],
    );
  });
});

describe("renderTextReport", () => {
  test("emits a markdown table with one row per task", async () => {
    const records = [
      baseRecord({ taskId: "tf/x", runIndex: 0, verdict: "pass" }),
      baseRecord({ taskId: "tf/x", runIndex: 1, verdict: "fail" }),
    ];
    const dir = await writeJsonl(records);
    const report = await aggregate({ inputDir: dir, kValues: [1] });
    const text = renderTextReport(report, [1]);
    assert.match(text, /\| taskId \| n \| c \| pass@1 \|/);
    assert.match(text, /\| tf\/x \| 2 \| 1 \| 0\.5000 \|/);
  });
});
