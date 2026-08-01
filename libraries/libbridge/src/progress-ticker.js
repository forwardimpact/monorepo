const DEFAULT_INTERVAL_MS = 25_000;

/**
 * Channel-agnostic ticker. Hosts call `start(token, tick)` after they
 * dispatch a workflow. `tick()` runs every `intervalMs` until the host calls
 * `stop(token)` or until `tick()` rejects. A rejection stops the ticker
 * automatically. This matches the legacy msteams ticker behaviour that
 * services/msbridge keeps.
 *
 * The adapter owns what each channel shows (Teams typing activity, GitHub
 * reaction). This class owns only the timer lifecycle.
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
   * Start the ticker for `token`. Replaces any existing ticker on the same
   * token. The ticker swallows an error from `tick` and then stops.
   * @param {string} token
   * @param {() => Promise<void> | void} tick
   */
  start(token, tick) {
    if (typeof tick !== "function") {
      throw new Error("tick must be a function");
    }
    this.stop(token);
    const safeTick = async () => {
      try {
        await tick();
      } catch {
        this.stop(token);
      }
    };
    const timer = setInterval(safeTick, this.#intervalMs);
    timer.unref?.();
    this.#timers.set(token, timer);
    safeTick();
  }

  /**
   * Stop the ticker for `token`. Does nothing if the token has no active
   * ticker.
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
