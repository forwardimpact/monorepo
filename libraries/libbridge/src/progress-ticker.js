const DEFAULT_INTERVAL_MS = 12_000;

/**
 * Channel-agnostic ticker. Hosts call `start(token, tick)` after dispatching
 * a workflow; `tick()` runs every `intervalMs` until the host calls
 * `stop(token)` or until `tick()` rejects (which auto-stops the ticker —
 * matching the legacy msteams ticker behaviour preserved in services/msbridge).
 *
 * Per-channel rendering (Teams typing activity, GitHub reaction) lives in
 * the adapter; this class only owns the timer lifecycle.
 */
export class ProgressTicker {
  #intervalMs;
  #timers = new Map();

  /**
   * @param {object} [options]
   * @param {number} [options.intervalMs] - Tick cadence in ms (default 12_000)
   */
  constructor({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.#intervalMs = intervalMs;
  }

  /** @returns {number} */
  get size() {
    return this.#timers.size;
  }

  /**
   * Start ticking for `token`. Replaces any existing ticker on the same
   * token. Errors thrown by `tick` are swallowed and stop the ticker.
   * @param {string} token
   * @param {() => Promise<void> | void} tick
   */
  start(token, tick) {
    if (typeof tick !== "function") {
      throw new Error("tick must be a function");
    }
    this.stop(token);
    const timer = setInterval(async () => {
      try {
        await tick();
      } catch {
        this.stop(token);
      }
    }, this.#intervalMs);
    timer.unref?.();
    this.#timers.set(token, timer);
  }

  /**
   * Stop ticking for `token`. No-op if the token has no active ticker.
   * @param {string} token
   */
  stop(token) {
    const timer = this.#timers.get(token);
    if (timer) {
      clearInterval(timer);
      this.#timers.delete(token);
    }
  }
}
