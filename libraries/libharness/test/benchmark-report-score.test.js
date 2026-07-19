/**
 * Score aggregation and rendering coverage for `report`: per-task mean
 * score, the score@k expected-best estimator, and the score columns /
 * merged checks table / malformed warnings in the text renderer.
 */

import { describe, test } from "node:test";
import assert from "node:assert";

import { aggregate, renderTextReport } from "../src/benchmark/report.js";
import { INPUT_DIR, baseRecord, jsonlRuntime } from "./report-helpers.js";

/** A scored happy record whose effective score is `score`. */
function scoredRecord(overrides) {
  const { score = 1, ...rest } = overrides;
  return baseRecord({
    verdict: score === 1 ? "pass" : "fail",
    grade: {
      verdict: score === 1 ? "pass" : "fail",
      gatesPass: true,
      score,
    },
    score,
    ...rest,
  });
}

function preflightRecord(overrides) {
  return {
    taskId: "sample",
    runIndex: 0,
    verdict: "fail",
    costUsd: 0,
    turns: 0,
    preflightError: { phase: "preflight", message: "boom", exitCode: 7 },
    profiles: { agent: null, supervisor: null, judge: null },
    model: { agent: "a", supervisor: "s", judge: "j" },
    skillSetHash: "sha256:a",
    familyRevision: "sha256:b",
    durationMs: 50,
    agentTracePath: "/tmp/a.ndjson",
    supervisorTracePath: "/tmp/s.ndjson",
    judgeTracePath: "/tmp/j.ndjson",
    ...overrides,
  };
}

async function report(records, kValues, opts = {}) {
  return aggregate({
    runtime: jsonlRuntime(records),
    inputDir: INPUT_DIR,
    kValues,
    ...opts,
  });
}

describe("aggregate score fields", () => {
  test("binary 0/1 scores reproduce pass@k within 1e-12", async () => {
    const verdicts = ["pass", "fail", "fail", "pass", "fail"];
    const records = verdicts.map((v, i) =>
      scoredRecord({ taskId: "x", runIndex: i, score: v === "pass" ? 1 : 0 }),
    );
    const r = await report(records, [1, 3, 5]);
    const task = r.tasks[0];
    for (const k of [1, 3, 5]) {
      assert.ok(
        Math.abs(task.scoreAtK[k] - task.passAtK[k]) < 1e-12,
        `score@${k} ${task.scoreAtK[k]} should equal pass@${k} ${task.passAtK[k]}`,
      );
    }
  });

  test("fractional scores [0.5, 1] → score@1 = 0.75, score@2 = 1", async () => {
    const records = [
      scoredRecord({ taskId: "x", runIndex: 0, score: 0.5 }),
      scoredRecord({ taskId: "x", runIndex: 1, score: 1 }),
    ];
    const r = await report(records, [1, 2]);
    const task = r.tasks[0];
    assert.strictEqual(task.meanScore, 0.75);
    assert.ok(Math.abs(task.scoreAtK[1] - 0.75) < 1e-12);
    assert.ok(Math.abs(task.scoreAtK[2] - 1) < 1e-12);
  });

  test("score-less records in a scored group enter as degenerate 0 and 1", async () => {
    const records = [
      scoredRecord({ taskId: "x", runIndex: 0, score: 0.5 }),
      preflightRecord({ taskId: "x", runIndex: 1 }), // fail → 0
      baseRecord({ taskId: "x", runIndex: 2 }), // binary pass → 1
    ];
    const r = await report(records, [1]);
    const task = r.tasks[0];
    assert.strictEqual(task.meanScore, (0.5 + 0 + 1) / 3);
  });

  test("an all-binary group gains neither meanScore nor scoreAtK", async () => {
    const records = [
      baseRecord({ taskId: "x", runIndex: 0 }),
      baseRecord({ taskId: "x", runIndex: 1, verdict: "fail" }),
    ];
    const r = await report(records, [1]);
    assert.ok(!("meanScore" in r.tasks[0]));
    assert.ok(!("scoreAtK" in r.tasks[0]));
  });

  test("k > n yields the structured error value", async () => {
    const records = [scoredRecord({ taskId: "x", runIndex: 0, score: 0.5 })];
    const r = await report(records, [3]);
    assert.deepStrictEqual(r.tasks[0].scoreAtK[3], { error: "k > n" });
  });
});

