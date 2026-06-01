/**
 * ProseCache — synchronous prose cache backed by a JSON file on disk.
 *
 * Holds the cache map and exposes a sync read surface so callers can
 * decide what to do on hit/miss without paying for a microtask.
 *
 * On-disk format is a flat object keyed by entity key, with a top-level
 * `_schema` field. Bumping `_schema` invalidates the whole file; per-key
 * context drift is the caller's responsibility (re-run `generate`).
 *
 * @module libsyntheticprose/engine/cache
 */

const SCHEMA_VERSION = 1;
const SCHEMA_FIELD = "_schema";

/** Synchronous prose cache backed by a versioned JSON file on disk. */
export class ProseCache {
  #fsSync;

  /**
   * @param {object} options
   * @param {string} options.cachePath - Path to prose cache JSON file
   * @param {object} options.logger - Logger instance
   * @param {object} [options.runtime] - Runtime collaborator bag
   */
  constructor({ cachePath, logger, runtime }) {
    if (!cachePath) throw new Error("cachePath is required");
    if (!logger) throw new Error("logger is required");
    const { fsSync } = runtime;
    this.cachePath = cachePath;
    this.logger = logger;
    this.#fsSync = fsSync;
    this.entries = this.#load();
    this.dirty = false;
    this.stats = { hits: 0, misses: 0, missKeys: new Set() };
  }

  /**
   * @param {string} key
   * @returns {string | undefined}
   */
  get(key) {
    if (this.entries.has(key)) {
      this.stats.hits++;
      return this.entries.get(key);
    }
    this.stats.misses++;
    this.stats.missKeys.add(key);
    return undefined;
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.entries.has(key);
  }

  /**
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.entries.keys();
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    this.entries.set(key, value);
    this.dirty = true;
  }

  /** Write dirty cache entries to disk as deterministically-sorted JSON. */
  save() {
    if (!this.dirty) return;
    const payload = { [SCHEMA_FIELD]: SCHEMA_VERSION };
    // Sort keys so the on-disk file is stable across regeneration runs
    // and diffs review cleanly.
    for (const key of [...this.entries.keys()].sort()) {
      payload[key] = this.entries.get(key);
    }
    this.#fsSync.writeFileSync(
      this.cachePath,
      JSON.stringify(payload, null, 2),
    );
    this.dirty = false;
  }

  #parseEntries(parsed) {
    const entries = new Map();
    let dropped = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (key === SCHEMA_FIELD) continue;
      // Drop legacy structured entries (8-char hex with no entity
      // prefix) — superseded by `${entityKey}#${hash}` format.
      if (/^[a-f0-9]{8}$/.test(key)) {
        dropped++;
        continue;
      }
      entries.set(key, value);
    }
    if (dropped > 0) {
      this.dirty = true;
      this.logger.info(
        "prose-cache",
        `Dropped ${dropped} legacy hash-only cache entries`,
      );
    }
    return entries;
  }

  #load() {
    try {
      if (!this.#fsSync.existsSync(this.cachePath)) return new Map();

      const parsed = JSON.parse(
        this.#fsSync.readFileSync(this.cachePath, "utf-8"),
      );
      const schema = parsed?.[SCHEMA_FIELD];
      if (schema !== undefined && schema !== SCHEMA_VERSION) {
        this.logger.info(
          "prose-cache",
          `Cache schema mismatch (file=${schema}, expected=${SCHEMA_VERSION}); discarding`,
        );
        return new Map();
      }
      return this.#parseEntries(parsed);
    } catch {
      /* cache corrupt or missing */
    }
    return new Map();
  }
}
