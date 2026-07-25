/**
 * End-to-end test for `BenchmarkRunner` against the fixture family.
 *
 * The agent-under-test and judge are both injected as test seams on the
 * runner so the SDK is never invoked. Each seam writes a realistic NDJSON
 * trace to the path the runner allocates, and returns the same shape the
 * real implementations return. This is the moral equivalent of the
 * `createMockAgentQuery` / Supervisor-with-mock-runners pattern from
 * `supervisor-run.test.js`.
 */

import { describe, test, before } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { aggregate } from "../src/benchmark/report.js";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import { runCostCommand } from "../src/commands/trace.js";
import {
  createTraceQuery,
  createTraceCollector,
} from "@forwardimpact/libharness";
import { realRuntimeWithSubprocess } from "./real-runtime.js";
import { writeRawTrace } from "./benchmark-trace-helpers.js";

// The runner spawns the fixture's real preflight scripts, so it gets the
// production runtime; the injected apm installer keeps a fake subprocess.
const RT = createDefaultRuntime();

const mockInstallApm = (family, outputDir) =>
  createApmInstaller({ runtime: realRuntimeWithSubprocess() }).install(
    family,
    outputDir,
  );

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const INVARIANTS_SENTINEL = "INVARIANTS_SENTINEL_DO_NOT_LEAK_2870c4";

/**
 * Mock agent session under the seam contract: streams `{source, seq, event}`
 * envelopes to `workdir.rawTracePath` and returns `{agentError?}` — the
 * runner's real split/summary pipeline derives cost, turns, and submission
 * from the raw file. Seeds task-specific side effects the invariants script
 * depends on.
 */
async function mockRunAgent(task, workdir) {
  // Seed task-specific side effects.
  if (task.id === "repo-state") {
    await writeFile(join(workdir.cwd, "result.txt"), "hello\n");
  }
  // Stub agent that "tries to enumerate" — its assistant text mentions
  // every filename it explored. The sentinel filename must NOT appear
  // because hooks/ is never copied to cwd.
  const submission = `I built it. Listed cwd: README.md, app.js, specs/, .claude/, sentinel-pass-file.`;
  const envelopes = [
    {
      source: "agent",
      seq: 0,
      event: {
        type: "system",
        subtype: "init",
        session_id: "mock",
        model: "m",
      },
    },
    {
      source: "agent",
      seq: 1,
      event: {
        type: "assistant",
        message: { content: [{ type: "text", text: submission }] },
      },
    },
    {
      source: "agent",
      seq: 2,
      event: {
        type: "result",
        subtype: "success",
        result: submission,
        total_cost_usd: 0.0123,
        num_turns: 1,
      },
    },
    {
      source: "supervisor",
      seq: 3,
      event: {
        type: "assistant",
        message: { content: [{ type: "text", text: "looks complete" }] },
      },
    },
    { source: "orchestrator", seq: 4, event: { type: "summary", turns: 1 } },
  ];
  await writeRawTrace(RT, workdir, envelopes);
  return {};
}

/**
 * Mock judge: writes a supervisor-source Conclude tool_use to
 * `workdir.judgeTracePath` matching the graded verdict.
 */
async function mockRunJudge(_task, workdir, grade) {
  const verdict = grade.verdict === "pass" ? "success" : "failure";
  const summary =
    grade.verdict === "pass"
      ? "matches the graded checks; approved"
      : "graded checks failed";
  const envelopes = [
    {
      source: "supervisor",
      seq: 0,
      event: {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "conclude-1",
              name: "Conclude",
              input: { verdict, summary },
            },
          ],
        },
      },
    },
    {
      source: "orchestrator",
      seq: 1,
      event: {
        type: "summary",
        success: verdict === "success",
        verdict,
        turns: 0,
        summary,
      },
    },
  ];
  const body = envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(workdir.judgeTracePath, body);
  return {
    verdict: verdict === "success" ? "pass" : "fail",
    summary,
  };
}

