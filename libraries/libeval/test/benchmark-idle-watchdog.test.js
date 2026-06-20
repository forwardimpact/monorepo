import { test, describe } from "node:test";
import assert from "node:assert";

import { raceIdleWatchdog } from "../src/benchmark/runner.js";

// A real-timer clock with tiny thresholds keeps these deterministic and fast.
const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

describe("raceIdleWatchdog", () => {
  test("resolves with the work result when the run settles before idling", async () => {
    const activity = { at: Date.now() };
    const work = new Promise((r) => setTimeout(() => r({ success: true }), 10));
    const result = await raceIdleWatchdog(work, activity, realClock, 200);
    assert.deepStrictEqual(result, { success: true });
  });

  test("rejects as a stall when no activity is seen for idleMs", async () => {
    const activity = { at: Date.now() };
    const never = new Promise(() => {}); // a run that never settles
    await assert.rejects(
      () => raceIdleWatchdog(never, activity, realClock, 40),
      /produced no trace output for 40ms \(possible stall\)/,
    );
  });

  test("does not fire while activity keeps getting bumped", async () => {
    const activity = { at: Date.now() };
    // Bump activity every 15ms so the 50ms idle window never elapses, then let
    // the work settle. A fixed total cap would have fired; an idle one must not.
    const bump = setInterval(() => {
      activity.at = Date.now();
    }, 15);
    const work = new Promise((r) =>
      setTimeout(() => r({ success: true }), 160),
    );
    try {
      const result = await raceIdleWatchdog(work, activity, realClock, 50);
      assert.deepStrictEqual(result, { success: true });
    } finally {
      clearInterval(bump);
    }
  });
});
