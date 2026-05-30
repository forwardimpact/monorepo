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
 * `setTimeout(fn, ms)` / `clearTimeout(handle)` delegate to the host's real
 * timers (matching `createDefaultClock`), so a migrated module that schedules
 * work through the injected clock keeps its real-timer test behaviour. Virtual
 * `now()` and real `setTimeout` are intentionally independent — a test that
 * needs a fired timer waits on real time as it did before migration.
 *
 * @param {object} [options]
 * @param {number} [options.start=0] - Initial virtual time in ms.
 * @returns {{
 *   now: () => number,
 *   sleep: (ms: number) => Promise<void>,
 *   setTimeout: (fn: Function, ms: number) => *,
 *   clearTimeout: (handle: *) => void,
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
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    advance(ms) {
      current += ms;
    },
    set(ms) {
      current = ms;
    },
    sleeps,
  };
}
