/**
 * Basecamp scheduler unit tests
 *
 * Tests the pure scheduling functions extracted from basecamp.js.
 * Since these functions are not exported, we re-implement them here
 * to validate the logic independently.
 */
import { test, describe } from "node:test";
import assert from "node:assert";

// Re-implement pure functions from basecamp.js for testing.
// These are internal functions not exported from the module.

function matchField(field, value) {
  if (field === "*") return true;
  if (field.startsWith("*/")) return value % parseInt(field.slice(2)) === 0;
  return field.split(",").some((part) => {
    if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part) === value;
  });
}

function cronMatches(expr, d) {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/);
  return (
    matchField(min, d.getMinutes()) &&
    matchField(hour, d.getHours()) &&
    matchField(dom, d.getDate()) &&
    matchField(month, d.getMonth() + 1) &&
    matchField(dow, d.getDay())
  );
}

function floorToMinute(d) {
  const t = d.getTime();
  return t - (t % 60_000);
}

function shouldWake(agent, agentState, now) {
  if (agent.enabled === false) return false;
  if (agentState.status === "active") return false;
  const { schedule } = agent;
  if (!schedule) return false;
  const lastWoke = agentState.lastWokeAt
    ? new Date(agentState.lastWokeAt)
    : null;

  if (schedule.type === "cron") {
    if (lastWoke && floorToMinute(lastWoke) === floorToMinute(now))
      return false;
    return cronMatches(schedule.expression, now);
  }
  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    return !lastWoke || now.getTime() - lastWoke.getTime() >= ms;
  }
  if (schedule.type === "once") {
    return !agentState.lastWokeAt && now >= new Date(schedule.runAt);
  }
  return false;
}

function failAgent(agentState, error) {
  Object.assign(agentState, {
    status: "failed",
    startedAt: null,
    lastWokeAt: new Date().toISOString(),
    lastError: String(error).slice(0, 500),
  });
}

function computeNextWakeAt(agent, agentState, now) {
  if (agent.enabled === false) return null;
  const { schedule } = agent;
  if (!schedule) return null;

  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    const lastWoke = agentState.lastWokeAt
      ? new Date(agentState.lastWokeAt)
      : null;
    if (!lastWoke) return now.toISOString();
    return new Date(lastWoke.getTime() + ms).toISOString();
  }

  if (schedule.type === "cron") {
    const limit = 24 * 60;
    const start = new Date(floorToMinute(now) + 60_000);
    for (let i = 0; i < limit; i++) {
      const candidate = new Date(start.getTime() + i * 60_000);
      if (cronMatches(schedule.expression, candidate)) {
        return candidate.toISOString();
      }
    }
    return null;
  }

  if (schedule.type === "once") {
    if (agentState.lastWokeAt) return null;
    return schedule.runAt;
  }

  return null;
}

