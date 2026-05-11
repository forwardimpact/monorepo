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

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { aggregate } from "../src/benchmark/report.js";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import { createTraceQuery, createTraceCollector } from "@forwardimpact/libeval";

const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const SCORING_SENTINEL = "SCORING_SENTINEL_DO_NOT_LEAK_2870c4";

/**
 * Mock query for the agent-under-test session. Writes a minimal NDJSON
 * trace to `workdir.agentTracePath` and seeds task-specific side effects
 * the scoring script depends on.
 */
async function mockRunAgent(task, workdir) {
  // Seed task-specific side effects.
  if (task.id === "tf/repo-state") {
    await writeFile(join(workdir.cwd, "result.txt"), "hello\n");
  }
  // Stub agent that "tries to enumerate" — its assistant text mentions
  // every filename it explored. The sentinel filename must NOT appear
  // because scoring/ is never copied to cwd.
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
  return {
    costUsd: 0.0123,
    turns: 1,
    submission,
  };
}

/**
 * Mock judge: writes a supervisor-source Conclude tool_use to
 * `workdir.judgeTracePath` matching the scoring verdict.
 */
async function mockRunJudge(_task, workdir, scoring) {
  const verdict = scoring.verdict === "pass" ? "success" : "failure";
  const summary =
    scoring.verdict === "pass" ? "matches scoring; approved" : "scoring failed";
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

async function setupRunner({ runs = 2, runAgent = mockRunAgent } = {}) {
  const out = await mkdtemp(join(tmpdir(), "benchmark-e2e-"));
  const noopQuery = async function* () {};
  const runner = new BenchmarkRunner({
    family: FIXTURE,
    runs,
    output: out,
    model: "claude-opus-4-7",
    profiles: { agent: null, judge: "judge" },
    query: noopQuery,
    runAgent,
    runJudge: mockRunJudge,
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
  test("produces one record per (task, runIndex), including pre-flight failures", async () => {
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
    const broken = records.filter((r) => r.taskId === "tf/preflight-broken");
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

  test("tf/pass: running-service grading via HTTP probe yields verdict='pass'", async () => {
    const { runner } = await setupRunner({ runs: 1 });
    const records = await collectRecords(runner);
    const passRec = records.find((r) => r.taskId === "tf/pass");
    assert.ok(passRec, "tf/pass record missing");
    assert.strictEqual(passRec.scoring.verdict, "pass");
    assert.strictEqual(passRec.scoring.exitCode, 0);
    assert.strictEqual(passRec.verdict, "pass");
    assert.strictEqual(passRec.scoring.details[0].test, "probe");
  });

  test("tf/repo-state: repository-state grading via SHA-256 yields verdict='pass'", async () => {
    const { runner } = await setupRunner({ runs: 1 });
    const records = await collectRecords(runner);
    const rs = records.find((r) => r.taskId === "tf/repo-state");
    assert.ok(rs);
    assert.strictEqual(rs.scoring.verdict, "pass");
    assert.strictEqual(rs.verdict, "pass");
  });

  test("scoring sentinel filename never appears in the agent trace", async () => {
    const { runner } = await setupRunner({ runs: 1 });
    const records = await collectRecords(runner);
    for (const r of records) {
      if (!r.agentTracePath) continue;
      const body = await readFile(r.agentTracePath, "utf8").catch(() => "");
      assert.ok(
        !body.includes(SCORING_SENTINEL),
        `agent trace for ${r.taskId} must not contain the scoring sentinel`,
      );
    }
  });

  test("judge prompt has {{SCORING}} substituted (verdict tracks scoring)", async () => {
    const { runner } = await setupRunner({ runs: 1 });
    const records = await collectRecords(runner);
    for (const r of records) {
      if (r.preflightError) continue;
      assert.strictEqual(
        r.scoring.verdict === "pass" ? "pass" : "fail",
        r.judgeVerdict.verdict,
        `${r.taskId}: judge verdict should track scoring`,
      );
    }
  });

  test("traces are consumable by fit-trace overview", async () => {
    const { runner } = await setupRunner({ runs: 1 });
    const records = await collectRecords(runner);
    for (const r of records) {
      if (!r.agentTracePath) continue;
      const ndjson = await readFile(r.agentTracePath, "utf8").catch(() => "");
      if (!ndjson) continue;
      const collector = createTraceCollector();
      for (const line of ndjson.split("\n")) collector.addLine(line);
      const tq = createTraceQuery(collector.toJSON());
      const overview = tq.overview();
      assert.ok(overview);
      assert.strictEqual(typeof overview.turnCount, "number");
      assert.strictEqual(overview.turnCount, tq.count());
    }
  });

  test("report aggregator computes pass@k over the JSONL file", async () => {
    const { runner, out } = await setupRunner({ runs: 2 });
    await collectRecords(runner);
    const report = await aggregate({ inputDir: out, kValues: [1] });
    assert.ok(report.tasks.length >= 3);
    const pass = report.tasks.find((t) => t.taskId === "tf/pass");
    assert.ok(pass);
    assert.strictEqual(pass.passAtK[1], 1);
    const fail = report.tasks.find((t) => t.taskId === "tf/fail");
    assert.strictEqual(fail.passAtK[1], 0);
  });

  test("agent-execution failure still produces a record (spec criterion 1)", async () => {
    // Force the agent session to throw for tf/pass; the runner must still
    // produce a record, validate it, and proceed to scoring/judge against
    // the partial workdir. Plan Step 13 row 1 explicitly required this
    // coverage at the integration layer.
    const failingAgent = async (task, workdir) => {
      if (task.id === "tf/pass") {
        // Write a minimal trace so cost/turns are 0 and submission empty.
        await writeFile(workdir.agentTracePath, "");
        throw new Error("simulated SDK iteration error");
      }
      return mockRunAgent(task, workdir);
    };
    const { runner } = await setupRunner({ runs: 1, runAgent: failingAgent });
    const records = await collectRecords(runner);
    // Every task produces exactly one record per run, including tf/pass.
    const passRec = records.find((r) => r.taskId === "tf/pass");
    assert.ok(passRec, "tf/pass record missing on agent failure");
    assert.doesNotThrow(() => validateResultRecord(passRec));
    assert.ok(passRec.agentError, "agentError signal missing");
    assert.match(passRec.agentError.message, /simulated SDK iteration error/);
    assert.strictEqual(passRec.agentError.aborted, false);
    assert.strictEqual(passRec.costUsd, 0);
    assert.strictEqual(passRec.submission, "");
  });
});
