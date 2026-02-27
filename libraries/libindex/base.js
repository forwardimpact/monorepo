import { resource } from "@forwardimpact/libtype";

/**
 * @typedef {object} IndexInterface
 * @property {() => import("@forwardimpact/libstorage").StorageInterface} storage - Returns the storage instance
 * @property {(item: any) => Promise<void>} add - Adds an item to the index
 * @property {(ids: string[]) => Promise<any[]>} get - Gets items by array of IDs, returns array of items
 * @property {(id: string) => Promise<boolean>} has - Checks if an item exists in the index
 */

/**
 * Base class for index implementations providing shared filtering logic
 * @implements {IndexInterface}
 */
export class IndexBase {
  #storage;
  #indexKey;
  #index = new Map();
  #loaded = false;

  /**
   * Creates a new IndexBase instance
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage interface for data operations
   * @param {string} [indexKey] - The index file name to use for storage (default: "index.jsonl")
   */
  constructor(storage, indexKey = "index.jsonl") {
    if (!storage) throw new Error("storage is required");

    this.#storage = storage;
    this.#indexKey = indexKey;
  }

  /**
   * Gets the storage instance
   * @returns {import("@forwardimpact/libstorage").StorageInterface} Storage instance
   */
  storage() {
    return this.#storage;
  }

  /**
   * Gets the index key (filename)
   * @returns {string} The index key
   */
  get indexKey() {
    return this.#indexKey;
  }

  /**
   * Gets the internal index map
   * @returns {Map} The index map
   * @protected
   */
  get index() {
    return this.#index;
  }

  /**
   * Gets the loaded state
   * @returns {boolean} True if index is loaded
   * @protected
   */
  get loaded() {
    return this.#loaded;
  }

  /**
   * Sets the loaded state
   * @param {boolean} value - Loaded state to set
   * @protected
   */
  set loaded(value) {
    this.#loaded = value;
  }

  /**
   * Applies prefix filter to items during query iteration
   * @param {string} id - The id to check
   * @param {string} prefix - The prefix to match
   * @returns {boolean} True if item should be included
   * @protected
   */
  _applyPrefixFilter(id, prefix) {
    if (!prefix) return true;
    return id.startsWith(prefix);
  }

  /**
   * Applies limit filter to results
   * @param {import("@forwardimpact/libtype").resource.Identifier[]} results - Array of results to filter
   * @param {number} limit - Maximum number of results
   * @returns {import("@forwardimpact/libtype").resource.Identifier[]} Filtered results
   * @protected
   */
  _applyLimitFilter(results, limit) {
    if (!limit || limit <= 0) return results;
    return results.slice(0, limit);
  }

  /**
   * Applies max_tokens filter to results
   * @param {import("@forwardimpact/libtype").resource.Identifier[]} results - Array of results to filter
   * @param {number} max_tokens - Maximum total tokens allowed
   * @returns {import("@forwardimpact/libtype").resource.Identifier[]} Filtered results
   * @protected
   */
  _applyTokensFilter(results, max_tokens) {
    if (!max_tokens || max_tokens <= 0) return results;

    const filtered = [];
    let total = 0;

    for (const identifier of results) {
      if (identifier.tokens === undefined || identifier.tokens === null) {
        throw new Error(
          `Identifier missing tokens field: ${JSON.stringify(identifier)}`,
        );
      }

      if (total + identifier.tokens > max_tokens) break;

      total += identifier.tokens;
      filtered.push(identifier);
    }

    return filtered;
  }

  /**
   * Gets items by their IDs
   * @param {string[]|null} ids - Array of IDs, or null
   * @returns {Promise<import("@forwardimpact/libtype").resource.Identifier[]>} Array of identifiers
   */
  async get(ids) {
    if (!this.#loaded) await this.loadData();

    // Handle null/undefined
    if (ids === null || ids === undefined) return [];
    if (!Array.isArray(ids)) throw new Error("ids must be an array or null");
    if (ids.length === 0) return [];

    const results = [];
    for (const id of ids) {
      const item = this.#index.get(id);
      if (item?.identifier) {
        results.push(item.identifier);
      }
    }
    return results;
  }

  /**
   * Checks if an item with the given ID exists in the index
   * @param {string} id - The ID to check for
   * @returns {Promise<boolean>} True if item exists, false otherwise
   */
  async has(id) {
    if (!this.#loaded) await this.loadData();
    return this.#index.has(id);
  }

  /**
   * Loads data from storage with common logic for all index types
   * Subclasses can override this method to add type-specific processing
   * @returns {Promise<void>}
   */
  async loadData() {
    // Check if already loaded to make this method idempotent
    if (this.#loaded) return;

    if (!(await this.#storage.exists(this.#indexKey))) {
      // Initialize empty index for new systems
      this.#index.clear();
      this.#loaded = true;
      return;
    }

    // Storage automatically parses .jsonl files into arrays
    const items = await this.#storage.get(this.#indexKey);

    // Populate the memory index
    this.#index.clear();
    for (const item of items) {
      // Reconstruct identifier as proper protobuf object if present
      if (item.identifier && typeof item.identifier === "object") {
        item.identifier = resource.Identifier.fromObject(item.identifier);
        // Recalculate the id using the proper toString() method
        item.id = String(item.identifier);
      }
      this.#index.set(item.id, item);
    }

    this.#loaded = true;
  }

  /**
   * Adds an item to the index with generic storage operations
   * Subclasses should override this to create their specific item structure,
   * then call super.add(item) to handle storage
   * @param {object} item - The item object with required and optional properties
   * @param {string} item.id - Unique string identifier for the item (used as Map key)
   * @param {import("@forwardimpact/libtype").resource.Identifier} item.identifier - Resource identifier object
   * @returns {Promise<void>}
   */
  async add(item) {
    if (!this.#loaded) await this.loadData();

    // Store item in memory
    this.#index.set(item.id, item);

    // Append item to storage on disk
    await this.#storage.append(this.#indexKey, JSON.stringify(item));
  }

  /**
   * Queries items from the index using basic filtering
   * Provides a default implementation that applies shared filters to all items
   * Subclasses can override this for more sophisticated query logic
   * @param {import("@forwardimpact/libtype").tool.QueryFilter} filter - Filter object for query constraints
   * @returns {Promise<import("@forwardimpact/libtype").resource.Identifier[]>} Array of resource identifiers
   */
  async queryItems(filter = {}) {
    if (!this.#loaded) await this.loadData();

    const { prefix, limit, max_tokens } = filter;
    const identifiers = [];

    // Loop through all index values and collect identifiers
    for (const item of this.#index.values()) {
      if (!this._applyPrefixFilter(item.id, prefix)) continue;

      // Add the identifier to results
      const identifier = item.identifier;
      if (identifier) {
        identifiers.push(identifier);
      }
    }

    // Apply shared filters
    let results = this._applyLimitFilter(identifiers, limit);
    results = this._applyTokensFilter(results, max_tokens);

    return results;
  }
}