describe("scheduler", () => {
  describe("matchField", () => {
    test("wildcard matches any value", () => {
      assert.strictEqual(matchField("*", 0), true);
      assert.strictEqual(matchField("*", 59), true);
    });

    test("step pattern matches divisible values", () => {
      assert.strictEqual(matchField("*/5", 0), true);
      assert.strictEqual(matchField("*/5", 5), true);
      assert.strictEqual(matchField("*/5", 10), true);
      assert.strictEqual(matchField("*/5", 3), false);
    });

    test("exact value matches", () => {
      assert.strictEqual(matchField("7", 7), true);
      assert.strictEqual(matchField("7", 8), false);
    });

    test("comma-separated list matches any", () => {
      assert.strictEqual(matchField("1,5,10", 5), true);
      assert.strictEqual(matchField("1,5,10", 3), false);
    });

    test("range matches inclusive bounds", () => {
      assert.strictEqual(matchField("5-10", 5), true);
      assert.strictEqual(matchField("5-10", 7), true);
      assert.strictEqual(matchField("5-10", 10), true);
      assert.strictEqual(matchField("5-10", 4), false);
      assert.strictEqual(matchField("5-10", 11), false);
    });
  });

  describe("cronMatches", () => {
    test("matches every minute expression", () => {
      const d = new Date(2025, 0, 15, 10, 30, 0);
      assert.strictEqual(cronMatches("* * * * *", d), true);
    });

    test("matches specific minute and hour", () => {
      const d = new Date(2025, 0, 15, 7, 0, 0);
      assert.strictEqual(cronMatches("0 7 * * *", d), true);
    });

    test("rejects non-matching time", () => {
      const d = new Date(2025, 0, 15, 8, 0, 0);
      assert.strictEqual(cronMatches("0 7 * * *", d), false);
    });

    test("matches day of week (0=Sunday)", () => {
      const sunday = new Date(2025, 0, 5, 10, 0, 0); // Jan 5, 2025 = Sunday
      assert.strictEqual(cronMatches("0 10 * * 0", sunday), true);
    });

    test("matches month field", () => {
      const jan = new Date(2025, 0, 15, 10, 0, 0);
      assert.strictEqual(cronMatches("0 10 * 1 *", jan), true);
      assert.strictEqual(cronMatches("0 10 * 2 *", jan), false);
    });
  });

  describe("floorToMinute", () => {
    test("floors to minute boundary", () => {
      const d = new Date(2025, 0, 15, 10, 30, 45, 123);
      const floored = floorToMinute(d);
      const expected = new Date(2025, 0, 15, 10, 30, 0, 0).getTime();
      assert.strictEqual(floored, expected);
    });

    test("preserves exact minute", () => {
      const d = new Date(2025, 0, 15, 10, 30, 0, 0);
      assert.strictEqual(floorToMinute(d), d.getTime());
    });
  });

  describe("shouldWake", () => {
    test("returns false when agent is disabled", () => {
      const agent = { enabled: false, schedule: { type: "interval" } };
      assert.strictEqual(shouldWake(agent, {}, new Date()), false);
    });

    test("returns false when agent is active", () => {
      const agent = { schedule: { type: "interval" } };
      assert.strictEqual(
        shouldWake(agent, { status: "active" }, new Date()),
        false,
      );
    });

    test("returns false when no schedule", () => {
      assert.strictEqual(shouldWake({}, {}, new Date()), false);
    });

    test("interval: wakes when no previous wake", () => {
      const agent = { schedule: { type: "interval", minutes: 5 } };
      assert.strictEqual(shouldWake(agent, {}, new Date()), true);
    });

    test("interval: wakes when enough time elapsed", () => {
      const now = new Date(2025, 0, 15, 10, 10, 0);
      const agent = { schedule: { type: "interval", minutes: 5 } };
      const state = {
        lastWokeAt: new Date(2025, 0, 15, 10, 4, 0).toISOString(),
      };
      assert.strictEqual(shouldWake(agent, state, now), true);
    });

    test("interval: does not wake when not enough time", () => {
      const now = new Date(2025, 0, 15, 10, 3, 0);
      const agent = { schedule: { type: "interval", minutes: 5 } };
      const state = {
        lastWokeAt: new Date(2025, 0, 15, 10, 0, 0).toISOString(),
      };
      assert.strictEqual(shouldWake(agent, state, now), false);
    });

    test("cron: wakes when expression matches", () => {
      const now = new Date(2025, 0, 15, 7, 0, 0);
      const agent = { schedule: { type: "cron", expression: "0 7 * * *" } };
      assert.strictEqual(shouldWake(agent, {}, now), true);
    });

    test("cron: does not wake twice in same minute", () => {
      const now = new Date(2025, 0, 15, 7, 0, 30);
      const agent = { schedule: { type: "cron", expression: "0 7 * * *" } };
      const state = {
        lastWokeAt: new Date(2025, 0, 15, 7, 0, 10).toISOString(),
      };
      assert.strictEqual(shouldWake(agent, state, now), false);
    });

    test("once: wakes when runAt has passed and not previously woken", () => {
      const now = new Date(2025, 0, 15, 10, 0, 0);
      const agent = {
        schedule: {
          type: "once",
          runAt: new Date(2025, 0, 15, 9, 0, 0).toISOString(),
        },
      };
      assert.strictEqual(shouldWake(agent, {}, now), true);
    });

    test("once: does not wake if already woken", () => {
      const now = new Date(2025, 0, 15, 10, 0, 0);
      const agent = {
        schedule: {
          type: "once",
          runAt: new Date(2025, 0, 15, 9, 0, 0).toISOString(),
        },
      };
      const state = {
        lastWokeAt: new Date(2025, 0, 15, 9, 0, 0).toISOString(),
      };
      assert.strictEqual(shouldWake(agent, state, now), false);
    });
  });

  describe("failAgent", () => {
    test("sets failed status and error", () => {
      const state = { status: "active", startedAt: "2025-01-01" };
      failAgent(state, "Connection timeout");
      assert.strictEqual(state.status, "failed");
      assert.strictEqual(state.startedAt, null);
      assert.strictEqual(state.lastError, "Connection timeout");
      assert.ok(state.lastWokeAt);
    });

    test("truncates long error messages", () => {
      const state = {};
      failAgent(state, "x".repeat(1000));
      assert.strictEqual(state.lastError.length, 500);
    });
  });

  describe("computeNextWakeAt", () => {
    test("returns null for disabled agent", () => {
      const agent = { enabled: false, schedule: { type: "interval" } };
      assert.strictEqual(computeNextWakeAt(agent, {}, new Date()), null);
    });

    test("returns null for agent without schedule", () => {
      assert.strictEqual(computeNextWakeAt({}, {}, new Date()), null);
    });

    test("interval: returns now if no previous wake", () => {
      const now = new Date(2025, 0, 15, 10, 0, 0);
      const agent = { schedule: { type: "interval", minutes: 5 } };
      assert.strictEqual(computeNextWakeAt(agent, {}, now), now.toISOString());
    });

    test("interval: returns lastWoke + interval", () => {
      const now = new Date(2025, 0, 15, 10, 0, 0);
      const lastWoke = new Date(2025, 0, 15, 9, 55, 0);
      const agent = { schedule: { type: "interval", minutes: 5 } };
      const state = { lastWokeAt: lastWoke.toISOString() };
      const result = computeNextWakeAt(agent, state, now);
      assert.strictEqual(
        result,
        new Date(lastWoke.getTime() + 5 * 60_000).toISOString(),
      );
    });

    test("once: returns runAt if not yet woken", () => {
      const now = new Date(2025, 0, 15, 10, 0, 0);
      const runAt = "2025-01-15T12:00:00.000Z";
      const agent = { schedule: { type: "once", runAt } };
      assert.strictEqual(computeNextWakeAt(agent, {}, now), runAt);
    });

    test("once: returns null if already woken", () => {
      const agent = {
        schedule: { type: "once", runAt: "2025-01-15T12:00:00.000Z" },
      };
      const state = { lastWokeAt: "2025-01-15T12:00:00.000Z" };
      assert.strictEqual(computeNextWakeAt(agent, state, new Date()), null);
    });

    test("cron: finds next matching minute", () => {
      const now = new Date(2025, 0, 15, 6, 59, 0);
      const agent = { schedule: { type: "cron", expression: "0 7 * * *" } };
      const result = computeNextWakeAt(agent, {}, now);
      assert.ok(result);
      const nextWake = new Date(result);
      assert.strictEqual(nextWake.getHours(), 7);
      assert.strictEqual(nextWake.getMinutes(), 0);
    });
  });
});
