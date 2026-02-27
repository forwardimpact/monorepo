import { dirname, join } from "path";

import {
  fromJsonLines,
  fromJson,
  toJsonLines,
  toJson,
  isJsonLines,
  isJson,
} from "./index.js";

/**
 * @typedef {import('./index.js').StorageInterface} StorageInterface
 */

/**
 * Local filesystem storage implementation
 * @implements {StorageInterface}
 */
export class LocalStorage {
  #prefix;
  #fs;

  /**
   * Creates a new LocalStorage instance
   * @param {string} prefix - Base path for all storage operations
   * @param {object} fs - File system operations object
   */
  constructor(prefix, fs) {
    this.#prefix = prefix;
    this.#fs = fs;
  }

  // Core CRUD Operations

  /**
   * Store data with the given key
   * @param {string} key - Storage key identifier
   * @param {string|Buffer|object} data - Data to store
   * @returns {Promise<void>}
   */
  async put(key, data) {
    const fullPath = this.path(key);
    const dirToCreate = dirname(fullPath);
    let serializedData = data;

    // Serialize JavaScript objects back to their appropriate format for storage
    if (isJsonLines(key, data)) {
      serializedData = toJsonLines(data);
    } else if (isJson(key, data)) {
      serializedData = toJson(data);
    }

    await this.#fs.mkdir(dirToCreate, { recursive: true });
    await this.#fs.writeFile(fullPath, serializedData);
  }

  /**
   * Retrieve data by key
   * @param {string} key - Storage key identifier
   * @returns {Promise<any>} Retrieved data
   */
  async get(key) {
    const content = await this.#fs.readFile(this.path(key));

    // Parse JSON Lines format if file has .jsonl extension
    if (key.endsWith(".jsonl")) {
      return fromJsonLines(content);
    }

    // Parse JSON format if file has .json extension
    if (key.endsWith(".json")) {
      return fromJson(content);
    }

    return content;
  }

  /**
   * Remove data by key
   * @param {string} key - Storage key identifier
   * @returns {Promise<void>}
   */
  async delete(key) {
    await this.#fs.unlink(this.path(key));
  }

  /**
   * Check if key exists
   * @param {string} key - Storage key identifier
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    try {
      await this.#fs.access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  // Advanced Operations

  /**
   * Append data to an existing key with automatic newline
   * @param {string} key - Storage key identifier
   * @param {string|Buffer} data - Data to append
   * @returns {Promise<void>}
   */
  async append(key, data) {
    const fullPath = this.path(key);
    const dirToCreate = dirname(fullPath);

    await this.#fs.mkdir(dirToCreate, { recursive: true });

    // Always append with newline for JSON-ND format consistency
    const dataWithNewline = data.toString().endsWith("\n") ? data : data + "\n";
    await this.#fs.appendFile(fullPath, dataWithNewline);
  }

  /**
   * Retrieve multiple items by their keys
   * @param {string[]} keys - Array of storage key identifiers
   * @returns {Promise<object>} Object with key-value pairs
   */
  async getMany(keys) {
    const results = {};
    await Promise.all(
      keys.map(async (key) => {
        try {
          const data = await this.get(key);
          results[key] = data;
        } catch (error) {
          // If key doesn't exist, skip it (don't add to results)
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      }),
    );
    return results;
  }

  // Search and Listing Operations

  /**
   * Lists all keys in storage
   * @returns {Promise<string[]>} Array of keys
   */
  async list() {
    return await this.#traverse();
  }

  /**
   * Find keys with specified prefix
   * @param {string} prefix - Key prefix to match
   * @param {string} [delimiter] - Optional delimiter to group results by directory-like segments
   * @returns {Promise<string[]>} Array of matching keys
   */
  async findByPrefix(prefix, delimiter = "") {
    const keys = await this.#traverse((filename) =>
      filename.startsWith(prefix),
    );
    if (delimiter) {
      // Group keys by delimiter, return unique prefixes
      const groups = new Set();
      for (const key of keys) {
        const idx = key.indexOf(delimiter, prefix.length);
        if (idx !== -1) {
          groups.add(key.slice(0, idx + 1));
        } else {
          groups.add(key);
        }
      }
      return Array.from(groups);
    }
    return keys;
  }

  /**
   * Find keys with specified extension
   * @param {string} extension - File extension to search for
   * @returns {Promise<string[]>} Array of keys with the extension
   */
  async findByExtension(extension) {
    return await this.#traverse((filename) => filename.endsWith(extension));
  }

  // Path Utilities

  /**
   * Gets the full file path for a storage key
   * @param {string} key - Storage key identifier
   * @returns {string} Full file path
   */
  path(key = ".") {
    if (key.startsWith("/")) {
      return key; // Use absolute path directly for local filesystem
    }
    return join(this.#prefix, key);
  }

  // Bucket/Directory Management

  /**
   * Ensures the storage bucket/directory exists
   * @returns {Promise<boolean>} True if directory was created
   */
  async ensureBucket() {
    try {
      await this.#fs.access(this.#prefix);
      return false; // Directory already exists
    } catch {
      await this.#fs.mkdir(this.#prefix, { recursive: true });
      return true; // Directory was created
    }
  }

  /**
   * Checks if the storage bucket/directory exists
   * @returns {Promise<boolean>} True if directory exists
   */
  async bucketExists() {
    try {
      await this.#fs.access(this.#prefix);
      return true;
    } catch {
      return false;
    }
  }

  // Private Helper Methods

  /**
   * Recursively traverse directories to find files matching a filter
   * @private
   * @param {Function|null} fileFilter - Optional filter function for files
   * @returns {Promise<string[]>} Array of relative file paths sorted by creation timestamp (oldest first)
   */
  async #traverse(fileFilter = null) {
    const filesWithStats = [];

    /**
     * Process a directory entry
     * @param {import('fs').Dirent} entry - Directory entry
     * @param {string} currentDir - Current directory path
     * @param {string} relativePath - Relative path from base path
     */
    const processEntry = async (entry, currentDir, relativePath) => {
      const fullPath = join(currentDir, entry.name);
      const relativeKey = relativePath
        ? join(relativePath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        await traverse(fullPath, relativeKey);
      } else if (entry.isFile() && (!fileFilter || fileFilter(relativeKey))) {
        const stats = await this.#fs.stat(fullPath);
        const birthtime = stats.birthtime || stats.mtime || new Date(0);
        filesWithStats.push({ key: relativeKey, birthtime });
      }
    };

    /**
     * Recursively traverse directories
     * @param {string} currentDir - Current directory being traversed
     * @param {string} relativePath - Relative path from base path
     */
    const traverse = async (currentDir, relativePath = "") => {
      try {
        const entries = await this.#fs.readdir(currentDir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          await processEntry(entry, currentDir, relativePath);
        }
      } catch (error) {
        // Ignore directories that can't be read (permission issues, etc.)
        if (error.code !== "ENOENT" && error.code !== "EACCES") {
          throw error;
        }
      }
    };

    await traverse(this.#prefix);

    // Sort by creation timestamp (oldest first)
    filesWithStats.sort(
      (a, b) => a.birthtime.getTime() - b.birthtime.getTime(),
    );

    return filesWithStats.map((file) => file.key);
  }
}
