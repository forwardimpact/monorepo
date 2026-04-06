import path from "node:path";
import { readFile } from "node:fs/promises";
import { createStorage } from "@forwardimpact/libstorage";

/** @typedef {import("@forwardimpact/libstorage").StorageInterface} StorageInterface */

/** @param {string} url */
function stripTrailingSlashes(url) {
  return url.replace(/\/+$/, "");
}

/**
 * Centralized configuration management class
 */
export class Config {
  // Keys containing secrets or tokens. Values from .env are loaded into
  // a private map (#envOverrides) instead of process.env, so they never
  // leak through child-process inheritance or process.env inspection.
  // Getter methods read via #env(), which checks process.env first —
  // so shell-exported credentials still work; .env is the fallback.
  static #CREDENTIAL_KEYS = new Set([
    "GITHUB_CLIENT_ID",
    "GITHUB_TOKEN",
    "LLM_TOKEN",
    "JWT_SECRET",
    "JWT_ANON_KEY",
    "JWT_AUTH_URL",
  ]);

  // Cached credential values — populated on first access via getter methods
  #cache = new Map();

  // Private store for credential values loaded from .env
  #envOverrides = {};
  #fileData = null;
  #storage = null;
  #process;
  #storageFn;

  /**
   * Creates a new Config instance
   * @param {string} namespace - Namespace for the configuration (e.g., "service", "extension")
   * @param {string} name - Name of the configuration (used for environment variable prefix)
   * @param {object} defaults - Default configuration values
   * @param {object} process - Process environment access
   * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function that takes basePath and returns storage instance
   */
  constructor(
    namespace,
    name,
    defaults = {},
    process = global.process,
    storageFn = createStorage,
  ) {
    this.#process = process;
    this.#storageFn = storageFn;

    this.name = name;
    this.namespace = namespace;
    this.defaults = defaults;
  }

  /**
   * Loads the configuration by loading environment and config file
   * @returns {Promise<void>}
   */
  async load() {
    this.#storage = this.#storageFn("config", null, this.#process);

    // 1. Load .env — credentials go to #envOverrides, everything else
    //    goes to process.env (so SERVICE_*_URL etc. are available below)
    await this.#loadEnvFile();
    // 2. Load config/config.json for file-based configuration
    await this.#loadFileData();

    const namespaceUpper = this.namespace.toUpperCase();
    const nameUpper = this.name.toUpperCase();
    const fileData = this.#getFileData(this.namespace, this.name);

    // Merge: constructor defaults → config.json values
    const data = { ...this.defaults, ...fileData };

    // Apply network defaults for service binding
    if (data.protocol === undefined) data.protocol = "grpc";
    if (data.host === undefined) data.host = "0.0.0.0";
    if (data.port === undefined) data.port = 3000;
    if (data.path === undefined) data.path = "";
    data.url = `${data.protocol}://${data.host}:${data.port}${data.path}`;

    // 3. Environment overrides — SERVICE_{NAME}_{PARAM} env vars win over
    //    config file values. These are on process.env (set by shell or by
    //    #loadEnvFile for non-credential keys like SERVICE_AGENT_URL).
    for (const param of Object.keys(data)) {
      const varName = `${namespaceUpper}_${nameUpper}_${param.toUpperCase()}`;
      if (this.#process.env[varName] !== undefined) {
        try {
          data[param] = JSON.parse(this.#process.env[varName]);
        } catch {
          data[param] = this.#process.env[varName];
        }
      }
    }

    // 4. Re-parse URL after overrides so host/port/protocol stay consistent
    if (data.url !== undefined) {
      const parsed = new URL(data.url);
      data.protocol = parsed.protocol.replace(":", "");
      data.host = parsed.hostname;
      data.port = parsed.port ? parseInt(parsed.port, 10) : 80;
      data.path = parsed.pathname.replace(/\/+$/, "");
    }

    // Expose merged config as instance properties (url, host, port, model, etc.)
    Object.assign(this, data);
  }

  /** @returns {string} GitHub client ID */
  ghClientId() {
    return this.#resolve("GITHUB_CLIENT_ID");
  }

  /** @returns {string} GitHub token */
  ghToken() {
    return this.#resolve("GITHUB_TOKEN");
  }

  /** @returns {Promise<string>} LLM API token (async for caller compatibility) */
  async llmToken() {
    return this.#resolve("LLM_TOKEN");
  }

  /** @returns {string} LLM API base URL with trailing slashes removed */
  llmBaseUrl() {
    return this.#resolve("LLM_BASE_URL", stripTrailingSlashes);
  }

  /**
   * Embedding API base URL. Uses EMBEDDING_BASE_URL if set, otherwise
   * falls back to LLM_BASE_URL (OpenAI-compatible /embeddings endpoint).
   * @returns {string}
   */
  embeddingBaseUrl() {
    return this.#resolve("EMBEDDING_BASE_URL", stripTrailingSlashes, () =>
      this.llmBaseUrl(),
    );
  }

  /** @returns {string} JWT secret for HS256 signature verification */
  jwtSecret() {
    return this.#resolve("JWT_SECRET");
  }

  /** @returns {string} JWT anon key for unauthenticated Supabase access */
  jwtAnonKey() {
    return this.#resolve("JWT_ANON_KEY");
  }

  /** @returns {string} JWT auth service URL (defaults to http://localhost:9999) */
  jwtAuthUrl() {
    return this.#resolve(
      "JWT_AUTH_URL",
      stripTrailingSlashes,
      () => "http://localhost:9999",
    );
  }

  /**
   * Gets the init configuration for service supervision
   * @returns {object|null} Init config with log_dir, shutdown_timeout, services
   */
  get init() {
    return this.#fileData?.init || null;
  }

  /**
   * Gets the project root directory (parent of config directory)
   * @returns {string} Absolute path to project root
   */
  get rootDir() {
    const configDir = this.#storage.path(".");
    return path.dirname(configDir);
  }

  /**
   * Resets cached values (useful for testing)
   * @returns {void}
   */
  reset() {
    this.#cache.clear();
    this.#envOverrides = {};
    this.#fileData = null;
    this.#storage = null;
  }

  /**
   * Resolves an environment variable. Shell environment (process.env)
   * always wins; .env credential values in #envOverrides are the fallback.
   * Non-credential .env keys are already on process.env (set by #loadEnvFile).
   * @param {string} key - Environment variable name
   * @returns {string|undefined}
   * @private
   */
  #env(key) {
    return this.#process.env[key] ?? this.#envOverrides[key];
  }

  /**
   * Cached lookup: read from env, apply optional transform, cache, and
   * return. If the env var is unset, calls fallback or throws.
   * @param {string} key - Environment variable name
   * @param {((v: string) => string)|null} [transform] - Optional value transform (e.g. strip slashes)
   * @param {(() => string)|null} [fallback] - Returns default when key is missing; omit to throw
   * @returns {string}
   * @private
   */
  #resolve(key, transform = null, fallback = null) {
    if (this.#cache.has(key)) return this.#cache.get(key);

    let value = this.#env(key);
    if (value) {
      value = value.trim();
      if (transform) value = transform(value);
      this.#cache.set(key, value);
      return value;
    }

    if (fallback) {
      const resolved = fallback();
      this.#cache.set(key, resolved);
      return resolved;
    }

    throw new Error(`${key} not found in environment`);
  }

  /**
   * Loads environment variables from a .env file in the working directory.
   * Credential keys (tokens, secrets) are loaded into a private override
   * map so they never leak onto process.env. All other keys (SERVICE_*_URL,
   * LLM_BASE_URL, etc.) are set directly on process.env when not already
   * present.
   * @returns {Promise<void>}
   * @private
   */
  async #loadEnvFile() {
    try {
      const envPath = path.join(this.#process.cwd(), ".env");
      const content = await readFile(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        // Strip optional `export ` prefix (e.g. `export JWT_SECRET=xxx`)
        const stripped = trimmed.startsWith("export ")
          ? trimmed.slice(7)
          : trimmed;
        const eqIndex = stripped.indexOf("=");
        if (eqIndex === -1) continue;

        const key = stripped.slice(0, eqIndex).trim();
        let value = stripped.slice(eqIndex + 1).trim();
        // Strip matched surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (Config.#CREDENTIAL_KEYS.has(key)) {
          // Credentials → private map. #env() reads them without
          // exposing them on process.env. Shell env still wins at
          // read time because #env() checks process.env first.
          this.#envOverrides[key] = value;
        } else if (this.#process.env[key] === undefined) {
          // Non-credentials → process.env so that service URL
          // resolution and child processes can see them.
          // Shell env takes precedence (only set if undefined).
          this.#process.env[key] = value;
        }
      }
    } catch (error) {
      // Missing .env is normal (not yet initialized); any other
      // filesystem error is a real problem.
      if (error?.code !== "ENOENT") throw error;
    }
  }

  /**
   * Loads configuration data from config.json file using storage abstraction
   * @returns {Promise<void>}
   * @private
   */
  async #loadFileData() {
    if (this.#fileData !== null) return;

    try {
      const configContent = await this.#storage.get("config.json");
      this.#fileData = configContent || {};
    } catch {
      this.#fileData = {};
    }
  }

  /**
   * Gets configuration values from the loaded config file
   * @param {string} namespace - Configuration namespace
   * @param {string} name - Configuration name
   * @returns {object} Configuration object from file or empty object
   * @private
   */
  #getFileData(namespace, name) {
    if (!this.#fileData?.[namespace]?.[name]) {
      return {};
    }
    return this.#fileData[namespace][name];
  }
}
