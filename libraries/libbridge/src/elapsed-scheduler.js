const CHUNK_CAP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * In-memory scheduler for `elapsed` resume triggers. JS `setTimeout`'s
 * practical cap is ~24.8 days; this scheduler chunks longer durations
 * into <= 7-day rearm segments so future >24-day windows work, while
 * the persistent `due_at` in `open_rfcs` is the source of truth across
 * restarts. Channel-agnostic — used by `ResumeScheduler` for both
 * bridges.
 */
export class ElapsedScheduler {
  #timers = new Map();
  #onFire;
  #onError;
  #clock;

  /**
   * @param {object} options
   * @param {(correlationId: string) => Promise<void>} options.onFire - Invoked when the deadline passes.
   * @param {(err: Error, correlationId: string) => void} [options.onError] - Invoked when `onFire` rejects.
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [options.clock]
   */
  constructor({ onFire, onError = () => {}, clock }) {
    if (typeof onFire !== "function") throw new Error("onFire is required");
    if (!clock) throw new Error("clock is required");
    this.#onFire = onFire;
    this.#onError = onError;
    this.#clock = clock;
  }

  /** @returns {number} */
  get size() {
    return this.#timers.size;
  }

  /**
   * Schedule a timer that fires at `dueAt` (absolute ms epoch).
   * Replaces any existing timer for `correlationId`.
   *
   * @param {string} correlationId
   * @param {number} dueAt
   */
  schedule(correlationId, dueAt) {
    this.cancel(correlationId);
    const remaining = dueAt - this.#clock.now();
    if (remaining <= 0) {
      this.#fire(correlationId);
      return;
    }
    const delay = Math.min(remaining, CHUNK_CAP_MS);
    const timer = this.#clock.setTimeout(() => {
      this.#timers.delete(correlationId);
      if (remaining > CHUNK_CAP_MS) {
        this.schedule(correlationId, dueAt);
      } else {
        this.#fire(correlationId);
      }
    }, delay);
    timer.unref?.();
    this.#timers.set(correlationId, timer);
  }

  /**
   * Cancel the scheduled fire for `correlationId`. No-op if absent.
   * @param {string} correlationId
   */
  cancel(correlationId) {
    const timer = this.#timers.get(correlationId);
    if (timer) {
      this.#clock.clearTimeout(timer);
      this.#timers.delete(correlationId);
    }
  }

  /** Cancel every scheduled timer. */
  clear() {
    for (const timer of this.#timers.values()) this.#clock.clearTimeout(timer);
    this.#timers.clear();
  }

  #fire(correlationId) {
    this.#onFire(correlationId).catch((err) =>
      this.#onError(err, correlationId),
    );
  }
}
