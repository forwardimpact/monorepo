import { describe, test } from "node:test";
import assert from "node:assert";

import { parseFacilitateOptions } from "../src/commands/facilitate.js";

// These tests lock in the contract that `--max-turns` from the CLI threads
// into every facilitated agent's config — without it, the participants
// silently fall back to the 50-turn default in facilitator.js. See run
// 26078312414, where staff-engineer terminated at numTurns 51 despite the
// workflow passing --max-turns=200.
describe("facilitate command - parseFacilitateOptions", () => {
  const minimal = (extra = {}) => ({
    "task-text": "do the thing",
    "agent-profiles": "alice,bob,carol",
    ...extra,
  });

  test("--max-turns threads into every agent config", () => {
    const opts = parseFacilitateOptions(minimal({ "max-turns": "1500" }));
    assert.strictEqual(opts.maxTurns, 1500);
    assert.strictEqual(opts.agentConfigs.length, 3);
    for (const cfg of opts.agentConfigs) {
      assert.strictEqual(cfg.maxTurns, 1500);
    }
  });

  test("--max-turns=0 threads as 0 (unlimited) to every agent", () => {
    const opts = parseFacilitateOptions(minimal({ "max-turns": "0" }));
    assert.strictEqual(opts.maxTurns, 0);
    for (const cfg of opts.agentConfigs) {
      assert.strictEqual(cfg.maxTurns, 0);
    }
  });

  test("omitting --max-turns falls back to the documented CLI default", () => {
    const opts = parseFacilitateOptions(minimal());
    assert.strictEqual(opts.maxTurns, 20);
    for (const cfg of opts.agentConfigs) {
      assert.strictEqual(cfg.maxTurns, 20);
    }
  });
});
