import { describe, test } from "node:test";
import assert from "node:assert";

import { aggregate, renderTextReport } from "../src/benchmark/report.js";
import { INPUT_DIR, baseRecord, jsonlRuntime } from "./report-helpers.js";

describe("aggregate", () => {
  test("pass@1 = 0.4 and pass@3 = 0.9 for verdicts pass/fail/fail/pass/fail", async () => {
    const verdicts = ["pass", "fail", "fail", "pass", "fail"];
    const records = verdicts.map((v, i) =>
      baseRecord({ taskId: "x", runIndex: i, verdict: v }),
    );
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1, 3],
    });
    assert.strictEqual(report.tasks.length, 1);
    const t = report.tasks[0];
    assert.strictEqual(t.taskId, "x");
    assert.strictEqual(t.n, 5);
    assert.strictEqual(t.c, 2);
    assert.strictEqual(t.passAtK[1], 0.4);
    assert.strictEqual(Math.abs(t.passAtK[3] - 0.9) < 1e-9, true);
    assert.strictEqual(report.totals.skipped, 0);
  });

  test("k > n yields a structured error row", async () => {
    const records = [baseRecord({ taskId: "x", runIndex: 0 })];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [3],
    });
    assert.deepStrictEqual(report.tasks[0].passAtK[3], { error: "k > n" });
  });

  test("schema-invalid records are skipped and counted under totals.skipped", async () => {
    const good = baseRecord({ taskId: "x", runIndex: 0 });
    const bad = { taskId: "x", runIndex: 1 }; // missing required fields
    const runtime = jsonlRuntime([good, bad]);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
    });
    assert.strictEqual(report.totals.skipped, 1);
    assert.strictEqual(report.tasks[0].n, 1);
  });

  test("groups by taskId and reports tasks sorted lexicographically", async () => {
    const records = [
      baseRecord({ taskId: "b", runIndex: 0, verdict: "pass" }),
      baseRecord({ taskId: "a", runIndex: 0, verdict: "fail" }),
      baseRecord({ taskId: "a", runIndex: 1, verdict: "pass" }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
    });
    assert.deepStrictEqual(
      report.tasks.map((t) => t.taskId),
      ["a", "b"],
    );
  });
});

describe("renderTextReport", () => {
  test("emits a markdown table with one row per task", async () => {
    const records = [
      baseRecord({ taskId: "x", runIndex: 0, verdict: "pass" }),
      baseRecord({ taskId: "x", runIndex: 1, verdict: "fail" }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
    });
    const text = renderTextReport(report, [1]);
    assert.match(text, /\| taskId \| n \| c \| pass@1 \|/);
    assert.match(text, /\| x \| 2 \| 1 \| 0\.5000 \|/);
  });
});

describe("aggregate with includeRuns", () => {
  test("returns runs arrays with expected fields", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        verdict: "pass",
        costUsd: 0.1,
        turns: 5,
        durationMs: 3000,
      }),
      baseRecord({
        taskId: "x",
        runIndex: 1,
        verdict: "fail",
        costUsd: 0.2,
        turns: 8,
        durationMs: 5000,
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    assert.strictEqual(report.tasks.length, 1);
    const task = report.tasks[0];
    assert.ok(Array.isArray(task.runs));
    assert.strictEqual(task.runs.length, 2);
    assert.strictEqual(task.runs[0].runIndex, 0);
    assert.strictEqual(task.runs[0].verdict, "pass");
    assert.strictEqual(task.runs[0].costUsd, 0.1);
    assert.ok(task.runs[0].invariants);
    assert.ok(task.runs[0].judgeVerdict);
    assert.strictEqual(task.runs[1].runIndex, 1);
  });

  test("populates operational totals", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        costUsd: 0.1,
        durationMs: 3000,
        turns: 5,
      }),
      baseRecord({
        taskId: "x",
        runIndex: 1,
        costUsd: 0.3,
        durationMs: 7000,
        turns: 9,
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    assert.strictEqual(report.totals.costUsd, 0.4);
    assert.strictEqual(report.totals.medianDurationMs, 5000);
    assert.strictEqual(report.totals.medianTurns, 7);
    assert.deepStrictEqual(report.totals.model, {
      agent: "a",
      supervisor: "s",
      judge: "j",
    });
    assert.ok(report.totals.skillSetHash);
  });

  test("without includeRuns does not attach runs", async () => {
    const records = [baseRecord({ taskId: "x", runIndex: 0 })];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
    });
    assert.strictEqual(report.tasks[0].runs, undefined);
    assert.strictEqual(report.totals.costUsd, undefined);
  });
});