async function setupRunner({ runs = 2, runAgent = mockRunAgent, task } = {}) {
  const out = await mkdtemp(join(tmpdir(), "benchmark-e2e-"));
  const noopQuery = async function* () {};
  const runner = new BenchmarkRunner({
    family: FIXTURE,
    runs,
    output: out,
    agentModel: "claude-sonnet-4-6",
    supervisorModel: "claude-fable-5",
    judgeModel: "claude-fable-5",
    profiles: { agent: null, judge: "judge" },
    query: noopQuery,
    runtime: RT,
    runAgent,
    runJudge: mockRunJudge,
    installApm: mockInstallApm,
    installNpm: async () => {},
    task,
    termGraceMs: 100,
  });
  return { runner, out };
}

async function collectRecords(runner) {
  const records = [];
  for await (const r of runner.run()) records.push(r);
  return records;
}

describe("BenchmarkRunner E2E (fixture family)", () => {
  // Tests 1, 2, 4, 5, 6 share the runs:1 / mockRunAgent configuration and
  // only differ in what they assert against the resulting records — set up
  // once instead of paying the runner.run() cost five times.
  let sharedRecords;
  // Record trace paths are run-output-relative, so the shared output dir
  // stays in scope for every path-consuming assertion below.
  let sharedOut;
  // Shared setup does a full runner.run() with 4 tasks; on slower CI hardware
  // the default 5s test timeout is tight, so explicitly budget headroom.
  before(
    async () => {
      const { runner, out } = await setupRunner({ runs: 1 });
      sharedOut = out;
      sharedRecords = await collectRecords(runner);
    },
    { timeout: 30_000 },
  );

  test("produces one record per (task, runIndex), including pre-flight failures", {
    timeout: 30_000,
  }, async () => {
    const { runner, out } = await setupRunner({ runs: 2 });
    const records = await collectRecords(runner);
    // 5 tasks × 2 runs = 10 records (preflight-broken records included).
    assert.strictEqual(records.length, 10);
    const keys = records.map((r) => `${r.taskId}#${r.runIndex}`);
    assert.strictEqual(new Set(keys).size, keys.length);

    // Every record must validate against the runtime schema (spec criterion 11).
    for (const r of records) {
      assert.doesNotThrow(() => validateResultRecord(r));
    }

    // pre-flight-broken records carry preflightError and costUsd === 0 (criterion 8).
    const broken = records.filter((r) => r.taskId === "preflight-broken");
    assert.strictEqual(broken.length, 2);
    for (const r of broken) {
      assert.ok(r.preflightError, `expected preflightError on ${r.taskId}`);
      assert.strictEqual(r.costUsd, 0);
    }

    // Read results.jsonl — every line must validate.
    const jsonl = await readFile(join(out, "results.jsonl"), "utf8");
    const lines = jsonl.split("\n").filter(Boolean);
    assert.strictEqual(lines.length, 10);
    for (const line of lines) {
      assert.doesNotThrow(() => validateResultRecord(JSON.parse(line)));
    }
  });

  test("pass: running-service grading via HTTP probe yields verdict='pass'", () => {
    const passRec = sharedRecords.find((r) => r.taskId === "pass");
    assert.ok(passRec, "pass record missing");
    assert.strictEqual(passRec.grade.verdict, "pass");
    assert.strictEqual(passRec.grade.gatesPass, true);
    assert.strictEqual(passRec.invariants.exitCode, 0);
    assert.strictEqual(passRec.verdict, "pass");
    assert.strictEqual(passRec.invariants.details[0].test, "probe");
    // Gate rows only — a binary task carries no score.
    assert.ok(!("score" in passRec));
  });

  test("repo-state: repository-state grading via SHA-256 yields verdict='pass'", () => {
    const rs = sharedRecords.find((r) => r.taskId === "repo-state");
    assert.ok(rs);
    assert.strictEqual(rs.grade.verdict, "pass");
    assert.strictEqual(rs.verdict, "pass");
  });

  test("scored: the hidden suite yields a fractional grade against a real subprocess", () => {
    const rec = sharedRecords.find((r) => r.taskId === "scored");
    assert.ok(rec, "scored record missing");
    // One of the two hidden checks fails: grade carries the fraction …
    assert.strictEqual(rec.grade.verdict, "fail");
    assert.strictEqual(rec.grade.score, 0.5);
    assert.strictEqual(rec.verdict, "fail");
    // … and the judge gate (tracking the graded verdict) zeroes the
    // effective score.
    assert.strictEqual(rec.score, 0);
    const rows = rec.hiddenTests.details;
    assert.deepStrictEqual(
      rows.map((d) => ({ test: d.test, pass: d.pass })),
      [
        { test: "always-fail", pass: false },
        { test: "always-pass", pass: true },
      ],
    );
    // Restoration held against the real subprocess: no staged check file
    // survives in the run's agent CWD (the judge saw the agent's work).
    const cwd = join(sharedOut, dirname(rec.agentTracePath), "cwd");
    for (const staged of ["always-pass.test.js", "always-fail.test.js"]) {
      assert.ok(
        !existsSync(join(cwd, staged)),
        `${staged} should have been unstaged from ${cwd}`,
      );
    }
  });

  test("invariants sentinel filename never appears in the agent trace", async () => {
    for (const r of sharedRecords) {
      if (!r.agentTracePath) continue;
      const body = await readFile(
        join(sharedOut, r.agentTracePath),
        "utf8",
      ).catch(() => "");
      assert.ok(
        !body.includes(INVARIANTS_SENTINEL),
        `agent trace for ${r.taskId} must not contain the invariants sentinel`,
      );
    }
  });

  test("per-cell tree keeps the raw trace and non-empty lanes — no deletion (spec criterion 1)", async () => {
    for (const r of sharedRecords) {
      if (r.preflightError) continue;
      // Convention-named files under runs/<taskId>/<idx>/.
      const prefix = join("runs", r.taskId, String(r.runIndex));
      assert.strictEqual(
        r.rawTracePath,
        join(prefix, `trace--${r.taskId}-r${r.runIndex}.raw.ndjson`),
      );
      assert.strictEqual(
        r.agentTracePath,
        join(prefix, `trace--${r.taskId}-r${r.runIndex}--agent.agent.ndjson`),
      );
      // Raw preserved and non-empty; both lanes split and non-empty.
      const raw = await readFile(join(sharedOut, r.rawTracePath), "utf8");
      assert.ok(raw.length > 0, `${r.taskId}: raw trace must be preserved`);
      for (const lane of [r.agentTracePath, r.supervisorTracePath]) {
        const body = await readFile(join(sharedOut, lane), "utf8");
        assert.ok(body.length > 0, `${r.taskId}: ${lane} must be non-empty`);
      }
    }
  });

  test("gemba-trace cost over the preserved raw file reproduces the record's agent+supervisor breakdown (spec criterion 3)", async () => {
    const rec = sharedRecords.find((r) => r.taskId === "pass");
    assert.ok(rec, "pass record missing");
    let outText = "";
    const captured = {
      fsSync: { existsSync, readFileSync },
      proc: { stdout: { write: (s) => (outText += s) } },
    };
    await runCostCommand({
      options: {},
      args: { file: join(sharedOut, rec.rawTracePath) },
      deps: { runtime: captured },
    });
    const cost = JSON.parse(outText);
    assert.strictEqual(cost.bySource.agent ?? 0, rec.costBreakdown.agent);
    assert.strictEqual(
      cost.bySource.supervisor ?? 0,
      rec.costBreakdown.supervisor,
    );
    // The CLI total over the raw file is agent+supervisor; the record's
    // costUsd additionally folds in judge cost, so it is not compared here.
    assert.strictEqual(
      cost.totalCostUsd,
      (cost.bySource.agent ?? 0) + (cost.bySource.supervisor ?? 0),
    );
  });

  test("record trace paths are run-output-relative and every referenced file exists (spec criterion 8)", () => {
    for (const r of sharedRecords) {
      const paths = [
        r.rawTracePath,
        r.agentTracePath,
        r.supervisorTracePath,
        r.judgeTracePath,
      ].filter(Boolean);
      if (r.preflightError) {
        assert.strictEqual(
          paths.length,
          0,
          `${r.taskId}: preflight records carry no trace paths`,
        );
        continue;
      }
      for (const p of paths) {
        assert.ok(!isAbsolute(p), `${r.taskId}: ${p} must be relative`);
        assert.ok(
          existsSync(join(sharedOut, p)),
          `${r.taskId}: ${p} must exist under the output dir`,
        );
      }
    }
  });

  test("judge prompt has {{GRADE_RESULT}} substituted (verdict tracks the grade)", () => {
    for (const r of sharedRecords) {
      if (r.preflightError) continue;
      assert.strictEqual(
        r.grade.verdict,
        r.judgeVerdict.verdict,
        `${r.taskId}: judge verdict should track the grade`,
      );
    }
  });

  test("traces are consumable by gemba-trace overview", async () => {
    for (const r of sharedRecords) {
      if (!r.agentTracePath) continue;
      const ndjson = await readFile(
        join(sharedOut, r.agentTracePath),
        "utf8",
      ).catch(() => "");
      if (!ndjson) continue;
      const collector = createTraceCollector({ now: () => "T" });
      for (const line of ndjson.split("\n")) collector.addLine(line);
      const tq = createTraceQuery(collector.toJSON());
      const overview = tq.overview();
      assert.ok(overview);
      assert.strictEqual(typeof overview.turnCount, "number");
      assert.strictEqual(overview.turnCount, tq.count());
    }
  });

  test("report aggregator computes pass@k over the JSONL file", {
    timeout: 30_000,
  }, async () => {
    const { runner, out } = await setupRunner({ runs: 2 });
    await collectRecords(runner);
    const report = await aggregate({
      inputDir: out,
      kValues: [1],
      runtime: RT,
    });
    assert.ok(report.tasks.length >= 3);
    const pass = report.tasks.find((t) => t.taskId === "pass");
    assert.ok(pass);
    assert.strictEqual(pass.passAtK[1], 1);
    const fail = report.tasks.find((t) => t.taskId === "fail");
    assert.strictEqual(fail.passAtK[1], 0);
  });

  test("agent-execution failure still produces a record (spec criterion 1)", async () => {
    // Force the agent session to throw for tf/pass; the runner must still
    // produce a record, validate it, and proceed to invariants/judge against
    // the partial workdir. Plan Step 13 row 1 explicitly required this
    // coverage at the integration layer.
    const failingAgent = async (task, workdir) => {
      if (task.id === "pass") {
        // The raw trace stays the materialized empty stub, so the shared
        // pipeline yields zeroed cost/turns and an empty submission.
        throw new Error("simulated SDK iteration error");
      }
      return mockRunAgent(task, workdir);
    };
    const { runner } = await setupRunner({ runs: 1, runAgent: failingAgent });
    const records = await collectRecords(runner);
    // Every task produces exactly one record per run, including tf/pass.
    const passRec = records.find((r) => r.taskId === "pass");
    assert.ok(passRec, "pass record missing on agent failure");
    assert.doesNotThrow(() => validateResultRecord(passRec));
    assert.ok(passRec.agentError, "agentError signal missing");
    assert.match(passRec.agentError.message, /simulated SDK iteration error/);
    assert.strictEqual(passRec.agentError.aborted, false);
    assert.strictEqual(passRec.costUsd, 0);
    assert.strictEqual(passRec.submission, "");
  });

  test("--task runs only the named task", { timeout: 30_000 }, async () => {
    const { runner } = await setupRunner({ runs: 2, task: "pass" });
    const records = await collectRecords(runner);
    // 1 task × 2 runs, and only the filtered task appears.
    assert.strictEqual(records.length, 2);
    assert.ok(
      records.every((r) => r.taskId === "pass"),
      "task filter leaked other tasks",
    );
  });

  test("--task with an unknown id throws, listing available tasks", async () => {
    const { runner } = await setupRunner({ runs: 1, task: "nope" });
    await assert.rejects(
      () => collectRecords(runner),
      /no task 'nope' in family; available:.*\bpass\b/,
    );
  });
});
