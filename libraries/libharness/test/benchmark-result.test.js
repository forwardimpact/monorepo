import { describe, test } from "node:test";
import assert from "node:assert";

import {
  validateResultRecord,
  validateInvariantsRecord,
} from "../src/benchmark/result.js";

const happy = {
  taskId: "pass",
  runIndex: 0,
  verdict: "pass",
  invariants: { verdict: "pass", details: [], exitCode: 0 },
  submission: "all good",
  judgeVerdict: { verdict: "pass", summary: "approved" },
  costUsd: 0.123,
  turns: 4,
  agentTracePath: "/tmp/x/agent.ndjson",
  supervisorTracePath: "/tmp/x/supervisor.ndjson",
  judgeTracePath: "/tmp/x/judge.ndjson",
  profiles: { agent: "coder", supervisor: null, judge: "judge" },
  model: {
    agent: "claude-sonnet-4-6",
    supervisor: "claude-fable-5",
    judge: "claude-fable-5",
  },
  skillSetHash: "sha256:abc",
  familyRevision: "sha256:def",
  durationMs: 1234,
};

const preflightFail = {
  taskId: "preflight-broken",
  runIndex: 0,
  verdict: "fail",
  costUsd: 0,
  turns: 0,
  preflightError: { phase: "preflight", message: "boom", exitCode: 7 },
  profiles: { agent: null, supervisor: null, judge: null },
  model: {
    agent: "claude-sonnet-4-6",
    supervisor: "claude-fable-5",
    judge: "claude-fable-5",
  },
  skillSetHash: "sha256:abc",
  familyRevision: "sha256:def",
  durationMs: 50,
  agentTracePath: "/tmp/x/agent.ndjson",
  supervisorTracePath: "/tmp/x/supervisor.ndjson",
  judgeTracePath: "/tmp/x/judge.ndjson",
};

const agentFailed = {
  ...happy,
  taskId: "agent-died",
  verdict: "fail",
  invariants: { verdict: "fail", details: [], exitCode: 1 },
  judgeVerdict: { verdict: "fail", summary: "agent died" },
  submission: "",
  agentError: { message: "iteration failed", aborted: false },
};

describe("validateResultRecord", () => {
  test("accepts a happy record", () => {
    assert.doesNotThrow(() => validateResultRecord(happy));
  });

  test("accepts a preflight-failure record", () => {
    assert.doesNotThrow(() => validateResultRecord(preflightFail));
  });

  test("accepts an agent-execution-failure record (invariants/judge present)", () => {
    assert.doesNotThrow(() => validateResultRecord(agentFailed));
  });

  test("rejects a malformed record (missing verdict)", () => {
    const broken = { ...happy };
    delete broken.verdict;
    assert.throws(() => validateResultRecord(broken));
  });

  test("accepts supervisor=string (supervisor.task.md support)", () => {
    const withSupervisor = {
      ...happy,
      profiles: { agent: "a", supervisor: "sup", judge: "j" },
    };
    assert.doesNotThrow(() => validateResultRecord(withSupervisor));
  });

  test("accepts a costBreakdown of agent/supervisor/judge", () => {
    const withBreakdown = {
      ...happy,
      costBreakdown: { agent: 0.08, supervisor: 0.03, judge: 0.013 },
    };
    assert.doesNotThrow(() => validateResultRecord(withBreakdown));
  });

  test("rejects a costBreakdown missing the judge field", () => {
    const broken = {
      ...happy,
      costBreakdown: { agent: 0.08, supervisor: 0.03 },
    };
    assert.throws(() => validateResultRecord(broken));
  });
});

describe("validateInvariantsRecord", () => {
  test("accepts a valid invariants record", () => {
    assert.doesNotThrow(() =>
      validateInvariantsRecord({
        taskId: "pass",
        invariants: { verdict: "pass", details: [], exitCode: 0 },
        exitCode: 0,
      }),
    );
  });

  test("rejects when invariants is missing", () => {
    assert.throws(() => validateInvariantsRecord({ taskId: "x", exitCode: 0 }));
  });
});
