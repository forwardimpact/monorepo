import { createStorage } from "@forwardimpact/libstorage";

/**
 * Simple policy engine that returns static "allow" for all requests
 * Future versions will integrate with @openpolicyagent/opa-wasm
 */
export class Policy {
  #storage;

  /**
   * Creates a new Policy instance
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage backend for policy loading
   */
  constructor(storage) {
    if (!storage) {
      throw new Error("storage is required");
    }
    this.#storage = storage;
  }

  /**
   * Initialize policy engine and load policies from storage
   * @returns {Promise<void>}
   */
  async load() {
    // TODO: Future implementation will load policies from storage
    // Check if storage is available for future policy loading
    await this.#storage.bucketExists();
  }

  /**
   * Evaluate policy for given input parameters
   * @param {object} input - Policy evaluation input
   * @param {string} input.actor - Actor identifier (URI format)
   * @param {string[]} input.resources - Array of resource identifiers (URI format)
   * @returns {Promise<boolean>} True if access is allowed, false otherwise
   */
  async evaluate(input) {
    if (!input) {
      throw new Error("input is required");
    }
    if (!input.actor || typeof input.actor !== "string") {
      throw new Error("input.actor must be a non-empty string");
    }
    if (!Array.isArray(input.resources)) {
      throw new Error("input.resources must be an array");
    }

    // Static allow for initial implementation
    // TODO: Future implementation will use @openpolicyagent/opa-wasm
    return true;
  }
}

/**
 * Creates a new policy instance
 * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Optional storage backend for policy loading
 * @returns {Policy} New Policy instance
 */
export function createPolicy(storage = null) {
  const storageBackend = storage || createStorage("policies");
  return new Policy(storageBackend);
}
