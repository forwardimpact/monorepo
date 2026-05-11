import { describe, test } from "node:test";
import assert from "node:assert";
import {
  validateResultRecord,
  validateScoringRecord,
} from "../src/benchmark/result.js";

function baseRecord(overrides = {}) {
  return {
    taskId: "tf/pass",
    runIndex: 0,
    verdict: "pass",
    scoring: { verdict: "pass", details: [], exitCode: 0 },
    judgeVerdict: { verdict: "pass", summary: "ok" },
    submission: "all done",
    costUsd: 0.0123,
    turns: 4,
    agentTracePath: "/tmp/agent.ndjson",
    judgeTracePath: "/tmp/judge.ndjson",
    profiles: { agent: null, supervisor: null, judge: null },
    model: "claude-opus-4-7",
    skillSetHash: "sha256:abc",
    familyRevision: "sha256:def",
    durationMs: 1234,
    ...overrides,
  };
}

describe("validateResultRecord", () => {
  test("accepts a minimal happy-path record", () => {
    validateResultRecord(baseRecord());
  });

  test("accepts a preflight-failure record", () => {
    const preflight = {
      taskId: "tf/preflight-broken",
      runIndex: 0,
      verdict: "fail",
      preflightError: {
        phase: "preflight",
        message: "scaffold broken",
        exitCode: 2,
      },
      costUsd: 0,
      turns: 0,
      profiles: { agent: null, supervisor: null, judge: null },
      model: "claude-opus-4-7",
      skillSetHash: "sha256:abc",
      familyRevision: "git:deadbeef",
      durationMs: 50,
    };
    validateResultRecord(preflight);
  });

  test("accepts an agent-execution-failure record (verdict=fail, empty submission)", () => {
    validateResultRecord(
      baseRecord({
        verdict: "fail",
        scoring: { verdict: "fail", details: [], exitCode: 1 },
        judgeVerdict: { verdict: "fail", summary: "scoring failed" },
        submission: "",
      }),
    );
  });

  test("rejects a record with unknown verdict enum", () => {
    assert.throws(() => validateResultRecord(baseRecord({ verdict: "maybe" })));
  });

  test("rejects when supervisor profile is non-null", () => {
    assert.throws(() =>
      validateResultRecord(
        baseRecord({
          profiles: { agent: null, supervisor: "live", judge: null },
        }),
      ),
    );
  });

  test("rejects when skillSetHash lacks the sha256: prefix", () => {
    assert.throws(() =>
      validateResultRecord(baseRecord({ skillSetHash: "abc" })),
    );
  });
});

describe("validateScoringRecord", () => {
  test("accepts a minimal scoring record", () => {
    validateScoringRecord({
      taskId: "tf/pass",
      scoring: { verdict: "pass", details: [], exitCode: 0 },
      exitCode: 0,
    });
  });

  test("rejects a missing taskId", () => {
    assert.throws(() =>
      validateScoringRecord({
        scoring: { verdict: "pass", details: [], exitCode: 0 },
        exitCode: 0,
      }),
    );
  });
});
