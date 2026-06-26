/**
 * AgentRunner privilege-gate tests
 *
 * The wake path resolves a mandatory privilege level, logs it, threads the
 * disclaim flag into the spawn call, and fail-closes a missing/invalid level
 * (logs `outpost.privilege.rejected` and spawns nothing).
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { AgentRunner } from "../src/agent-runner.js";
import {
  TEST_KB,
  postureCfg,
  createMockSpawn,
  createMockStateManager,
  makeRuntime,
} from "./helpers.js";

/** Parse logged lines, keeping only the JSON objects matching `event`. */
function eventsOf(logged, event) {
  return logged
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.event === event);
}

/**
 * Build a runner whose log lines are collected into `logged`.
 * @param {string[]} logged
 * @param {{ module: Object }} spawn
 */
function makeRunner(logged, spawn) {
  return new AgentRunner(
    spawn.module,
    createMockStateManager(),
    (line) => logged.push(line),
    "/tmp/cache",
    makeRuntime({ HOME: "/home/u" }),
    postureCfg(),
  );
}

describe("AgentRunner privilege gate (via wake)", () => {
  test("a full agent passes disclaim 0 and logs level full", async () => {
    const spawn = createMockSpawn();
    const logged = [];
    const runner = makeRunner(logged, spawn);

    await runner.wake(
      "sync-agent",
      { kb: TEST_KB, privilege: "full" },
      { agents: {} },
    );

    assert.strictEqual(spawn.calls.length, 1);
    assert.strictEqual(spawn.calls[0].disclaim, 0);
    const resolved = eventsOf(logged, "outpost.privilege.resolved");
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].level, "full");
    assert.strictEqual(resolved[0].agent, "sync-agent");
  });

  test("a restricted agent passes disclaim 1 and logs level restricted", async () => {
    const spawn = createMockSpawn();
    const logged = [];
    const runner = makeRunner(logged, spawn);

    await runner.wake(
      "kb-agent",
      { kb: TEST_KB, privilege: "restricted" },
      { agents: {} },
    );

    assert.strictEqual(spawn.calls.length, 1);
    assert.strictEqual(spawn.calls[0].disclaim, 1);
    const resolved = eventsOf(logged, "outpost.privilege.resolved");
    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].level, "restricted");
  });

  test("a missing level is rejected and nothing is spawned", async () => {
    const spawn = createMockSpawn();
    const logged = [];
    const runner = makeRunner(logged, spawn);

    await runner.wake("no-level", { kb: TEST_KB }, { agents: {} });

    assert.strictEqual(spawn.calls.length, 0);
    const rejected = eventsOf(logged, "outpost.privilege.rejected");
    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(rejected[0].agent, "no-level");
    assert.match(rejected[0].error, /invalid privilege/);
    // The wake never reached the resolved-level log.
    assert.strictEqual(
      eventsOf(logged, "outpost.privilege.resolved").length,
      0,
    );
  });

  test("an invalid level is rejected and nothing is spawned", async () => {
    const spawn = createMockSpawn();
    const logged = [];
    const runner = makeRunner(logged, spawn);

    await runner.wake(
      "bad-level",
      { kb: TEST_KB, privilege: "elevated" },
      { agents: {} },
    );

    assert.strictEqual(spawn.calls.length, 0);
    const rejected = eventsOf(logged, "outpost.privilege.rejected");
    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(rejected[0].agent, "bad-level");
  });
});
