import { IndexBase } from "@forwardimpact/libindex";

/**
 * Memory index for managing conversation memory using JSONL storage
 * Extends IndexBase to provide memory-specific operations with deduplication
 * Each instance manages memory for a single resource/conversation
 * @implements {import("@forwardimpact/libindex").IndexInterface}
 */
export class MemoryIndex extends IndexBase {
  /**
   * Adds identifiers to memory in a single storage operation
   * @param {import("@forwardimpact/libtype").resource.Identifier[]} identifiers - Identifiers to add
   * @returns {Promise<void>}
   */
  async add(identifiers) {
    if (!identifiers || identifiers.length === 0) return;
    if (!this.loaded) await this.loadData();

    // Build items for index and storage
    const items = identifiers.map((identifier) => ({
      id: String(identifier),
      identifier,
    }));

    // Update in-memory index
    for (const item of items) {
      this.index.set(item.id, item);
    }

    // Single append to storage with all items
    const lines = items.map((item) => JSON.stringify(item)).join("\n");
    await this.storage().append(this.indexKey, lines);
  }
}
