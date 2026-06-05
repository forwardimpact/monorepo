import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockClock } from "@forwardimpact/libmock";
import { RateCeiling } from "../index.js";

describe("RateCeiling", () => {
  test("allows mints under the limit", () => {
    const clock = createMockClock({ start: 0 });
    const ceiling = new RateCeiling({ clock, limit: 3 });
    assert.strictEqual(ceiling.exceeds("t-1"), false);
    ceiling.record("t-1");
    ceiling.record("t-1");
    assert.strictEqual(ceiling.exceeds("t-1"), false);
  });

  test("blocks once the limit is reached within the window", () => {
    const clock = createMockClock({ start: 0 });
    const ceiling = new RateCeiling({ clock, limit: 3 });
    ceiling.record("t-1");
    ceiling.record("t-1");
    ceiling.record("t-1");
    assert.strictEqual(ceiling.exceeds("t-1"), true);
  });

  test("resets after the 60-second window rolls over", () => {
    const clock = createMockClock({ start: 0 });
    const ceiling = new RateCeiling({ clock, limit: 2 });
    ceiling.record("t-1");
    ceiling.record("t-1");
    assert.strictEqual(ceiling.exceeds("t-1"), true);
    clock.advance(60_001);
    assert.strictEqual(
      ceiling.exceeds("t-1"),
      false,
      "timestamps older than 60s drop out of the window",
    );
  });

  test("scopes the window per tenant", () => {
    const clock = createMockClock({ start: 0 });
    const ceiling = new RateCeiling({ clock, limit: 1 });
    ceiling.record("t-1");
    assert.strictEqual(ceiling.exceeds("t-1"), true);
    assert.strictEqual(ceiling.exceeds("t-2"), false);
  });

  test("rejects a non-positive limit", () => {
    const clock = createMockClock({ start: 0 });
    assert.throws(() => new RateCeiling({ clock, limit: 0 }));
  });
});
