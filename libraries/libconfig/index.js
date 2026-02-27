import { createStorage } from "@forwardimpact/libstorage";
import { Config } from "./config.js";

/** @typedef {import("@forwardimpact/libstorage").StorageInterface} StorageInterface */

/**
 * Creates and initializes a new Config instance asynchronously
 * @param {string} namespace - Namespace for the configuration (e.g., "service", "extension", "script")
 * @param {string} name - Name of the configuration (used for environment variable prefix)
 * @param {object} defaults - Default configuration values
 * @param {object} process - Process environment access
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function that takes basePath and returns storage instance
 * @returns {Promise<Config>} Initialized Config instance
 */
export async function createConfig(
  namespace,
  name,
  defaults = {},
  process = global.process,
  storageFn = createStorage,
) {
  const instance = new Config(namespace, name, defaults, process, storageFn);
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new service configuration instance asynchronously
 * @param {string} name - Name of the service configuration
 * @param {object} defaults - Default configuration values
 * @param {object} process - Process environment access
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function
 * @returns {Promise<Config>} Initialized Config instance for service namespace
 */
export async function createServiceConfig(
  name,
  defaults = {},
  process = global.process,
  storageFn = createStorage,
) {
  const instance = new Config("service", name, defaults, process, storageFn);
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new extension configuration instance asynchronously
 * @param {string} name - Name of the extension configuration
 * @param {object} defaults - Default configuration values
 * @param {object} process - Process environment access
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function
 * @returns {Promise<Config>} Initialized Config instance for extension namespace
 */
export async function createExtensionConfig(
  name,
  defaults = {},
  process = global.process,
  storageFn = createStorage,
) {
  const instance = new Config("extension", name, defaults, process, storageFn);
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new script configuration instance asynchronously
 * @param {string} name - Name of the script configuration
 * @param {object} defaults - Default configuration values
 * @param {object} process - Process environment access
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function
 * @returns {Promise<Config>} Initialized Config instance for script namespace
 */
export async function createScriptConfig(
  name,
  defaults = {},
  process = global.process,
  storageFn = createStorage,
) {
  const instance = new Config("script", name, defaults, process, storageFn);
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a Config instance for init/supervision.
 * Used by rc.js to bootstrap services.
 * @param {object} process - Process environment access
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function
 * @returns {Promise<Config>} Initialized Config instance with init() and rootDir()
 */
export async function createInitConfig(
  process = global.process,
  storageFn = createStorage,
) {
  const instance = new Config("init", "rc", {}, process, storageFn);
  await instance.load();
  return instance;
}

// Re-export Config class for advanced use cases
export { Config } from "./config.js";
