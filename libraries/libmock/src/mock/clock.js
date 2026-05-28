import { spy } from "./spy.js";

/**
 * Creates a mock clock with controllable time and a no-wait sleep.
 *
 * `now()` returns the current virtual time in ms. `sleep(ms)` advances
 * virtual time by `ms` and resolves on the next microtask — no real
 * timers are scheduled. `advance(ms)` lets a test move time forward
 * without going through `sleep` (e.g. to expire a token).
 *
 * Pass `{ sleep, now }` from a returned clock to any constructor that
 * accepts those collaborators to make its tests deterministic.
 *
 * @param {object} [options]
 * @param {number} [options.start=0] - Initial virtual time in ms.
 * @returns {{
 *   now: () => number,
 *   sleep: (ms: number) => Promise<void>,
 *   advance: (ms: number) => void,
 *   set: (ms: number) => void,
 *   sleeps: Array<number>,
 * }}
 */
export function createMockClock({ start = 0 } = {}) {
  let current = start;
  const sleeps = [];

  const now = spy(() => current);
  const sleep = spy(async (ms) => {
    sleeps.push(ms);
    current += ms;
  });

  return {
    now,
    sleep,
    advance(ms) {
      current += ms;
    },
    set(ms) {
      current = ms;
    },
    sleeps,
  };
}
