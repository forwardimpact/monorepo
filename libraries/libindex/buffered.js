import { IndexBase } from "./base.js";

/**
 * Buffered index for high-volume writes with periodic flushing
 * Extends IndexBase to provide batched storage operations
 * @augments IndexBase
 */
export class BufferedIndex extends IndexBase {
  #buffer = [];
  #flushTimer = null;
  #flushInterval;
  #maxBufferSize;

  /**
   * Creates a new BufferedIndex instance
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage interface
   * @param {string} indexKey - Index file name
   * @param {object} config - Buffer configuration
   * @param {number} [config.flush_interval] - Flush interval in milliseconds (default: 5000)
   * @param {number} [config.max_buffer_size] - Max items before forced flush (default: 1000)
   */
  constructor(storage, indexKey, config = {}) {
    super(storage, indexKey);
    this.#flushInterval = config.flush_interval || 5000;
    this.#maxBufferSize = config.max_buffer_size || 1000;
  }

  /**
   * Adds item to buffer instead of immediate storage
   * @param {object} item - Item to add
   * @returns {Promise<void>}
   */
  async add(item) {
    if (!this.loaded) await this.loadData();

    // Add to in-memory index immediately for queries
    this.index.set(item.id, item);

    // Buffer for batch write
    this.#buffer.push(item);

    // Check if forced flush needed
    if (this.#buffer.length >= this.#maxBufferSize) {
      await this.flush();
      return;
    }

    // Schedule periodic flush
    if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => this.flush(), this.#flushInterval);
    }
  }

  /**
   * Flushes buffered items to storage
   * @returns {Promise<number>} Number of items flushed
   */
  async flush() {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
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
   * Shuts down the index by flushing remaining buffer and clearing timer
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.flush();
  }
}
