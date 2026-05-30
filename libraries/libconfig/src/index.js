import { createStorage } from "@forwardimpact/libstorage";
import { Config } from "./config.js";

/** @typedef {import("@forwardimpact/libstorage").StorageInterface} StorageInterface */
/** @typedef {import("@forwardimpact/libutil/runtime").Runtime} Runtime */

/**
 * Creates and initializes a new Config instance asynchronously.
 *
 * Preferred call shape (new):
 *   `createConfig(namespace, name, defaults, { runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createConfig(namespace, name, defaults, process, storageFn)`
 *
 * @param {string} namespace - Namespace for the configuration
 * @param {string} name - Name of the configuration
 * @param {object} [defaults] - Default configuration values
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object. Defaults to the production runtime when omitted.
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance
 */
export async function createConfig(
  namespace,
  name,
  defaults = {},
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config(
    namespace,
    name,
    defaults,
    runtimeOrProcess,
    storageFn,
  );
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new service configuration instance asynchronously.
 *
 * Preferred call shape (new):
 *   `createServiceConfig(name, defaults, { runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createServiceConfig(name, defaults, process, storageFn)`
 *
 * @param {string} name - Name of the service configuration
 * @param {object} [defaults] - Default configuration values
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance for service namespace
 */
export async function createServiceConfig(
  name,
  defaults = {},
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config(
    "service",
    name,
    defaults,
    runtimeOrProcess,
    storageFn,
  );
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new extension configuration instance asynchronously.
 *
 * Preferred call shape (new):
 *   `createExtensionConfig(name, defaults, { runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createExtensionConfig(name, defaults, process, storageFn)`
 *
 * @param {string} name - Name of the extension configuration
 * @param {object} [defaults] - Default configuration values
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance for extension namespace
 */
export async function createExtensionConfig(
  name,
  defaults = {},
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config(
    "extension",
    name,
    defaults,
    runtimeOrProcess,
    storageFn,
  );
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new script configuration instance asynchronously.
 *
 * Preferred call shape (new):
 *   `createScriptConfig(name, defaults, { runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createScriptConfig(name, defaults, process, storageFn)`
 *
 * @param {string} name - Name of the script configuration
 * @param {object} [defaults] - Default configuration values
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance for script namespace
 */
export async function createScriptConfig(
  name,
  defaults = {},
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config(
    "script",
    name,
    defaults,
    runtimeOrProcess,
    storageFn,
  );
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a new product configuration instance asynchronously.
 *
 * Preferred call shape (new):
 *   `createProductConfig(name, defaults, { runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createProductConfig(name, defaults, process, storageFn)`
 *
 * @param {string} name - Name of the product configuration
 * @param {object} [defaults] - Default configuration values
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance for product namespace
 */
export async function createProductConfig(
  name,
  defaults = {},
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config(
    "product",
    name,
    defaults,
    runtimeOrProcess,
    storageFn,
  );
  await instance.load();
  return instance;
}

/**
 * Creates and initializes a Config instance for init/supervision.
 * Used by rc.js to bootstrap services.
 *
 * Preferred call shape (new):
 *   `createInitConfig({ runtime }, storageFn)`
 *
 * Legacy call shape (one-cycle deprecation alias — still supported):
 *   `createInitConfig(process, storageFn)`
 *
 * @param {{ runtime: Runtime }|object} [runtimeOrProcess] - Runtime bag wrapper or
 *   legacy bare process object
 * @param {(bucket: string, type?: string, process?: object) => StorageInterface} [storageFn]
 * @returns {Promise<Config>} Initialized Config instance with init() and rootDir()
 */
export async function createInitConfig(
  runtimeOrProcess = undefined,
  storageFn = createStorage,
) {
  const instance = new Config("init", "rc", {}, runtimeOrProcess, storageFn);
  await instance.load();
  return instance;
}

// Re-export Config class for advanced use cases
export { Config } from "./config.js";

// Writer surface — see src/bootstrap.js
export { bootstrapProject } from "./bootstrap.js";
