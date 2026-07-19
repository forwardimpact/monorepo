import { describe, test } from "node:test";
import assert from "node:assert";

import {
  validateResultRecord,
  validateGradeRecord,
} from "../src/benchmark/result.js";

const happy = {
  taskId: "pass",
  runIndex: 0,
  verdict: "pass",
  invariants: { details: [], exitCode: 0 },
  grade: { verdict: "pass", gatesPass: true },
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
  invariants: { details: [], exitCode: 1 },
  grade: { verdict: "fail", gatesPass: true },
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

  test("accepts a scored record with grade.score, malformed, hiddenTests, and score", () => {
    const scored = {
      ...happy,
      verdict: "fail",
      grade: { verdict: "fail", gatesPass: true, score: 0.6, malformed: 1 },
      hiddenTests: { details: [{ test: "t", pass: true }] },
      score: 0.6,
    };
    assert.doesNotThrow(() => validateResultRecord(scored));
  });

  test("accepts an engine-crash record (hiddenTests.error)", () => {
    const crashed = {
      ...happy,
      verdict: "fail",
      grade: { verdict: "fail", gatesPass: true, score: 0.5 },
      hiddenTests: { details: [], error: "engine exploded" },
      score: 0,
    };
    assert.doesNotThrow(() => validateResultRecord(crashed));
  });

  test("rejects a malformed record (missing verdict)", () => {
    const broken = { ...happy };
    delete broken.verdict;
    assert.throws(() => validateResultRecord(broken));
  });

  test("rejects a happy record without grade (pre-break ledger record)", () => {
    const preBreak = { ...happy };
    delete preBreak.grade;
    assert.throws(() => validateResultRecord(preBreak));
  });

  test("rejects score outside [0, 1]", () => {
    assert.throws(() => validateResultRecord({ ...happy, score: 1.5 }));
  });

  test("rejects grade.malformed: 0 (omitted when clean)", () => {
    const broken = {
      ...happy,
      grade: { verdict: "pass", gatesPass: true, malformed: 0 },
    };
    assert.throws(() => validateResultRecord(broken));
  });

  test("rejects a preflight record carrying a grade", () => {
    const broken = {
      ...preflightFail,
      grade: { verdict: "fail", gatesPass: true },
    };
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

describe("validateGradeRecord", () => {
  test("accepts a valid grade record", () => {
    assert.doesNotThrow(() =>
      validateGradeRecord({
        taskId: "pass",
        grade: { verdict: "pass", gatesPass: true, score: 1 },
        invariants: { details: [], exitCode: 0 },
        hiddenTests: { details: [] },
        exitCode: 0,
      }),
    );
  });

  test("rejects when grade is missing", () => {
    assert.throws(() =>
      validateGradeRecord({
        taskId: "x",
        invariants: { details: [], exitCode: 0 },
        exitCode: 0,
      }),
    );
  });
});
