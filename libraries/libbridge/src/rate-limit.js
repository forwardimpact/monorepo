import { createDefaultClock } from "@forwardimpact/libutil/runtime";

/**
 * Sliding-window rate limiter. Operates on a caller-owned `dispatches: number[]`
 * array of timestamps and returns a structured result so callers can both
 * gate dispatch and surface retry-after hints.
 */
export class RateLimiter {
  #windowMs;
  #max;
  #clock;

  /**
   * @param {object} [options]
   * @param {number} [options.windowMs] - Sliding window length in ms (default: 60_000)
   * @param {number} [options.max] - Max dispatches allowed in the window (default: 5)
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [options.clock]
   */
  constructor({
    windowMs = 60_000,
    max = 5,
    clock = createDefaultClock(),
  } = {}) {
    this.#windowMs = windowMs;
    this.#max = max;
    this.#clock = clock;
  }

  /**
   * Evaluate rate-limit state for a thread. Mutates `dispatches` to drop
   * timestamps outside the window before measuring.
   *
   * @param {string} threadId - For diagnostic/host bookkeeping; unused here.
   * @param {number[]} dispatches - Caller-owned timestamps in ms epoch.
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  check(threadId, dispatches) {
    if (!Array.isArray(dispatches)) {
      throw new Error("dispatches must be an array");
    }
    const now = this.#clock.now();
    const cutoff = now - this.#windowMs;
    let i = 0;
    while (i < dispatches.length && dispatches[i] < cutoff) i++;
    if (i > 0) dispatches.splice(0, i);

    if (dispatches.length < this.#max) {
      return { allowed: true };
    }
    const oldest = dispatches[0];
    const retryAfterMs = Math.max(0, oldest + this.#windowMs - now);
    return { allowed: false, retryAfterMs };
  }
}
