import { randomUUID } from "node:crypto";

import { createDefaultClock } from "@forwardimpact/libutil/runtime";

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * In-memory registry of pending bridge → workflow callbacks. Hosts persist
 * the (token, correlationId) pairs via the discussion store so the registry
 * can be rehydrated after a restart; this class only owns the live token →
 * metadata mapping and TTL sweep.
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
  constructor({ ttlMs = DEFAULT_TTL_MS, clock = createDefaultClock() } = {}) {
    this.#ttlMs = ttlMs;
    this.#clock = clock;
  }

  /** @returns {number} */
  get size() {
    return this.#entries.size;
  }

  /**
   * @param {string} correlationId
   * @param {object} [meta] - Caller-defined metadata stored alongside the token
   * @returns {string} The newly issued callback token
   */
  register(correlationId, meta = {}) {
    if (typeof correlationId !== "string" || !correlationId) {
      throw new Error("correlationId is required");
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
   * Atomic lookup + delete. Returns null if the token is unknown.
   * @param {string} token
   * @returns {{correlationId: string, meta: object, createdAt: number} | null}
   */
  consume(token) {
    const entry = this.#entries.get(token);
    if (!entry) return null;
    this.#entries.delete(token);
    return entry;
  }

  /**
   * Returns a shallow clone of the stored metadata for a token without
   * consuming it. Cloning prevents callers from corrupting internal state
   * via the returned reference; diagnostic code paths that need to read
   * `correlationId`, `meta`, or `createdAt` work unchanged.
   * @param {string} token
   * @returns {{correlationId: string, meta: object, createdAt: number} | null}
   */
  peek(token) {
    const entry = this.#entries.get(token);
    if (!entry) return null;
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
