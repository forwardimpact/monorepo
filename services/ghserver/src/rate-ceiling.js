/**
 * Per-tenant mint-rate ceiling.
 *
 * A sliding 60-second window of mint timestamps per `tenant_id`. The
 * window is kept in an in-process map — durability across restarts is
 * not required for a rate ceiling (a restart resets the window, which
 * fails open for at most one window and never blocks a legitimate
 * caller). Inject `{ clock }` so tests drive the window with a virtual
 * clock rather than wall time.
 */
export class RateCeiling {
  #clock;
  #limit;
  #windows = new Map();

  /**
   * @param {object} options
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
   *   Injected clock collaborator; `now()` drives the sliding window.
   * @param {number} options.limit - Maximum mints per tenant per 60s window.
   */
  constructor({ clock, limit }) {
    if (!clock) throw new Error("clock is required");
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer");
    }
    this.#clock = clock;
    this.#limit = limit;
  }

  /**
   * Record one mint for `tenant_id` at the current time.
   *
   * @param {string} tenant_id
   * @returns {void}
   */
  record(tenant_id) {
    const window = this.#prune(tenant_id);
    window.push(this.#clock.now());
  }

  /**
   * @param {string} tenant_id
   * @returns {boolean} True if `tenant_id` has reached the ceiling in
   *   the current 60-second window.
   */
  exceeds(tenant_id) {
    return this.#prune(tenant_id).length >= this.#limit;
  }

  /**
   * Drop timestamps older than 60 seconds and return the live window
   * array for `tenant_id` (created on first use).
   *
   * @param {string} tenant_id
   * @returns {number[]}
   */
  #prune(tenant_id) {
    const cutoff = this.#clock.now() - 60_000;
    let window = this.#windows.get(tenant_id);
    if (!window) {
      window = [];
      this.#windows.set(tenant_id, window);
      return window;
    }
    while (window.length > 0 && window[0] <= cutoff) {
      window.shift();
    }
    return window;
  }
}
