import { describe, test } from "node:test";
import assert from "node:assert";

import {
  validateResultRecord,
  validateScoringRecord,
} from "../src/benchmark/result.js";

const happy = {
  taskId: "tf/pass",
  runIndex: 0,
  verdict: "pass",
  scoring: { verdict: "pass", details: [], exitCode: 0 },
  submission: "all good",
  judgeVerdict: { verdict: "pass", summary: "approved" },
  costUsd: 0.123,
  turns: 4,
  agentTracePath: "/tmp/x/agent.ndjson",
  judgeTracePath: "/tmp/x/judge.ndjson",
  profiles: { agent: "coder", supervisor: null, judge: "judge" },
  model: "claude-opus-4-7",
  skillSetHash: "sha256:abc",
  familyRevision: "sha256:def",
  durationMs: 1234,
};

const preflightFail = {
  taskId: "tf/preflight-broken",
  runIndex: 0,
  verdict: "fail",
  costUsd: 0,
  turns: 0,
  preflightError: { phase: "preflight", message: "boom", exitCode: 7 },
  profiles: { agent: null, supervisor: null, judge: null },
  model: "claude-opus-4-7",
  skillSetHash: "sha256:abc",
  familyRevision: "sha256:def",
  durationMs: 50,
  agentTracePath: "/tmp/x/agent.ndjson",
  judgeTracePath: "/tmp/x/judge.ndjson",
};

const agentFailed = {
  ...happy,
  taskId: "tf/agent-died",
  verdict: "fail",
  scoring: { verdict: "fail", details: [], exitCode: 1 },
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

  test("accepts an agent-execution-failure record (scoring/judge present)", () => {
    assert.doesNotThrow(() => validateResultRecord(agentFailed));
  });

  test("rejects a malformed record (missing verdict)", () => {
    const broken = { ...happy };
    delete broken.verdict;
    assert.throws(() => validateResultRecord(broken));
  });

  test("rejects supervisor=string (must be null per P5)", () => {
    const broken = {
      ...happy,
      profiles: { agent: "a", supervisor: "sup", judge: "j" },
    };
    assert.throws(() => validateResultRecord(broken));
  });
});

describe("validateScoringRecord", () => {
  test("accepts a valid scoring record", () => {
    assert.doesNotThrow(() =>
      validateScoringRecord({
        taskId: "tf/pass",
        scoring: { verdict: "pass", details: [], exitCode: 0 },
        exitCode: 0,
      }),
    );
  });

  test("rejects when scoring is missing", () => {
    assert.throws(() => validateScoringRecord({ taskId: "tf/x", exitCode: 0 }));
  });
});
