import { test, describe } from "node:test";
import assert from "node:assert";

import { parseSuperviseOptions } from "../src/commands/supervise.js";
import { parseFacilitateOptions } from "../src/commands/facilitate.js";
import { parseDiscussOptions } from "../src/commands/discuss.js";

describe("--lead-profile / --lead-model consolidation across modes", () => {
  test("supervise honours --lead-profile and --lead-model and ignores legacy keys", () => {
    const opts = parseSuperviseOptions({
      "task-text": "do a thing",
      "lead-profile": "judge",
      "lead-model": "claude-opus-4-7[1m]",
      // legacy keys: must be ignored — no soft fallback
      "supervisor-profile": "old-judge",
      "supervisor-model": "claude-sonnet-4-6",
    });

    assert.strictEqual(opts.supervisorProfile, "judge");
    assert.strictEqual(opts.supervisorModel, "claude-opus-4-7[1m]");
  });

  test("supervise leaves the supervisor profile undefined when --lead-profile is absent", () => {
    const opts = parseSuperviseOptions({
      "task-text": "do a thing",
      "supervisor-profile": "old-judge",
    });

    assert.strictEqual(opts.supervisorProfile, undefined);
  });

  test("facilitate honours --lead-profile and --lead-model and ignores legacy keys", () => {
    const opts = parseFacilitateOptions({
      "task-text": "do a thing",
      "agent-profiles": "alpha,beta",
      "lead-profile": "lead",
      "lead-model": "claude-opus-4-7[1m]",
      "facilitator-profile": "old-lead",
      "facilitator-model": "claude-sonnet-4-6",
    });

    assert.strictEqual(opts.facilitatorProfile, "lead");
    assert.strictEqual(opts.facilitatorModel, "claude-opus-4-7[1m]");
  });

  test("facilitate leaves the facilitator profile undefined when --lead-profile is absent", () => {
    const opts = parseFacilitateOptions({
      "task-text": "do a thing",
      "agent-profiles": "alpha,beta",
      "facilitator-profile": "old-lead",
    });

    assert.strictEqual(opts.facilitatorProfile, undefined);
  });

  test("discuss defaults --lead-profile to release-engineer and exposes the consolidated flags", () => {
    const opts = parseDiscussOptions({
      "task-text": "do a thing",
    });

    assert.strictEqual(opts.leadProfile, "release-engineer");
    assert.strictEqual(opts.leadModel, "claude-opus-4-7[1m]");
    assert.strictEqual(opts.maxTurns, 40);
    assert.deepStrictEqual(opts.agentConfigs, []);
  });

  test("discuss honours --lead-profile and accepts a JSON --resume-context", () => {
    const opts = parseDiscussOptions({
      "task-text": "do a thing",
      "lead-profile": "release-engineer",
      "discussion-id": "GD_kw_x",
      "resume-context": JSON.stringify({
        pendingAsks: { alice: { askId: 1, askerName: "facilitator" } },
        askIdCounter: 1,
      }),
    });

    assert.strictEqual(opts.leadProfile, "release-engineer");
    assert.strictEqual(opts.discussionId, "GD_kw_x");
    assert.deepStrictEqual(opts.resumeContext.pendingAsks, {
      alice: { askId: 1, askerName: "facilitator" },
    });
  });

  test("discuss rejects malformed --resume-context JSON", () => {
    assert.throws(
      () =>
        parseDiscussOptions({
          "task-text": "x",
          "resume-context": "{not valid",
        }),
      /--resume-context is not valid JSON/,
    );
  });
});