describe("renderTextReport (full report)", () => {
  test("renders summary, pass@k, and task detail sections", async () => {
    const records = [
      baseRecord({
        taskId: "alpha",
        runIndex: 0,
        verdict: "pass",
        invariants: {
          details: [{ test: "check-1", pass: true }],
          exitCode: 0,
        },
        judgeVerdict: { verdict: "pass", summary: "looks good" },
        costUsd: 0.1,
        turns: 5,
        durationMs: 30000,
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    assert.match(text, /# Benchmark Report/);
    assert.match(text, /✅ \*\*1\/1 tasks passing\*\*/);
    assert.match(text, /## Pass@k/);
    assert.match(text, /## Task Details/);
    assert.match(text, /### alpha/);
    assert.match(text, /✅ \*\*1\/1 runs passed\*\*/);
    assert.match(text, /#### Invariant Checks/);
    assert.match(text, /check-1 \| ✅/);
    assert.match(text, /#### Judge Commentary/);
    assert.match(text, /looks good/);
  });

  test("single run omits Run column in invariant checks", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        invariants: {
          details: [{ test: "t1", pass: true }],
          exitCode: 0,
        },
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    const checksSection = text
      .split("#### Invariant Checks")[1]
      .split("####")[0];
    assert.match(checksSection, /\| Check \| Result \| Message \|/);
    assert.doesNotMatch(checksSection, /\| Run \|/);
  });

  test("multi-run includes Run column in invariant checks", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        invariants: {
          details: [{ test: "t1", pass: true }],
          exitCode: 0,
        },
      }),
      baseRecord({
        taskId: "x",
        runIndex: 1,
        verdict: "fail",
        grade: { verdict: "fail", gatesPass: true },
        invariants: {
          details: [{ test: "t1", pass: false, message: "nope" }],
          exitCode: 0,
        },
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    const checksSection = text
      .split("#### Invariant Checks")[1]
      .split("####")[0];
    assert.match(checksSection, /\| Run \| Check \| Result \| Message \|/);
  });

  test("renders errors section for agent errors", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        verdict: "fail",
        agentError: { message: "boom", aborted: false },
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    assert.match(text, /#### Errors/);
    assert.match(text, /Agent error — "boom"/);
  });

  test("renders errors section for preflight errors", async () => {
    const records = [
      {
        taskId: "x",
        runIndex: 0,
        verdict: "fail",
        costUsd: 0,
        turns: 0,
        profiles: { agent: null, supervisor: null, judge: null },
        model: { agent: "a", supervisor: "s", judge: "j" },
        skillSetHash: "sha256:a",
        familyRevision: "sha256:b",
        durationMs: 100,
        preflightError: {
          phase: "preflight",
          message: "script failed",
          exitCode: 1,
        },
        agentTracePath: "/tmp/a.ndjson",
        supervisorTracePath: "/tmp/s.ndjson",
        judgeTracePath: "/tmp/j.ndjson",
      },
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    assert.match(text, /#### Errors/);
    assert.match(text, /Preflight error — "script failed"/);
    assert.match(text, /preflight error/);
  });

  test("omits invariant checks section when details are empty", async () => {
    const records = [
      baseRecord({
        taskId: "x",
        runIndex: 0,
        invariants: { details: [], exitCode: 0 },
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
      includeRuns: true,
    });
    const text = renderTextReport(report, [1]);
    assert.doesNotMatch(text, /#### Invariant Checks/);
  });
});

describe("renderTextReport (compact report)", () => {
  // Without includeRuns the report carries no per-run detail, so renderTextReport
  // selects the compact path — the shape a sharded run's per-shard summary uses.
  test("renders status header and pass@k table without per-task detail", async () => {
    const records = [
      baseRecord({ taskId: "alpha", runIndex: 0, verdict: "pass" }),
      baseRecord({
        taskId: "beta",
        runIndex: 0,
        verdict: "fail",
        grade: { verdict: "fail", gatesPass: true },
        invariants: {
          details: [{ test: "t1", pass: false, message: "nope" }],
          exitCode: 0,
        },
      }),
    ];
    const runtime = jsonlRuntime(records);
    const report = await aggregate({
      runtime,
      inputDir: INPUT_DIR,
      kValues: [1],
    });
    const text = renderTextReport(report, [1]);
    assert.match(text, /❌ \*\*1\/2 tasks passing\*\* \| 2 runs/);
    assert.match(text, /\| taskId \| n \| c \| pass@1 \|/);
    assert.doesNotMatch(text, /## Task Details/);
    assert.doesNotMatch(text, /#### Invariant Checks/);
  });
});
