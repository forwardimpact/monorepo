import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * In-memory registry of pending bridge → workflow callbacks. Hosts persist
 * the (token, correlationId) pairs via the discussion store so the registry
 * can be rehydrated after a restart; this class only owns the live token →
 * metadata mapping and TTL sweep.
 *
 * Every entry is tenant-bound. `register` requires `meta.tenant_id` (single
 * tenant deployments pass `"default"`); `consume` and `peek` require the
 * caller's `tenant_id` and return `null` when the stored value does not
 * match — the same null shape callers already handle for unknown tokens.
 */
export class CallbackRegistry {
  #ttlMs;
  #clock;
  #entries = new Map();

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
   * @param {object} meta - Caller-defined metadata; `meta.tenant_id` is required
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
   * Atomic lookup + delete. Returns null when the token is unknown or when
   * the supplied `tenant_id` does not match the stored binding.
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
    if (entry.meta.tenant_id !== bind.tenant_id) return null;
    this.#entries.delete(token);
    return entry;
  }

  /**
   * Returns a shallow clone of the stored metadata for a token without
   * consuming it. Returns null on unknown token or `tenant_id` mismatch —
   * matching `consume`'s shape so callers handle one missing case.
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
    if (entry.meta.tenant_id !== bind.tenant_id) return null;
    return { ...entry };
  }

  /**
   * Drop entries older than ttlMs. Caller drives the clock so tests stay
   * deterministic.
   * @param {number} [now]
   * @returns {number} Number of entries evicted
   */
  sweep(now = this.#clock.now()) {
    let evicted = 0;
    for (const [token, entry] of this.#entries) {
      if (now - entry.createdAt > this.#ttlMs) {
        this.#entries.delete(token);
        evicted++;
      }
    }
    return evicted;
  }
}
