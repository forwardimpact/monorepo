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
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { aggregate } from "../src/benchmark/report.js";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import {
  createTraceQuery,
  createTraceCollector,
} from "@forwardimpact/libharness";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

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
 * Mock query for the agent-under-test session. Writes a minimal NDJSON
 * trace to `workdir.agentTracePath` and seeds task-specific side effects
 * the invariants script depends on.
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
  const messages = [
    { type: "system", subtype: "init", session_id: "mock", model: "m" },
    {
      type: "assistant",
      message: { content: [{ type: "text", text: submission }] },
    },
    {
      type: "result",
      subtype: "success",
      result: submission,
      total_cost_usd: 0.0123,
      num_turns: 1,
    },
  ];
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  await writeFile(workdir.agentTracePath, lines);
  await writeFile(workdir.supervisorTracePath, "");
  return {
    costUsd: 0.0123,
    turns: 1,
    submission,
  };
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
  // Shared setup does a full runner.run() with 4 tasks; on slower CI hardware
  // the default 5s test timeout is tight, so explicitly budget headroom.
  before(
    async () => {
      const { runner } = await setupRunner({ runs: 1 });
      sharedRecords = await collectRecords(runner);
    },
    { timeout: 30_000 },
  );

  test("produces one record per (task, runIndex), including pre-flight failures", {
    timeout: 30_000,
  }, async () => {
    const { runner, out } = await setupRunner({ runs: 2 });
    const records = await collectRecords(runner);
    // 4 tasks × 2 runs = 8 records (preflight-broken records included).
    assert.strictEqual(records.length, 8);
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
    assert.strictEqual(lines.length, 8);
    for (const line of lines) {
      assert.doesNotThrow(() => validateResultRecord(JSON.parse(line)));
    }
  });

  test("pass: running-service grading via HTTP probe yields verdict='pass'", () => {
    const passRec = sharedRecords.find((r) => r.taskId === "pass");
    assert.ok(passRec, "pass record missing");
    assert.strictEqual(passRec.invariants.verdict, "pass");
    assert.strictEqual(passRec.invariants.exitCode, 0);
    assert.strictEqual(passRec.verdict, "pass");
    assert.strictEqual(passRec.invariants.details[0].test, "probe");
  });

  test("repo-state: repository-state grading via SHA-256 yields verdict='pass'", () => {
    const rs = sharedRecords.find((r) => r.taskId === "repo-state");
    assert.ok(rs);
    assert.strictEqual(rs.invariants.verdict, "pass");
    assert.strictEqual(rs.verdict, "pass");
  });

  test("invariants sentinel filename never appears in the agent trace", async () => {
    for (const r of sharedRecords) {
      if (!r.agentTracePath) continue;
      const body = await readFile(r.agentTracePath, "utf8").catch(() => "");
      assert.ok(
        !body.includes(INVARIANTS_SENTINEL),
        `agent trace for ${r.taskId} must not contain the invariants sentinel`,
      );
    }
  });

  test("judge prompt has {{INVARIANTS_RESULT}} substituted (verdict tracks invariants)", () => {
    for (const r of sharedRecords) {
      if (r.preflightError) continue;
      assert.strictEqual(
        r.invariants.verdict === "pass" ? "pass" : "fail",
        r.judgeVerdict.verdict,
        `${r.taskId}: judge verdict should track invariants`,
      );
    }
  });

  test("traces are consumable by fit-trace overview", async () => {
    for (const r of sharedRecords) {
      if (!r.agentTracePath) continue;
      const ndjson = await readFile(r.agentTracePath, "utf8").catch(() => "");
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
        // Write a minimal trace so cost/turns are 0 and submission empty.
        await writeFile(workdir.agentTracePath, "");
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
