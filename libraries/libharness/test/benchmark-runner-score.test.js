/**
 * Grading composition coverage for `BenchmarkRunner.#executeCell`: merged
 * check rows + grader health → grade → judge gate → record. All collectors
 * and the judge are injected seams; the fixture family supplies a real task
 * whose `tests/` overlay (added to a temp copy) makes `hiddenTests` present
 * on the record.
 */

import { before, describe, test } from "node:test";
import assert from "node:assert";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";
import { writeRawTrace } from "./benchmark-trace-helpers.js";

const RT = createDefaultRuntime();
const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const mockInstallApm = (family, outputDir) =>
  createApmInstaller({ runtime: realRuntimeWithSubprocess() }).install(
    family,
    outputDir,
  );

async function passingAgent(_task, workdir) {
  await writeRawTrace(RT, workdir);
  return {};
}

const gateRow = (pass) => ({ test: "present", pass, gate: true });
const scoredRow = (name, pass) => ({ test: name, pass });

let familyDir;
before(async () => {
  familyDir = await mkdtemp(join(tmpdir(), "benchmark-score-family-"));
  await cp(FIXTURE, familyDir, { recursive: true });
  // Give the `pass` task a suite so `task.tests` is truthy and the record
  // carries `hiddenTests` (the engine itself is replaced by a seam).
  const tests = join(familyDir, "tasks/pass/tests");
  await mkdir(tests, { recursive: true });
  await writeFile(join(tests, "dummy.test.js"), "// replaced by seam\n");
});

/**
 * Run one `pass` cell with injected collectors and judge; returns the record
 * and the grade result the judge saw.
 */
async function runCell({
  invariants = { details: [], exitCode: 0 },
  hidden = async () => ({ details: [] }),
  judgeVerdict = "pass",
}) {
  const out = await mkdtemp(join(tmpdir(), "benchmark-score-"));
  let judgeSaw = null;
  const runner = new BenchmarkRunner({
    family: familyDir,
    runs: 1,
    task: "pass",
    output: out,
    agentModel: "claude-sonnet-4-6",
    supervisorModel: "claude-fable-5",
    judgeModel: "claude-fable-5",
    profiles: { agent: null, judge: "judge" },
    query: async function* () {},
    runtime: RT,
    runAgent: passingAgent,
    runInvariants: async () => invariants,
    runHiddenTests: hidden,
    runJudge: async (_task, workdir, gradeResult) => {
      judgeSaw = gradeResult;
      await writeFile(workdir.judgeTracePath, "");
      return { verdict: judgeVerdict, summary: "s" };
    },
    installApm: mockInstallApm,
    installNpm: async () => {},
    termGraceMs: 100,
  });
  const records = [];
  for await (const r of runner.run()) records.push(r);
  const record = records[0];
  assert.ok(!("schemaError" in record), record.schemaError);
  assert.doesNotThrow(() => validateResultRecord(record));
  return { record, judgeSaw };
}

describe("BenchmarkRunner grading composition", () => {
  test("healthy, gates pass, scored 2/3, judge pass → verdict fail, fractional score", async () => {
    const { record } = await runCell({
      invariants: { details: [gateRow(true)], exitCode: 0 },
      hidden: async () => ({
        details: [
          scoredRow("a", true),
          scoredRow("b", true),
          scoredRow("c", false),
        ],
      }),
    });
    assert.strictEqual(record.verdict, "fail");
    assert.ok(Math.abs(record.score - 2 / 3) < 1e-12);
    assert.strictEqual(record.grade.verdict, "fail");
    assert.strictEqual(record.grade.gatesPass, true);
  });

  test("healthy, gates pass, full marks, judge pass → verdict pass, score 1", async () => {
    const { record } = await runCell({
      invariants: { details: [gateRow(true)], exitCode: 0 },
      hidden: async () => ({
        details: [scoredRow("a", true), scoredRow("b", true)],
      }),
    });
    assert.strictEqual(record.verdict, "pass");
    assert.strictEqual(record.score, 1);
  });

  test("invariants exit 1 with all rows passing → verdict fail, score 0", async () => {
    const { record } = await runCell({
      invariants: {
        details: [scoredRow("a", true)],
        exitCode: 1,
        stderr: "boom",
      },
      hidden: async () => ({ details: [scoredRow("b", true)] }),
    });
    assert.strictEqual(record.verdict, "fail");
    assert.strictEqual(record.score, 0);
    assert.strictEqual(record.grade.verdict, "fail");
  });

  test("engine throw with all rows passing → verdict fail, score 0, error on hiddenTests", async () => {
    const { record } = await runCell({
      invariants: { details: [scoredRow("a", true)], exitCode: 0 },
      hidden: async () => {
        throw new Error("engine exploded");
      },
    });
    assert.strictEqual(record.verdict, "fail");
    assert.strictEqual(record.score, 0);
    assert.deepStrictEqual(record.hiddenTests, {
      details: [],
      error: "engine exploded",
    });
  });

  test("failing gate row with passing scored rows → verdict fail, score 0", async () => {
    const { record } = await runCell({
      invariants: { details: [gateRow(false)], exitCode: 0 },
      hidden: async () => ({
        details: [scoredRow("a", true), scoredRow("b", true)],
      }),
    });
    assert.strictEqual(record.verdict, "fail");
    assert.strictEqual(record.score, 0);
    assert.strictEqual(record.grade.gatesPass, false);
  });

  test("full marks with a failing judge → verdict fail, score 0", async () => {
    const { record } = await runCell({
      invariants: { details: [gateRow(true)], exitCode: 0 },
      hidden: async () => ({ details: [scoredRow("a", true)] }),
      judgeVerdict: "fail",
    });
    assert.strictEqual(record.verdict, "fail");
    assert.strictEqual(record.score, 0);
    assert.strictEqual(record.grade.verdict, "pass");
  });

  test("gate rows only → binary record: no score key, lean grade", async () => {
    const { record } = await runCell({
      invariants: { details: [gateRow(true)], exitCode: 0 },
    });
    assert.strictEqual(record.verdict, "pass");
    assert.ok(!("score" in record));
    assert.deepStrictEqual(record.grade, {
      verdict: "pass",
      gatesPass: true,
    });
  });

  test("one malformed row → verdict fail, grade.malformed 1", async () => {
    const { record } = await runCell({
      invariants: {
        details: [scoredRow("ok", true), { raw: "not json", parseError: true }],
        exitCode: 0,
      },
    });
    assert.strictEqual(record.verdict, "fail");
    assert.strictEqual(record.grade.malformed, 1);
    assert.strictEqual(record.score, 0.5);
  });

  test("rows from both producers reach the judge merged and source-stamped", async () => {
    const { judgeSaw } = await runCell({
      invariants: { details: [gateRow(true)], exitCode: 0 },
      hidden: async () => ({ details: [scoredRow("a", true)] }),
    });
    assert.deepStrictEqual(judgeSaw.rows, [
      { test: "present", pass: true, gate: true, source: "invariants" },
      { test: "a", pass: true, source: "tests" },
    ]);
    assert.strictEqual(judgeSaw.verdict, "pass");
    assert.strictEqual(judgeSaw.gatesPass, true);
    assert.strictEqual(judgeSaw.score, 1);
  });
});
