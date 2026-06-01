import { describe, expect, test } from "bun:test";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { ElapsedScheduler } from "../src/elapsed-scheduler.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const clock = createDefaultClock();

describe("ElapsedScheduler", () => {
  test("rejects construction without onFire", () => {
    expect(() => new ElapsedScheduler({ clock })).toThrow();
  });

  test("fires at the scheduled time and forgets the timer", async () => {
    const fired = [];
    const scheduler = new ElapsedScheduler({
      clock,
      onFire: async (cid) => fired.push(cid),
    });
    scheduler.schedule("c-1", Date.now() + 15);
    await wait(35);
    expect(fired).toEqual(["c-1"]);
    expect(scheduler.size).toBe(0);
  });

  test("schedule with a past dueAt fires immediately", async () => {
    const fired = [];
    const scheduler = new ElapsedScheduler({
      clock,
      onFire: async (cid) => fired.push(cid),
    });
    scheduler.schedule("c-past", Date.now() - 1000);
    await wait(10);
    expect(fired).toEqual(["c-past"]);
  });

  test("scheduling the same id replaces the previous timer", async () => {
    const fired = [];
    const scheduler = new ElapsedScheduler({
      clock,
      onFire: async (cid) => fired.push(cid),
    });
    scheduler.schedule("c-1", Date.now() + 50);
    scheduler.schedule("c-1", Date.now() + 15);
    await wait(35);
    expect(fired).toEqual(["c-1"]);
    expect(scheduler.size).toBe(0);
  });

  test("cancel prevents firing", async () => {
    const fired = [];
    const scheduler = new ElapsedScheduler({
      clock,
      onFire: async (cid) => fired.push(cid),
    });
    scheduler.schedule("c-1", Date.now() + 15);
    scheduler.cancel("c-1");
    await wait(25);
    expect(fired).toEqual([]);
    expect(scheduler.size).toBe(0);
  });

  test("clear cancels all timers", () => {
    const scheduler = new ElapsedScheduler({ clock, onFire: async () => {} });
    scheduler.schedule("a", Date.now() + 60_000);
    scheduler.schedule("b", Date.now() + 60_000);
    expect(scheduler.size).toBe(2);
    scheduler.clear();
    expect(scheduler.size).toBe(0);
  });

  test("rejections from onFire are surfaced to onError, not unhandled", async () => {
    const errors = [];
    const scheduler = new ElapsedScheduler({
      clock,
      onFire: async () => {
        throw new Error("boom");
      },
      onError: (err, cid) => errors.push({ message: err.message, cid }),
    });
    scheduler.schedule("c-err", Date.now() + 10);
    await wait(25);
    expect(errors).toEqual([{ message: "boom", cid: "c-err" }]);
  });
});
