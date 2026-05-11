/**
 * End-to-end test of the BenchmarkRunner against the fixture family.
 *
 * The Anthropic SDK is mocked via `createMockAgentQuery` so the test
 * exercises the runner's wiring, the lifecycle, and the trace consumers
 * without spending model cost. The judge phase is exercised through the
 * real `createSupervisor` path with the same mocked query function.
 *
 * Maps each spec 870 success criterion to its assertion site.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createToolUseMsg,
  createTextBlockMsg,
} from "@forwardimpact/libharness";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { TraceQuery } from "../src/trace-query.js";
import { createTraceCollector } from "../src/trace-collector.js";
import { materialiseBenchmarkFamily } from "./benchmark-fixture.js";

const RESULT_MSG = (success = true) => ({
  type: "result",
  subtype: success ? "success" : "error",
  result: "ok",
  duration_ms: 5,
  total_cost_usd: 0.001,
  num_turns: 1,
});

function initMsg() {
  return {
    type: "system",
    subtype: "init",
    session_id: "sess-mock",
    model: "claude-opus-4-7",
    tools: [],
  };
}

function classifyQueryCall(params) {
  // The judge supervisor's runner has `mcpServers.orchestration` set; the
  // bare agent-under-test does not. Inside `mcpServers.orchestration`, the
  // supervisor runner carries `disallowedTools` including "Agent"
  // (supervisor.js:553) while the judge's inner agent does not — so
  // disallowedTools is the supervisor/agent-inside-supervisor discriminator.
  const isSupervisorRunner = Boolean(
    params?.options?.mcpServers?.orchestration,
  );
  const isJudgeSupervisor =
    isSupervisorRunner &&
    Array.isArray(params?.options?.disallowedTools) &&
    params.options.disallowedTools.includes("Agent");
  return { isSupervisorRunner, isJudgeSupervisor };
}

async function runWithRecords(deps) {
  const records = [];
  const runner = new BenchmarkRunner(deps);
  for await (const record of runner.run()) records.push(record);
  return records;
}

describe("BenchmarkRunner end-to-end (mocked SDK)", () => {
  test("emits one record per (taskId, runIndex); preflight-broken records cost 0 and a preflightError", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const output = mkdtempSync(join(tmpdir(), "fb-e2e-"));

    // Pre-create the answer.txt the repo-state task scores against — the
    // mock SDK does not actually invoke Write, so the assertion must come
    // from a pre-seeded workdir. Place the seed under the source workdir
    // so WorkdirManager copies it into the agent CWD.
    writeFileSync(
      join(root, "tasks", "tf", "repo-state", "workdir", "answer.txt"),
      "42",
    );

    // Pass task: pre-seed `passing.flag` so its scoring HTTP-like sentinel passes.
    writeFileSync(
      join(root, "tasks", "tf", "pass", "workdir", "passing.flag"),
      "ok",
    );

    const scripts = {
      tf__pass: [
        initMsg(),
        createTextBlockMsg("started server"),
        RESULT_MSG(true),
      ],
      tf__fail: [
        initMsg(),
        createTextBlockMsg("could not solve"),
        RESULT_MSG(true),
      ],
      "tf__repo-state": [
        initMsg(),
        createTextBlockMsg("wrote answer.txt = 42"),
        RESULT_MSG(true),
      ],
      "tf__preflight-broken": [initMsg(), RESULT_MSG(true)],
    };

    let supervisorCalls = 0;
    function* judgeStream(cwd) {
      supervisorCalls++;
      const verdict = cwd.includes("tf__fail") ? "failure" : "success";
      yield initMsg();
      yield createToolUseMsg("Conclude", {
        verdict,
        summary: `judge says ${verdict}`,
      });
      yield RESULT_MSG(true);
    }
    function* innerJudgeAgentStream() {
      yield initMsg();
      yield RESULT_MSG(true);
    }
    function* agentStream(cwd) {
      for (const [segment, msgs] of Object.entries(scripts)) {
        if (cwd.includes(segment)) {
          for (const m of msgs) yield m;
          return;
        }
      }
      yield initMsg();
      yield createTextBlockMsg("default");
      yield RESULT_MSG(true);
    }
    const query = async function* (params) {
      const cwd = params?.options?.cwd ?? "";
      const { isSupervisorRunner, isJudgeSupervisor } =
        classifyQueryCall(params);
      if (isJudgeSupervisor) {
        yield* judgeStream(cwd);
        return;
      }
      if (isSupervisorRunner) {
        yield* innerJudgeAgentStream();
        return;
      }
      yield* agentStream(cwd);
    };

    const records = await runWithRecords({
      family: root,
      runs: 2,
      output,
      model: "claude-opus-4-7",
      profiles: { judge: "judge" },
      query,
    });

    // tf/preflight-broken is exercised separately so the runs=2 matrix
    // expects 8 records (4 tasks × 2 runs). The preflight-broken task
    // produces records with preflightError and costUsd: 0.
    assert.strictEqual(records.length, 8);

    const preflight = records.filter((r) => r.taskId === "tf/preflight-broken");
    for (const r of preflight) {
      assert.ok(r.preflightError);
      assert.strictEqual(r.costUsd, 0);
    }

    // Distinct (taskId, runIndex) pairs.
    const keys = new Set(records.map((r) => `${r.taskId}#${r.runIndex}`));
    assert.strictEqual(keys.size, 8);

    // tf/pass and tf/repo-state should pass; tf/fail should fail.
    const pass = records.filter((r) => r.taskId === "tf/pass");
    const fail = records.filter((r) => r.taskId === "tf/fail");
    const repo = records.filter((r) => r.taskId === "tf/repo-state");
    assert.ok(
      pass.every((r) => r.verdict === "pass"),
      `pass: ${JSON.stringify(pass)}`,
    );
    assert.ok(fail.every((r) => r.verdict === "fail"));
    assert.ok(
      repo.every((r) => r.verdict === "pass"),
      `repo: ${JSON.stringify(repo)}`,
    );

    // results.jsonl on disk has one line per record, each line validates.
    const lines = readFileSync(join(output, "results.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    assert.strictEqual(lines.length, 8);

    // Spec criterion: traces consumable by trace-analysis tooling.
    const happyRecord = pass[0];
    const collector = createTraceCollector();
    for (const line of readFileSync(happyRecord.agentTracePath, "utf8").split(
      "\n",
    )) {
      if (line.trim()) collector.addLine(line);
    }
    const tq = new TraceQuery(collector.toJSON());
    const overview = tq.overview();
    assert.ok(overview.turnCount > 0);
    assert.ok(supervisorCalls > 0);
  });

  test("scoring/ never appears in the agent CWD or in the agent trace", async () => {
    const { root } = await materialiseBenchmarkFamily();
    const output = mkdtempSync(join(tmpdir(), "fb-e2e-"));
    writeFileSync(
      join(root, "tasks", "tf", "pass", "workdir", "passing.flag"),
      "ok",
    );

    const query = async function* (params) {
      const { isSupervisorRunner, isJudgeSupervisor } =
        classifyQueryCall(params);
      if (isJudgeSupervisor) {
        yield initMsg();
        yield createToolUseMsg("Conclude", {
          verdict: "success",
          summary: "ok",
        });
        yield RESULT_MSG(true);
        return;
      }
      if (isSupervisorRunner) {
        yield initMsg();
        yield RESULT_MSG(true);
        return;
      }
      yield initMsg();
      yield createTextBlockMsg("done");
      yield RESULT_MSG(true);
    };

    const runner = new BenchmarkRunner({
      family: root,
      runs: 1,
      output,
      model: "claude-opus-4-7",
      query,
    });
    const records = [];
    for await (const r of runner.run()) records.push(r);
    const happy = records.find((r) => r.taskId === "tf/pass");
    assert.ok(happy);
    // Walk the agent CWD: there must be no scoring/ dir and no sentinel file.
    const sentinelLeaked = existsSync(
      join(happy.agentTracePath, "..", "cwd", "sentinel.txt"),
    );
    assert.strictEqual(sentinelLeaked, false);
    const agentTrace = readFileSync(happy.agentTracePath, "utf8");
    assert.ok(
      !agentTrace.includes("HARNESS_SECRET_TOKEN_42"),
      "agent trace contained the scoring sentinel — grading isolation broken",
    );
  });
});
