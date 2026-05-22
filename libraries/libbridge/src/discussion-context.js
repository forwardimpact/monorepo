import { BufferedIndex } from "@forwardimpact/libindex";

const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_MAX_BUFFER_SIZE = 1_000;
const DEFAULT_CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Persisted thread state keyed by `(channel, discussion_id)`. Both
 * `services/ghbridge` and `services/msbridge` write into the same store so
 * the channel-agnostic `kata-dispatch.yml` workflow can resume conversations
 * from either side.
 *
 * Record shape:
 *   {
 *     id: "<channel>:<discussion_id>",
 *     channel: "github-discussions" | "msteams",
 *     discussion_id: string,
 *     history: Array<{role: "user"|"assistant", text: string}>,
 *     participants: Array<{name, kind: "agent"|"human", external_id?, metadata?}>,
 *     open_rfcs: Record<correlationId, {trigger, opened_at, history_index_at_open}>,
 *     lead: string,
 *     pending_callbacks: Record<token, correlationId>,
 *     last_active_at: number,
 *   }
 *
 * @augments BufferedIndex
 */
export class DiscussionContextStore extends BufferedIndex {
  #conversationTtlMs;
  #sweepTimer;

  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   * @param {string} [options.indexKey] - JSONL file name (default `discussions.jsonl`)
   * @param {number} [options.flushIntervalMs]
   * @param {number} [options.maxBufferSize]
   * @param {number} [options.conversationTtlMs] - Eviction window (default 24h)
   * @param {number} [options.sweepIntervalMs] - Sweep cadence (default 60s)
   */
  constructor(
    storage,
    {
      indexKey = "discussions.jsonl",
      flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
      maxBufferSize = DEFAULT_MAX_BUFFER_SIZE,
      conversationTtlMs = DEFAULT_CONVERSATION_TTL_MS,
      sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
    } = {},
  ) {
    super(storage, indexKey, {
      flush_interval: flushIntervalMs,
      max_buffer_size: maxBufferSize,
    });
    this.#conversationTtlMs = conversationTtlMs;
    this.#sweepTimer = setInterval(
      () => this.#sweep(Date.now()),
      sweepIntervalMs,
    );
    this.#sweepTimer.unref();
  }

  /**
   * Compose the `id` field for a `(channel, discussion_id)` pair.
   * @param {string} channel
   * @param {string} discussionId
   * @returns {string}
   */
  static keyOf(channel, discussionId) {
    return `${channel}:${discussionId}`;
  }

  /**
   * @param {string} channel
   * @param {string} discussionId
   * @returns {Promise<object | null>}
   */
  async loadByChannel(channel, discussionId) {
    if (!this.loaded) await this.loadData();
    const id = DiscussionContextStore.keyOf(channel, discussionId);
    return this.index.get(id) ?? null;
  }

  /**
   * Stop the periodic sweep timer. Called on host shutdown alongside
   * `shutdown()` to release the interval.
   */
  stopSweep() {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
  }

  /**
   * Flush buffered writes and stop the sweep timer.
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.stopSweep();
    await super.shutdown();
  }

  /**
   * Evict records whose `last_active_at` is older than `conversationTtlMs`.
   * Caller-driven `now` keeps unit tests deterministic.
   * @param {number} now
   * @returns {number}
   */
  sweepNow(now) {
    return this.#sweep(now);
  }

  #sweep(now) {
    let evicted = 0;
    for (const [id, record] of this.index) {
      const lastActive = record?.last_active_at ?? 0;
      if (now - lastActive > this.#conversationTtlMs) {
        this.index.delete(id);
        evicted++;
      }
    }
    return evicted;
  }
}
