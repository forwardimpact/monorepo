import { mock } from "node:test";

/**
 * Creates a mock storage instance with tracking
 * @param {object} overrides - Method overrides
 * @returns {object} Mock storage with data tracking
 */
export function createMockStorage(overrides = {}) {
  const data = new Map();

  return {
    data,
    exists: mock.fn((key) => Promise.resolve(data.has(key))),
    get: mock.fn((key) => {
      const value = data.get(key);
      if (!value) return Promise.reject(new Error("Not found"));

      if (key.endsWith(".json")) {
        return Promise.resolve(value ? JSON.parse(value) : {});
      }
      if (key.endsWith(".jsonl")) {
        const lines = value.split("\n").filter(Boolean);
        return Promise.resolve(lines.map((line) => JSON.parse(line)));
      }
      return Promise.resolve(value);
    }),
    put: mock.fn((key, value) => {
      data.set(key, value);
      return Promise.resolve();
    }),
    append: mock.fn((key, value) => {
      const existing = data.get(key) || "";
      data.set(key, existing ? `${existing}\n${value}` : value);
      return Promise.resolve();
    }),
    delete: mock.fn((key) => {
      data.delete(key);
      return Promise.resolve();
    }),
    findByPrefix: mock.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

/**
 * MockStorage class for OOP-style usage
 */
export class MockStorage {
  /**
   * Creates a new MockStorage instance
   */
  constructor() {
    this.data = new Map();
  }

  /**
   * Gets a value by key
   * @param {string} key - The storage key
   * @returns {Promise<*>} The stored value
   */
  async get(key) {
    const value = this.data.get(key);
    if (!value) throw new Error("Not found");

    if (key.endsWith(".jsonl")) {
      return value.split("\n").map((line) => JSON.parse(line));
    }
    return value;
  }

  /**
   * Stores a value by key
   * @param {string} key - The storage key
   * @param {*} value - The value to store
   * @returns {Promise<void>}
   */
  async put(key, value) {
    this.data.set(key, value);
  }

  /**
   * Alias for put - stores a value by key
   * @param {string} key - The storage key
   * @param {*} value - The value to store
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this.data.set(key, value);
  }

  /**
   * Appends a value to an existing key
   * @param {string} key - The storage key
   * @param {string} value - The value to append
   * @returns {Promise<void>}
   */
  async append(key, value) {
    const existing = this.data.get(key) || "";
    this.data.set(key, existing ? `${existing}\n${value}` : value);
  }

  /**
   * Checks if a key exists
   * @param {string} key - The storage key
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    return this.data.has(key);
  }

  /**
   * Deletes a value by key
   * @param {string} key - The storage key
   * @returns {Promise<void>}
   */
  async delete(key) {
    this.data.delete(key);
  }
}
