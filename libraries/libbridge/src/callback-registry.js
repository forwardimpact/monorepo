import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * In-memory registry of pending bridge → workflow callbacks. Hosts persist
 * the (token, correlationId) pairs through the discussion store, so a host
 * can rehydrate the registry after a restart. This class only owns the live
 * token → metadata map and the TTL sweep.
 *
 * Every entry is tenant-bound. `register` requires `meta.tenant_id` (single
 * tenant deployments pass `"default"`). `consume` and `peek` require the
 * caller's `tenant_id`. They return `null` when the stored value does not
 * match. That null shape is the one callers already handle for unknown
 * tokens.
 */
export class CallbackRegistry {
  #ttlMs;
  #clock;
  #entries = new Map();
  #sweepTimer = null;

  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs] - Time-to-live in ms (default: 2h)
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} [options.clock]
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, clock } = {}) {
    if (!clock) throw new Error("clock is required");
    this.#ttlMs = ttlMs;
    this.#clock = clock;
  }

  /** @returns {number} */
  get size() {
    return this.#entries.size;
  }

  /**
   * @param {string} correlationId
   * @param {object} meta - Caller-defined metadata. `meta.tenant_id` is required
   * @returns {string} The newly issued callback token
   */
  register(correlationId, meta) {
    if (typeof correlationId !== "string" || !correlationId) {
      throw new Error("correlationId is required");
    }
    if (!meta || typeof meta.tenant_id !== "string" || !meta.tenant_id) {
      throw new Error("meta.tenant_id is required");
    }
    const token = randomUUID();
    this.#entries.set(token, {
      correlationId,
      meta,
      createdAt: this.#clock.now(),
    });
    return token;
  }

  /**
   * Whether an entry's TTL elapsed. The lookup that observes an expired
   * entry drops it. A stale token is then no longer a credential, even
   * before a sweep runs.
   * @param {{createdAt: number}} entry
   * @param {number} now
   * @returns {boolean}
   */
  #expired(entry, now) {
    return now - entry.createdAt > this.#ttlMs;
  }

  /**
   * Atomic lookup + delete. Returns null when the token is unknown, expired,
   * or when the supplied `tenant_id` does not match the stored binding.
   * @param {string} token
   * @param {{tenant_id: string}} bind
   * @returns {{correlationId: string, meta: object, createdAt: number} | null}
   */
  consume(token, bind) {
    if (!bind || typeof bind.tenant_id !== "string" || !bind.tenant_id) {
      throw new Error("tenant_id is required");
    }
    const entry = this.#entries.get(token);
    if (!entry) return null;
    if (this.#expired(entry, this.#clock.now())) {
      this.#entries.delete(token);
      return null;
    }
    if (entry.meta.tenant_id !== bind.tenant_id) return null;
    this.#entries.delete(token);
    return entry;
  }

  /**
   * Returns a shallow clone of the stored metadata for a token. It does not
   * consume the token. Returns null on unknown token or `tenant_id`
   * mismatch. That shape matches `consume`, so callers handle one missing
   * case.
   * @param {string} token
   * @param {{tenant_id: string}} bind
   * @returns {{correlationId: string, meta: object, createdAt: number} | null}
   */
  peek(token, bind) {
    if (!bind || typeof bind.tenant_id !== "string" || !bind.tenant_id) {
      throw new Error("tenant_id is required");
    }
    const entry = this.#entries.get(token);
    if (!entry) return null;
    if (this.#expired(entry, this.#clock.now())) {
      this.#entries.delete(token);
      return null;
    }
    if (entry.meta.tenant_id !== bind.tenant_id) return null;
    return { ...entry };
  }

  /**
   * Return the bound `tenant_id` for any active token whose correlationId
   * matches. Return null if no active token binds the correlation. The
   * inbox route uses this to verify a path-supplied tenant against the
   * binding the dispatcher recorded. The method makes a single-pass scan of
   * the entries map. The registry holds one entry per in-flight dispatch
   * per bridge process.
   *
   * Scan-by-design (timing-parity). The bounded-n scan is acceptable only
   * while the caller preserves response-shape parity. A miss here and a
   * tenant mismatch must produce the same response. The inbox route
   * collapses both to 404 `Unknown correlation`, so timing or shape never
   * distinguishes "correlation unknown" from "correlation bound elsewhere".
   * @param {string} correlationId
   * @returns {string | null}
   */
  tenantOf(correlationId) {
    if (typeof correlationId !== "string" || !correlationId) return null;
    const now = this.#clock.now();
    for (const [token, entry] of this.#entries) {
      if (entry.correlationId !== correlationId) continue;
      if (this.#expired(entry, now)) {
        this.#entries.delete(token);
        continue;
      }
      return entry.meta.tenant_id;
    }
    return null;
  }

  /**
   * Drop entries older than ttlMs. The caller drives the clock so tests
   * stay deterministic.
   * @param {number} [now]
   * @returns {number} Number of entries evicted
   */
  sweep(now = this.#clock.now()) {
    let evicted = 0;
    for (const [token, entry] of this.#entries) {
      if (this.#expired(entry, now)) {
        this.#entries.delete(token);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Start the periodic sweep. The sweep reclaims tokens whose dispatch never
   * calls back, so they do not accumulate for the life of the process. This
   * method is idempotent. It unrefs the handle, so the timer never holds the
   * process open.
   * @param {number} [intervalMs]
   */
  startSweepTimer(intervalMs = DEFAULT_SWEEP_INTERVAL_MS) {
    if (this.#sweepTimer) return;
    this.#sweepTimer = this.#clock.setInterval(() => this.sweep(), intervalMs);
    this.#sweepTimer.unref?.();
  }

  /**
   * Stop the periodic sweep. Safe to call when no timer runs.
   */
  stopSweepTimer() {
    if (!this.#sweepTimer) return;
    this.#clock.clearInterval(this.#sweepTimer);
    this.#sweepTimer = null;
  }
}
