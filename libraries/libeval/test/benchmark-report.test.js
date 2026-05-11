import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregate,
  passAtK,
  renderReportMarkdown,
} from "../src/benchmark/report.js";

function baseRecord(overrides = {}) {
  return {
    taskId: "tf/a",
    runIndex: 0,
    verdict: "pass",
    scoring: { verdict: "pass", details: [], exitCode: 0 },
    judgeVerdict: { verdict: "pass", summary: "" },
    submission: "",
    costUsd: 0,
    turns: 1,
    agentTracePath: "/tmp/a.ndjson",
    judgeTracePath: "/tmp/j.ndjson",
    profiles: { agent: null, supervisor: null, judge: null },
    model: "claude-opus-4-7",
    skillSetHash: "sha256:abc",
    familyRevision: "sha256:def",
    durationMs: 100,
    ...overrides,
  };
}

function writeResults(records) {
  const dir = mkdtempSync(join(tmpdir(), "report-"));
  writeFileSync(
    join(dir, "results.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  return dir;
}

describe("passAtK", () => {
  test("HumanEval estimator: 5 runs, 2 pass — pass@1 = 0.4, pass@3 = 0.9", () => {
    // 1 - C(3,1)/C(5,1) = 1 - 3/5 = 0.4
    // 1 - C(3,3)/C(5,3) = 1 - 1/10 = 0.9
    const p1 = passAtK(5, 2, 1);
    const p3 = passAtK(5, 2, 3);
    assert.ok(Math.abs(p1 - 0.4) < 1e-9, `pass@1 = ${p1}`);
    assert.ok(Math.abs(p3 - 0.9) < 1e-9, `pass@3 = ${p3}`);
  });

  test("returns null when k > n", () => {
    assert.strictEqual(passAtK(2, 1, 5), null);
  });

  test("c === n → pass@k = 1", () => {
    assert.strictEqual(passAtK(3, 3, 2), 1);
  });

  test("c === 0 → pass@k = 0", () => {
    assert.strictEqual(passAtK(3, 0, 2), 0);
  });
});

describe("aggregate", () => {
  test("groups by taskId and reports n, c, and pass@k for each k-value", async () => {
    // 5 records for tf/a — pass, fail, fail, pass, fail
    const verdicts = ["pass", "fail", "fail", "pass", "fail"];
    const records = verdicts.map((v, i) =>
      baseRecord({ runIndex: i, verdict: v }),
    );
    const dir = writeResults(records);
    const report = await aggregate({ inputDir: dir, kValues: [1, 3] });
    assert.strictEqual(report.tasks.length, 1);
    const row = report.tasks[0];
    assert.strictEqual(row.taskId, "tf/a");
    assert.strictEqual(row.n, 5);
    assert.strictEqual(row.c, 2);
    assert.ok(Math.abs(row.passAtK[1] - 0.4) < 1e-9);
    assert.ok(Math.abs(row.passAtK[3] - 0.9) < 1e-9);
    assert.strictEqual(report.totals.tasks, 1);
    assert.strictEqual(report.totals.runs, 5);
    assert.strictEqual(report.totals.skipped, 0);
  });

  test("skips malformed records and increments totals.skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "report-"));
    const good = baseRecord();
    const malformed = JSON.stringify({ taskId: "x", verdict: "maybe" });
    writeFileSync(
      join(dir, "results.jsonl"),
      [JSON.stringify(good), malformed, ""].join("\n") + "\n",
    );
    const report = await aggregate({ inputDir: dir, kValues: [1] });
    assert.strictEqual(report.tasks.length, 1);
    assert.strictEqual(report.totals.runs, 1);
    assert.strictEqual(report.totals.skipped, 1);
  });

  test("reports k > n as a structured error row", async () => {
    const dir = writeResults([baseRecord({ runIndex: 0 })]);
    const report = await aggregate({ inputDir: dir, kValues: [5] });
    const row = report.tasks[0];
    assert.deepStrictEqual(row.passAtK[5], { value: null, error: "k > n" });
  });
});

describe("renderReportMarkdown", () => {
  test("emits a table with one row per task and the totals line", () => {
    const report = {
      tasks: [
        { taskId: "tf/a", n: 5, c: 2, passAtK: { 1: 0.4, 3: 0.9 } },
        {
          taskId: "tf/b",
          n: 1,
          c: 0,
          passAtK: { 1: 0, 3: { value: null, error: "k > n" } },
        },
      ],
      totals: { tasks: 2, runs: 6, skipped: 0 },
    };
    const out = renderReportMarkdown(report, [1, 3]);
    assert.match(out, /taskId.*n.*c.*pass@1.*pass@3/);
    assert.match(out, /tf\/a/);
    assert.match(out, /tf\/b/);
    assert.match(out, /tasks: 2/);
    assert.match(out, /n\/a/); // k > n row rendered as n/a
  });
});
