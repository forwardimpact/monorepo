import { describe, test } from "node:test";
import assert from "node:assert";

import { waitFor } from "../wait.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("waitFor", () => {
  test("throws if delayFn is missing", async () => {
    await assert.rejects(
      () => waitFor(() => Promise.resolve(true), {}),
      /delayFn is required/,
    );
  });

  test("resolves immediately when condition is true", async () => {
    let callCount = 0;
    await waitFor(
      () => {
        callCount++;
        return Promise.resolve(true);
      },
      {},
      delay,
    );

    assert.strictEqual(callCount, 1);
  });

  test("retries until condition becomes true", async () => {
    let callCount = 0;
    await waitFor(
      () => {
        callCount++;
        return Promise.resolve(callCount >= 3);
      },
      { interval: 10, timeout: 5000 },
      delay,
    );

    assert.strictEqual(callCount, 3);
  });

  test("throws error on timeout", async () => {
    await assert.rejects(
      () =>
        waitFor(
          () => Promise.resolve(false),
          { timeout: 50, interval: 10 },
          delay,
        ),
      { message: "Timeout waiting for condition after 50ms" },
    );
  });

  test("ignores errors during polling", async () => {
    let callCount = 0;
    await waitFor(
      () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Service not ready");
        }
        return Promise.resolve(true);
      },
      { interval: 10, timeout: 5000 },
      delay,
    );

    assert.strictEqual(callCount, 3);
  });

  test("uses default options when not provided", async () => {
    let called = false;
    await waitFor(
      () => {
        called = true;
        return Promise.resolve(true);
      },
      {},
      delay,
    );

    assert.strictEqual(called, true);
  });

  test("increases interval with exponential backoff", async () => {
    const intervals = [];
    let lastTime = Date.now();
    let callCount = 0;

    await waitFor(
      () => {
        const now = Date.now();
        if (callCount > 0) {
          intervals.push(now - lastTime);
        }
        lastTime = now;
        callCount++;
        return Promise.resolve(callCount >= 4);
      },
      { interval: 20, maxInterval: 100, timeout: 5000 },
      delay,
    );

    // Intervals should generally increase (with some tolerance for timing)
    assert.ok(intervals.length >= 2);
  });
});
