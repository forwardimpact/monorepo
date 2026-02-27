import { services } from "@forwardimpact/librpc";
import { MemoryWindow } from "@forwardimpact/libmemory";
import { MemoryIndex } from "@forwardimpact/libmemory/index/memory.js";

const { MemoryBase } = services;

/**
 * Memory service for managing transient resources and memory windows
 */
export class MemoryService extends MemoryBase {
  #storage;
  #resourceIndex;
  #indices = new Map();
  #maxTokens;

  /**
   * Creates a new Memory service instance
   * @param {import("@forwardimpact/libconfig").ServiceConfigInterface} config - Service configuration object
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage instance for memories
   * @param {import("@forwardimpact/libresource").ResourceIndex} resourceIndex - Resource index for loading resources
   */
  constructor(config, storage, resourceIndex) {
    super(config);
    if (!storage) throw new Error("storage is required");
    if (!resourceIndex) throw new Error("resourceIndex is required");

    this.#storage = storage;
    this.#resourceIndex = resourceIndex;
    this.#maxTokens = config.max_tokens;
    if (!this.#maxTokens || this.#maxTokens <= 0) {
      throw new Error("config.max_tokens is required and must be positive");
    }
  }

  /**
   * Gets (and creates if necessary) the MemoryIndex for a specific resource
   * @param {string} id - Resource ID
   * @returns {MemoryIndex} MemoryIndex instance for the resource
   * @private
   */
  #getMemoryIndex(id) {
    if (!this.#indices.has(id)) {
      const key = `${id}.jsonl`;
      const index = new MemoryIndex(this.#storage, key);
      this.#indices.set(id, index);
    }
    return this.#indices.get(id);
  }

  /** @inheritdoc */
  async AppendMemory(req) {
    if (!req.resource_id) throw new Error("resource_id is required");

    const memoryIndex = this.#getMemoryIndex(req.resource_id);
    const window = new MemoryWindow(
      req.resource_id,
      this.#resourceIndex,
      memoryIndex,
    );

    if (req.identifiers && req.identifiers.length > 0) {
      await window.append(req.identifiers);
    }

    return { accepted: req.resource_id };
  }

  /** @inheritdoc */
  async GetWindow(req) {
    if (!req.resource_id) throw new Error("resource_id is required");
    if (!req.model) throw new Error("model is required");

    const memoryIndex = this.#getMemoryIndex(req.resource_id);
    const window = new MemoryWindow(
      req.resource_id,
      this.#resourceIndex,
      memoryIndex,
    );
    const { messages, tools } = await window.build(req.model, this.#maxTokens);

    return { messages, tools, max_tokens: this.#maxTokens };
  }
}
