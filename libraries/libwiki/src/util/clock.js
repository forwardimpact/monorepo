import { isoDate } from "@forwardimpact/libutil";

/**
 * Today's ISO calendar date (`YYYY-MM-DD`) read from the injected clock.
 * Commands that previously inlined `new Date().toISOString().slice(0, 10)` (or
 * libwiki's `io.today()`) call this instead so the wall-clock read flows
 * through `runtime.clock`.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @returns {string}
 */
export function currentDayIso(runtime) {
  return isoDate(runtime.clock.now());
}
