import { IndexBase } from "./base.js";

/**
 * Buffered index for high-volume writes with a periodic flush
 * Extends IndexBase to provide batched storage operations
 * @augments IndexBase
 */
export class BufferedIndex extends IndexBase {
  #buffer = [];
  #flushTimer = null;
  #flushInterval;
  #maxBufferSize;
  #clock;

  /**
   * Creates a new BufferedIndex instance
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage interface
   * @param {string} indexKey - Index file name
   * @param {object} config - Buffer configuration
   * @param {number} [config.flush_interval] - Flush interval in milliseconds (default: 5000)
   * @param {number} [config.max_buffer_size] - Max items before forced flush (default: 1000)
   * @param {object} deps - Injected collaborators
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock -
   *   Injected clock collaborator (the only runtime surface BufferedIndex uses).
   */
  constructor(storage, indexKey, config = {}, { clock } = {}) {
    super(storage, indexKey);
    if (!clock) throw new Error("clock is required");
    this.#flushInterval = config.flush_interval || 5000;
    this.#maxBufferSize = config.max_buffer_size || 1000;
    this.#clock = clock;
  }

  /**
   * Adds an item to the buffer instead of immediate storage
   * @param {object} item - Item to add
   * @returns {Promise<void>}
   */
  async add(item) {
    if (!this.loaded) await this.loadData();

    // Add to the in-memory index immediately for queries
    this.index.set(item.id, item);

    // Buffer for batch write
    this.#buffer.push(item);

    // Check if a forced flush is needed
    if (this.#buffer.length >= this.#maxBufferSize) {
      await this.flush();
      return;
    }

    // Schedule a periodic flush
    if (!this.#flushTimer) {
      this.#flushTimer = this.#clock.setTimeout(
        () => this.flush(),
        this.#flushInterval,
      );
    }
  }

  /**
   * Flushes buffered items to storage
   * @returns {Promise<number>} Number of items flushed
   */
  async flush() {
    if (this.#flushTimer) {
      this.#clock.clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }

    if (this.#buffer.length === 0) return 0;

    const batch = this.#buffer.splice(0);
    const batchData =
      batch.map((item) => JSON.stringify(item)).join("\n") + "\n";

    await this.storage().append(this.indexKey, batchData);

    return batch.length;
  }

  /**
   * Compaction on a buffered index drains the in-memory write buffer to
   * storage first (so any post-buffer state is observable on disk). It then
   * replaces the persisted file with the live in-memory set.
   * @returns {Promise<void>}
   */
  async compact() {
    await this.flush();
    await super.compact();
  }

  /**
   * Shuts down the index. Flushes the remaining buffer and clears the timer
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.flush();
  }
}
