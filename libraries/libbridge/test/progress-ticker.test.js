import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { ProgressTicker } from "../src/progress-ticker.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("ProgressTicker", () => {
  test("invokes tick at the configured interval until stopped", async () => {
    const ticker = new ProgressTicker({ intervalMs: 10 });
    let count = 0;
    ticker.start("t1", () => {
      count++;
    });
    await wait(55);
    ticker.stop("t1");
    const snapshot = count;
    expect(snapshot).toBeGreaterThanOrEqual(3);
    await wait(40);
    expect(count).toBe(snapshot);
    expect(ticker.size).toBe(0);
  });

  test("multiple independent tokens tick concurrently", async () => {
    const ticker = new ProgressTicker({ intervalMs: 10 });
    let a = 0;
    let b = 0;
    ticker.start("a", () => {
      a++;
    });
    ticker.start("b", () => {
      b++;
    });
    expect(ticker.size).toBe(2);
    await wait(35);
    ticker.stop("a");
    ticker.stop("b");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });

  test("tick rejection auto-stops the ticker (matches legacy)", async () => {
    const ticker = new ProgressTicker({ intervalMs: 10 });
    let count = 0;
    ticker.start("err", async () => {
      count++;
      throw new Error("boom");
    });
    await wait(35);
    expect(count).toBeGreaterThan(0);
    expect(ticker.size).toBe(0);
  });

  test("starting an existing token replaces the prior ticker", async () => {
    const ticker = new ProgressTicker({ intervalMs: 10 });
    let first = 0;
    let second = 0;
    ticker.start("x", () => {
      first++;
    });
    await wait(15);
    ticker.start("x", () => {
      second++;
    });
    await wait(35);
    ticker.stop("x");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(ticker.size).toBe(0);
  });

  test("first tick fires immediately without waiting for the interval", async () => {
    const ticker = new ProgressTicker({ intervalMs: 60_000 });
    let count = 0;
    ticker.start("t-immediate", () => {
      count++;
    });
    await wait(10);
    ticker.stop("t-immediate");
    expect(count).toBe(1);
  });

  test("stop on unknown token is a no-op", () => {
    const ticker = new ProgressTicker();
    expect(() => ticker.stop("unknown")).not.toThrow();
  });

  test("start rejects non-function tick", () => {
    const ticker = new ProgressTicker();
    expect(() => ticker.start("t", null)).toThrow();
  });
});
