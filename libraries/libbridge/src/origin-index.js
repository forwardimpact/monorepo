import { BufferedIndex } from "@forwardimpact/libindex";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Tracks comment IDs posted by the bridge so webhook handlers can skip
 * dispatching for self-originated events. Wraps `BufferedIndex` with
 * caller-injected `StorageInterface` per the libbridge invariant.
 *
 * Record shape: `{ id: "<comment_node_id>", discussion_id, posted_at }`
 *
 * @augments BufferedIndex
 */
export class OriginIndex extends BufferedIndex {
  #ttlMs;

  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   * @param {string} [options.indexKey]
   * @param {number} [options.ttlMs] - Eviction window (default 24h)
   */
  constructor(
    storage,
    { indexKey = "origins.jsonl", ttlMs = DEFAULT_TTL_MS } = {},
  ) {
    super(storage, indexKey, {
      flush_interval: 1_000,
      max_buffer_size: 100,
    });
    this.#ttlMs = ttlMs;
  }

  /**
   * Evict records older than `ttlMs`.
   * @param {number} now
   * @returns {number} count evicted
   */
  sweep(now) {
    let evicted = 0;
    for (const [id, record] of this.index) {
      if (now - (record?.posted_at ?? 0) > this.#ttlMs) {
        this.index.delete(id);
        evicted++;
      }
    }
    return evicted;
  }
}
