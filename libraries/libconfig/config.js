import path from "node:path";
import { createStorage } from "@forwardimpact/libstorage";

/** @typedef {import("@forwardimpact/libstorage").StorageInterface} StorageInterface */

/**
 * Centralized configuration management class
 */
export class Config {
  #llmToken = null;
  #llmBaseUrl = null;
  #embeddingBaseUrl = null;
  #jwtSecret = null;
  #jwtAnonKey = null;
  #jwtAuthUrl = null;
  #ghToken = null;
  #ghClientId = null;
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

    await this.#loadFileData();

    const namespaceUpper = this.namespace.toUpperCase();
    const nameUpper = this.name.toUpperCase();
    const fileData = this.#getFileData(this.namespace, this.name);

    const data = { ...this.defaults, ...fileData };

    // Set defaults
    if (data.protocol === undefined) data.protocol = "grpc";
    if (data.host === undefined) data.host = "0.0.0.0";
    if (data.port === undefined) data.port = 3000;
    if (data.path === undefined) data.path = "";
    data.url = `${data.protocol}://${data.host}:${data.port}${data.path}`;

    // Let the environment override any config file values
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

    // URL takes precedence if set and all components are extracted from it.
    if (data.url !== undefined) {
      const parsed = new URL(data.url);
      data.protocol = parsed.protocol.replace(":", "");
      data.host = parsed.hostname;
      data.port = parsed.port ? parseInt(parsed.port, 10) : 80;
      data.path = parsed.pathname.replace(/\/+$/, "");
    }

    Object.assign(this, data);
  }

  /**
   * Gets the GitHub client ID from environment variable
   * @returns {string} GitHub client ID
   */
  ghClientId() {
    if (this.#ghClientId) return this.#ghClientId;

    if (this.#process.env.GITHUB_CLIENT_ID) {
      this.#ghClientId = this.#process.env.GITHUB_CLIENT_ID;
      return this.#ghClientId;
    }

    throw new Error("GitHub client ID not found in environment");
  }

  /**
   * Gets the GitHub token from environment variable
   * @returns {string} GitHub token
   */
  ghToken() {
    if (this.#ghToken) return this.#ghToken;

    if (this.#process.env.GITHUB_TOKEN) {
      this.#ghToken = this.#process.env.GITHUB_TOKEN;
      return this.#ghToken;
    }

    throw new Error("GitHub token not found in environment");
  }

  /**
   * Gets the LLM API token from environment variable
   * @returns {Promise<string>} LLM API token
   */
  async llmToken() {
    if (this.#llmToken) return this.#llmToken;

    if (this.#process.env.LLM_TOKEN) {
      this.#llmToken = this.#process.env.LLM_TOKEN;
      return this.#llmToken;
    }

    throw new Error("LLM token not found in environment");
  }

  /**
   * Gets the LLM API base URL from environment variable
   * @returns {string} LLM API base URL with trailing slashes removed
   * @throws {Error} If LLM_BASE_URL is not set in environment
   */
  llmBaseUrl() {
    if (this.#llmBaseUrl) return this.#llmBaseUrl;

    if (this.#process.env.LLM_BASE_URL) {
      this.#llmBaseUrl = this.#process.env.LLM_BASE_URL.replace(/\/+$/, "");
      return this.#llmBaseUrl;
    }

    throw new Error(
      "LLM_BASE_URL not found in environment. Set to https://models.github.ai/orgs/{YOUR_ORG} for org-level PATs.",
    );
  }

  /**
   * Gets the embedding API base URL from environment variable.
   * @returns {string} Embedding API base URL with trailing slashes removed
   * @throws {Error} If EMBEDDING_BASE_URL is not set in environment
   */
  embeddingBaseUrl() {
    if (this.#embeddingBaseUrl) return this.#embeddingBaseUrl;

    if (this.#process.env.EMBEDDING_BASE_URL) {
      this.#embeddingBaseUrl = this.#process.env.EMBEDDING_BASE_URL.replace(
        /\/+$/,
        "",
      );
      return this.#embeddingBaseUrl;
    }

    throw new Error(
      "EMBEDDING_BASE_URL not found in environment. Set to your TEI endpoint URL.",
    );
  }

  /**
   * Gets the JWT secret from environment variable
   * @returns {string} JWT secret for HS256 signature verification
   * @throws {Error} If JWT_SECRET is not set in environment
   */
  jwtSecret() {
    if (this.#jwtSecret) return this.#jwtSecret;

    if (this.#process.env.JWT_SECRET) {
      this.#jwtSecret = this.#process.env.JWT_SECRET;
      return this.#jwtSecret;
    }

    throw new Error("JWT_SECRET not found in environment");
  }

  /**
   * Gets the JWT anonymous key from environment variable.
   * Used for public/unauthenticated Supabase API access.
   * @returns {string} JWT anon key
   * @throws {Error} If JWT_ANON_KEY is not set in environment
   */
  jwtAnonKey() {
    if (this.#jwtAnonKey) return this.#jwtAnonKey;

    if (this.#process.env.JWT_ANON_KEY) {
      this.#jwtAnonKey = this.#process.env.JWT_ANON_KEY;
      return this.#jwtAnonKey;
    }

    throw new Error("JWT_ANON_KEY not found in environment");
  }

  /**
   * Gets the JWT authentication service URL from environment variable
   * @returns {string} JWT auth service URL with trailing slashes removed (defaults to http://localhost:9999)
   */
  jwtAuthUrl() {
    if (this.#jwtAuthUrl) return this.#jwtAuthUrl;

    const url = this.#process.env.JWT_AUTH_URL || "http://localhost:9999";
    this.#jwtAuthUrl = url.replace(/\/+$/, "");
    return this.#jwtAuthUrl;
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
    this.#llmToken = null;
    this.#llmBaseUrl = null;
    this.#embeddingBaseUrl = null;
    this.#jwtSecret = null;
    this.#jwtAnonKey = null;
    this.#jwtAuthUrl = null;
    this.#ghToken = null;
    this.#ghClientId = null;
    this.#fileData = null;
    this.#storage = null;
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
