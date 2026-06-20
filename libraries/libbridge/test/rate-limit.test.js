import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { RateLimiter } from "../src/rate-limit.js";

const clock = createDefaultClock();

describe("RateLimiter", () => {
  test("allows up to max dispatches per window", () => {
    const limiter = new RateLimiter({ clock, windowMs: 60_000, max: 3 });
    const dispatches = [];
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const result = limiter.check("t1", dispatches);
      expect(result.allowed).toBe(true);
      dispatches.push(now + i);
    }
    const blocked = limiter.check("t1", dispatches);
    expect(blocked.allowed).toBe(false);
    expect(typeof blocked.retryAfterMs).toBe("number");
    expect(blocked.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  test("evicts timestamps outside the window before measuring", () => {
    const limiter = new RateLimiter({ clock, windowMs: 1000, max: 5 });
    const now = Date.now();
    const dispatches = [now - 5000, now - 3000, now - 2000];
    const result = limiter.check("t1", dispatches);
    expect(result.allowed).toBe(true);
    expect(dispatches.length).toBe(0);
  });

  test("retryAfterMs predicts when the oldest entry exits the window", () => {
    const limiter = new RateLimiter({ clock, windowMs: 60_000, max: 2 });
    const now = Date.now();
    const dispatches = [now - 10_000, now - 5_000];
    const result = limiter.check("t1", dispatches);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(49_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(50_000);
  });

  test("default windowMs and max match legacy values", () => {
    const limiter = new RateLimiter({ clock });
    const now = Date.now();
    const dispatches = [now, now, now, now, now];
    const result = limiter.check("t1", dispatches);
    expect(result.allowed).toBe(false);
  });

  test("rejects non-array dispatches", () => {
    const limiter = new RateLimiter({ clock });
    expect(() => limiter.check("t1", null)).toThrow();
    expect(() => limiter.check("t1", undefined)).toThrow();
  });
});
