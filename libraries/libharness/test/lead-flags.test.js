import { test, describe } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { parseSuperviseOptions } from "../src/commands/supervise.js";
import { parseFacilitateOptions } from "../src/commands/facilitate.js";
import { parseDiscussOptions } from "../src/commands/discuss.js";
import { AGENT_MODEL, LEAD_MODEL } from "@forwardimpact/libutil/models";

// All cases below use --task-text, so the runtime's fs is never read (the
// only fs path is supervise's temp-dir fallback for --task-file). An in-memory
// fs therefore suffices. The env map is isolated so discuss's
// CALLBACK_URL/INBOX_URL reads stay deterministic.
function makeRuntime(env = {}) {
  return { fs: createMockFs(), proc: { env: { ...env } } };
}

describe("--lead-profile / --lead-model consolidation across modes", () => {
  test("supervise honours --lead-profile and --lead-model and ignores legacy keys", async () => {
    const opts = await parseSuperviseOptions(
      {
        "task-text": "do a thing",
        "agent-cwd": ".",
        "lead-profile": "judge",
        "lead-model": "claude-fable-5[1m]",
        // legacy keys: must be ignored — no soft fallback
        "supervisor-profile": "old-judge",
        "supervisor-model": "claude-sonnet-4-6",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.supervisorProfile, "judge");
    assert.strictEqual(opts.supervisorModel, "claude-fable-5[1m]");
  });

  test("supervise leaves the supervisor profile undefined when --lead-profile is absent", async () => {
    const opts = await parseSuperviseOptions(
      {
        "task-text": "do a thing",
        "agent-cwd": ".",
        "supervisor-profile": "old-judge",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.supervisorProfile, undefined);
  });

  test("facilitate honours --lead-profile and --lead-model and ignores legacy keys", () => {
    const opts = parseFacilitateOptions(
      {
        "task-text": "do a thing",
        "agent-profiles": "alpha,beta",
        "lead-profile": "lead",
        "lead-model": "claude-fable-5[1m]",
        "facilitator-profile": "old-lead",
        "facilitator-model": "claude-sonnet-4-6",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.facilitatorProfile, "lead");
    assert.strictEqual(opts.facilitatorModel, "claude-fable-5[1m]");
  });

  test("facilitate leaves the facilitator profile undefined when --lead-profile is absent", () => {
    const opts = parseFacilitateOptions(
      {
        "task-text": "do a thing",
        "agent-profiles": "alpha,beta",
        "facilitator-profile": "old-lead",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.facilitatorProfile, undefined);
  });

  test("discuss defaults --lead-profile to undefined and exposes the consolidated flags", () => {
    const opts = parseDiscussOptions(
      {
        "task-text": "do a thing",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.leadProfile, undefined);
    assert.strictEqual(opts.leadModel, LEAD_MODEL);
    assert.strictEqual(opts.maxTurns, 40);
    assert.deepStrictEqual(opts.agentConfigs, []);
  });

  test("discuss honours --lead-profile and accepts a JSON --resume-context", () => {
    const opts = parseDiscussOptions(
      {
        "task-text": "do a thing",
        "lead-profile": "release-engineer",
        "discussion-id": "GD_kw_x",
        "resume-context": JSON.stringify({
          pendingAsks: { alice: { askId: 1, askerName: "facilitator" } },
          askIdCounter: 1,
        }),
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.leadProfile, "release-engineer");
    assert.strictEqual(opts.discussionId, "GD_kw_x");
    assert.deepStrictEqual(opts.resumeContext.pendingAsks, {
      alice: { askId: 1, askerName: "facilitator" },
    });
  });

  test("discuss rejects malformed --resume-context JSON", () => {
    assert.throws(
      () =>
        parseDiscussOptions(
          {
            "task-text": "x",
            "resume-context": "{not valid",
          },
          makeRuntime(),
        ),
      /--resume-context is not valid JSON/,
    );
  });
});

describe("--advisor-model / --advisor-max-uses across lead modes", () => {
  // run's parser is covered in run-advisor.test.js.
  test("supervise surfaces the advisor options with max-uses defaulting to 3", async () => {
    const defaults = await parseSuperviseOptions(
      { "task-text": "x", "agent-cwd": "." },
      makeRuntime(),
    );
    assert.strictEqual(defaults.advisorModel, undefined);
    assert.strictEqual(defaults.advisorMaxUses, 3);

    const opts = await parseSuperviseOptions(
      {
        "task-text": "x",
        "agent-cwd": ".",
        "advisor-model": "adv-m",
        "advisor-max-uses": "5",
      },
      makeRuntime(),
    );
    assert.strictEqual(opts.advisorModel, "adv-m");
    assert.strictEqual(opts.advisorMaxUses, 5);

    await assert.rejects(
      parseSuperviseOptions(
        { "task-text": "x", "agent-cwd": ".", "advisor-max-uses": "5" },
        makeRuntime(),
      ),
      /--advisor-max-uses requires --advisor-model/,
    );
  });

  test("facilitate surfaces the advisor options with max-uses defaulting to 3", () => {
    const base = { "task-text": "x", "agent-profiles": "alpha" };
    const defaults = parseFacilitateOptions(base, makeRuntime());
    assert.strictEqual(defaults.advisorModel, undefined);
    assert.strictEqual(defaults.advisorMaxUses, 3);

    const opts = parseFacilitateOptions(
      { ...base, "advisor-model": "adv-m", "advisor-max-uses": "5" },
      makeRuntime(),
    );
    assert.strictEqual(opts.advisorModel, "adv-m");
    assert.strictEqual(opts.advisorMaxUses, 5);

    assert.throws(
      () =>
        parseFacilitateOptions(
          { ...base, "advisor-max-uses": "5" },
          makeRuntime(),
        ),
      /--advisor-max-uses requires --advisor-model/,
    );
  });

  test("discuss surfaces the advisor options with max-uses defaulting to 3", () => {
    const defaults = parseDiscussOptions({ "task-text": "x" }, makeRuntime());
    assert.strictEqual(defaults.advisorModel, undefined);
    assert.strictEqual(defaults.advisorMaxUses, 3);

    const opts = parseDiscussOptions(
      { "task-text": "x", "advisor-model": "adv-m", "advisor-max-uses": "5" },
      makeRuntime(),
    );
    assert.strictEqual(opts.advisorModel, "adv-m");
    assert.strictEqual(opts.advisorMaxUses, 5);

    assert.throws(
      () =>
        parseDiscussOptions(
          { "task-text": "x", "advisor-max-uses": "5" },
          makeRuntime(),
        ),
      /--advisor-max-uses requires --advisor-model/,
    );
  });
});

describe("blank model flags fall through to the role constants", () => {
  // Composite-action inputs are strings, so an unset input arrives as
  // `--lead-model=` (empty string). Blank must behave like absent so the
  // defaults in @forwardimpact/libutil/models stay the single source.
  test("supervise treats empty model flags as unset", async () => {
    const opts = await parseSuperviseOptions(
      {
        "task-text": "do a thing",
        "agent-cwd": ".",
        "agent-model": "",
        "lead-model": "",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.agentModel, AGENT_MODEL);
    assert.strictEqual(opts.supervisorModel, LEAD_MODEL);
  });

  test("discuss treats empty model flags as unset", () => {
    const opts = parseDiscussOptions(
      {
        "task-text": "do a thing",
        "agent-model": "",
        "lead-model": "",
      },
      makeRuntime(),
    );

    assert.strictEqual(opts.agentModel, AGENT_MODEL);
    assert.strictEqual(opts.leadModel, LEAD_MODEL);
  });
});
