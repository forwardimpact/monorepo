import { BufferedIndex } from "@forwardimpact/libindex";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Durable store for `(surface, surface_user_id)` ↔ GitHub token bindings.
 * @augments BufferedIndex
 */
export class BindingStore extends BufferedIndex {
  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   * @param {string} [options.indexKey]
   */
  constructor(storage, { indexKey = "bindings.jsonl" } = {}) {
    super(storage, indexKey, { flush_interval: 5_000, max_buffer_size: 100 });
  }

  /**
   * @param {string} surface
   * @param {string} userId
   * @returns {string}
   */
  static keyOf(surface, userId) {
    return `${surface}:${userId}`;
  }

  /**
   * @returns {Promise<void>}
   */
  async loadData() {
    await super.loadData();
    for (const [id, record] of this.index) {
      if (record.deleted) this.index.delete(id);
    }
  }

  /**
   * @param {string} surface
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async loadBinding(surface, userId) {
    if (!this.loaded) await this.loadData();
    return this.index.get(BindingStore.keyOf(surface, userId)) ?? null;
  }

  /**
   * @param {object} record
   * @returns {Promise<void>}
   */
  async upsert(record) {
    await this.add(record);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    this.index.delete(id);
    await this.add({ id, deleted: true });
  }
}

/**
 * Short-TTL store with periodic sweep, mirroring DiscussionContextStore.
 * @augments BufferedIndex
 */
class TtlStore extends BufferedIndex {
  #ttlMs;
  #sweepTimer;

  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {string} indexKey
   * @param {object} [options]
   * @param {number} [options.ttlMs]
   * @param {number} [options.sweepIntervalMs]
   */
  constructor(
    storage,
    indexKey,
    {
      ttlMs = DEFAULT_TTL_MS,
      sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
    } = {},
  ) {
    super(storage, indexKey, { flush_interval: 1_000, max_buffer_size: 100 });
    this.#ttlMs = ttlMs;
    this.#sweepTimer = setInterval(
      () => this.#sweep(Date.now()),
      sweepIntervalMs,
    );
    this.#sweepTimer.unref();
  }

  /** Stop the periodic sweep timer. */
  stopSweep() {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.stopSweep();
    await super.shutdown();
  }

  /**
   * @param {number} now
   * @returns {number}
   */
  sweepNow(now) {
    return this.#sweep(now);
  }

  #sweep(now) {
    let evicted = 0;
    for (const [id, record] of this.index) {
      if (now - (record?.created_at ?? 0) > this.#ttlMs) {
        this.index.delete(id);
        evicted++;
      }
    }
    return evicted;
  }
}

/**
 * Pending authorization flows keyed by outer `state`.
 * @augments TtlStore
 */
export class FlowStore extends TtlStore {
  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   */
  constructor(storage, options) {
    super(storage, "flows.jsonl", options);
  }

  /**
   * @returns {Promise<void>}
   */
  async loadData() {
    await super.loadData();
    for (const [id, record] of this.index) {
      if (record.deleted) this.index.delete(id);
    }
  }

  /**
   * @param {string} state
   * @returns {Promise<object|null>}
   */
  async loadFlow(state) {
    if (!this.loaded) await this.loadData();
    return this.index.get(state) ?? null;
  }

  /**
   * @param {string} state
   * @returns {Promise<object|null>}
   */
  async consume(state) {
    if (!this.loaded) await this.loadData();
    const flow = this.index.get(state);
    if (!flow) return null;
    this.index.delete(state);
    await this.add({ id: state, deleted: true });
    return flow;
  }
}

/**
 * Issued downstream codes keyed by `downstream_code`, consumed once.
 * @augments TtlStore
 */
export class GrantStore extends TtlStore {
  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   */
  constructor(storage, options) {
    super(storage, "grants.jsonl", options);
  }

  /**
   * @returns {Promise<void>}
   */
  async loadData() {
    await super.loadData();
    for (const [id, record] of this.index) {
      if (record.deleted) this.index.delete(id);
    }
  }

  /**
   * @param {string} code
   * @returns {Promise<object|null>}
   */
  async consume(code) {
    if (!this.loaded) await this.loadData();
    const grant = this.index.get(code);
    if (!grant) return null;
    this.index.delete(code);
    await this.add({ id: code, deleted: true });
    return grant;
  }
}