describe("score rendering", () => {
  test("mixed ledger renders score columns with — on the binary row", async () => {
    const records = [
      scoredRecord({ taskId: "scored", runIndex: 0, score: 0.5 }),
      baseRecord({ taskId: "binary", runIndex: 0 }),
    ];
    const r = await report(records, [1], { includeRuns: true });
    const text = renderTextReport(r, [1]);
    assert.match(text, /\| taskId \| n \| c \| pass@1 \| score \| score@1 \|/);
    assert.match(
      text,
      /\| scored \| 1 \| 0 \| 0\.0000 \| 0\.5000 \| 0\.5000 \|/,
    );
    assert.match(text, /\| binary \| 1 \| 1 \| 1\.0000 \| — \| — \|/);
    // Runs table gains a Score column; the binary run renders —.
    assert.match(text, /\| Run \| Verdict \| Checks \| Judge \| Score \|/);
  });

  test("a binary-only ledger renders no score columns and carries no score keys", async () => {
    const records = [baseRecord({ taskId: "x", runIndex: 0 })];
    const r = await report(records, [1], { includeRuns: true });
    const text = renderTextReport(r, [1]);
    assert.doesNotMatch(text, /score@1/);
    assert.doesNotMatch(text, /\| Score \|/);
    assert.ok(!("meanScore" in r.tasks[0]));
  });

  test("the checks table merges both producers with a Source column", async () => {
    const records = [
      scoredRecord({
        taskId: "x",
        runIndex: 0,
        score: 0.5,
        invariants: {
          details: [
            { test: "scaffold", pass: true, gate: true, source: "invariants" },
          ],
          exitCode: 0,
        },
        hiddenTests: {
          details: [{ test: "filter", pass: false, source: "tests" }],
        },
      }),
    ];
    const r = await report(records, [1], { includeRuns: true });
    const text = renderTextReport(r, [1]);
    const checks = text.split("#### Checks")[1].split("####")[0];
    assert.match(checks, /\| Check \| Source \| Result \| Message \|/);
    assert.match(checks, /\| scaffold \| invariants \| ✅ \|/);
    assert.match(checks, /\| filter \| tests \| ❌ \|/);
  });

  test("a positive grade.malformed renders a warning bullet", async () => {
    const records = [
      scoredRecord({
        taskId: "x",
        runIndex: 0,
        score: 0,
        grade: { verdict: "fail", gatesPass: true, score: 0, malformed: 2 },
      }),
    ];
    const r = await report(records, [1], { includeRuns: true });
    const text = renderTextReport(r, [1]);
    assert.match(
      text,
      /\*\*Run 0:\*\* ⚠️ 2 malformed check row\(s\) — counted as failing/,
    );
  });

  test("a pre-break record (no grade) fails validation into totals.skipped", async () => {
    const preBreak = baseRecord({ taskId: "x", runIndex: 0 });
    delete preBreak.grade;
    preBreak.invariants = { verdict: "pass", details: [], exitCode: 0 };
    const good = scoredRecord({ taskId: "x", runIndex: 1, score: 1 });
    const r = await report([preBreak, good], [1]);
    assert.strictEqual(r.totals.skipped, 1);
    assert.strictEqual(r.tasks[0].n, 1);
  });

  test("the compact report shares the score columns", async () => {
    const records = [scoredRecord({ taskId: "x", runIndex: 0, score: 0.25 })];
    const r = await report(records, [1]);
    const text = renderTextReport(r, [1]);
    assert.doesNotMatch(text, /## Task Details/);
    assert.match(text, /\| taskId \| n \| c \| pass@1 \| score \| score@1 \|/);
    assert.match(text, /\| x \| 1 \| 0 \| 0\.0000 \| 0\.2500 \| 0\.2500 \|/);
  });
});
