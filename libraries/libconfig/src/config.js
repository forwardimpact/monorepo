import { execSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createStorage } from "@forwardimpact/libstorage";

/** @typedef {import("@forwardimpact/libstorage").StorageInterface} StorageInterface */

/** @param {string} url */
function stripTrailingSlashes(url) {
  return url.replace(/\/+$/, "");
}

function stripQuotes(value) {
  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first)) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse an env value as JSON when possible, falling back to the raw string.
 * @param {string} raw
 * @returns {*}
 */
function parseEnvValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Parses one line of a .env file.
 * @param {string} line
 * @returns {{ key: string, value: string } | null}
 */
function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const stripped = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
  const eqIndex = stripped.indexOf("=");
  if (eqIndex === -1) return null;

  const key = stripped.slice(0, eqIndex).trim();
  const value = stripQuotes(stripped.slice(eqIndex + 1).trim());
  return { key, value };
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
    "ANTHROPIC_API_KEY",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "MCP_TOKEN",
    "PRODUCT_LANDMARK_TOKEN",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
  ]);

  // Cached credential values — populated on first access via getter methods
  #cache = new Map();

  // Private store for credential values loaded from .env
  #envOverrides = {};
  #fileData = null;
  #storage = null;
  #process;
  #storageFn;
  #execSync;

  /**
   * Creates a new Config instance
   * @param {string} namespace - Namespace for the configuration (e.g., "service", "extension")
   * @param {string} name - Name of the configuration (used for environment variable prefix)
   * @param {object} defaults - Default configuration values
   * @param {object} process - Process environment access
   * @param {(bucket: string, type?: string, process?: object) => StorageInterface} storageFn - Optional storage factory function that takes basePath and returns storage instance
   * @param {(command: string, options?: object) => Buffer | string} execSyncFn - Optional child_process.execSync override (for testing)
   */
  constructor(
    namespace,
    name,
    defaults = {},
    process = global.process,
    storageFn = createStorage,
    execSyncFn = execSync,
  ) {
    this.#process = process;
    this.#storageFn = storageFn;
    this.#execSync = execSyncFn;

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
    //    config file values. Shell process.env wins over .env #envOverrides.
    //    Credential keys treat empty string as absent so a workflow ternary
    //    emitting '' cannot clobber a .env-supplied value; non-credential
    //    service params keep today's empty-string-wins behaviour.
    for (const param of Object.keys(data)) {
      const varName = `${namespaceUpper}_${nameUpper}_${param.toUpperCase()}`;
      const resolved = this.#resolveOverride(varName);
      if (resolved !== undefined) data[param] = resolved;
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

  /** @returns {string} GitHub token (GH_TOKEN → GITHUB_TOKEN → `gh auth token`) */
  ghToken() {
    try {
      return this.#resolve(["GH_TOKEN", "GITHUB_TOKEN"]);
    } catch {
      return this.#resolveGhCli();
    }
  }

  /** @returns {string} Embedding API base URL with trailing slashes removed */
  embeddingBaseUrl() {
    return this.#resolve(["EMBEDDING_BASE_URL"], stripTrailingSlashes);
  }

  /** @returns {string} MCP bearer token */
  mcpToken() {
    return this.#resolve(["MCP_TOKEN"]);
  }

  /** @returns {string} Supabase base URL (trailing slashes stripped) */
  supabaseUrl() {
    return this.#resolve(["SUPABASE_URL"], stripTrailingSlashes);
  }

  /** @returns {string} Supabase anon key JWT */
  supabaseAnonKey() {
    return this.#resolve(["SUPABASE_ANON_KEY"]);
  }

  /** @returns {string} Supabase service-role key JWT */
  supabaseServiceRoleKey() {
    return this.#resolve(["SUPABASE_SERVICE_ROLE_KEY"]);
  }

  /** @returns {string} Supabase HS256 JWT signing secret */
  supabaseJwtSecret() {
    return this.#resolve(["SUPABASE_JWT_SECRET"]);
  }

  /**
   * Returns a usable Anthropic credential. Resolution order: env var →
   * OAuth store (refresh if expired) → typed error. Callers do not branch
   * on the source.
   * @returns {Promise<string>}
   */
  async anthropicToken() {
    const envKey = this.#env("ANTHROPIC_API_KEY");
    if (envKey) return envKey;

    const oauth = await this.#readOAuthToken();
    if (!oauth) {
      throw new Error(
        "Not authenticated. Run `fit-guide login` or set ANTHROPIC_API_KEY.",
      );
    }

    if (Date.now() >= oauth.expires_at - 5 * 60 * 1000) {
      try {
        const refreshed = await this.#refreshOAuthToken(oauth.refresh_token);
        await this.#writeOAuthToken(refreshed);
        return refreshed.access_token;
      } catch {
        await this.#clearOAuthToken();
        throw new Error(
          "Session expired. Run `fit-guide login` to re-authenticate.",
        );
      }
    }

    return oauth.access_token;
  }

  /**
   * Persists an OAuth credential (called by the login flow).
   * @param {{ access_token: string, refresh_token: string, expires_at: number }} tokenData
   * @returns {Promise<void>}
   */
  async writeOAuthCredential(tokenData) {
    await this.#writeOAuthToken(tokenData);
  }

  /**
   * Clears the persisted OAuth credential (called by the logout flow).
   * @returns {Promise<void>}
   */
  async clearOAuthCredential() {
    await this.#clearOAuthToken();
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

  /** @returns {Promise<object|null>} OAuth token tuple or null */
  async #readOAuthToken() {
    try {
      const data = await this.#storage.get("anthropic-oauth.json");
      if (!data?.access_token) return null;
      return data;
    } catch {
      return null;
    }
  }

  /** @param {{ access_token: string, refresh_token: string, expires_at: number }} data */
  async #writeOAuthToken(data) {
    await this.#storage.put("anthropic-oauth.json", data);
  }

  async #clearOAuthToken() {
    try {
      await this.#storage.delete("anthropic-oauth.json");
    } catch {
      // no-op if absent
    }
  }

  /**
   * Exchanges a refresh token for a new access token at Anthropic's
   * token endpoint.
   * @param {string} refreshToken
   * @returns {Promise<{ access_token: string, refresh_token: string, expires_at: number }>}
   */
  async #refreshOAuthToken(refreshToken) {
    const tokenUrl =
      this.#process.env.ANTHROPIC_OAUTH_TOKEN_URL ||
      "https://auth.anthropic.com/oauth/token";
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`);
    }
    const body = await res.json();
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? refreshToken,
      expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
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
   * Resolves a config-param override against shell env then #envOverrides,
   * applying credential-key semantics (empty string treated as absent so a
   * workflow ternary emitting '' cannot clobber a .env value). Returns the
   * JSON-parsed value or raw string, or undefined if nothing is set.
   * @param {string} varName - Fully-qualified env var name
   * @returns {*|undefined}
   * @private
   */
  #resolveOverride(varName) {
    const isCredential = Config.#CREDENTIAL_KEYS.has(varName);
    const shell = this.#process.env[varName];
    const shellOk = isCredential
      ? shell !== undefined && shell !== ""
      : shell !== undefined;
    if (shellOk) return parseEnvValue(shell);
    const fallback = this.#envOverrides[varName];
    const fallbackOk = isCredential
      ? fallback !== undefined && fallback !== ""
      : fallback !== undefined;
    return fallbackOk ? parseEnvValue(fallback) : undefined;
  }

  /**
   * Cached lookup across one or more environment variable names. Returns
   * the first set value (in array order), trimmed and optionally
   * transformed. The first name is the cache key and error label.
   * Throws if none of the names is set.
   * @param {string[]} keys - Environment variable names in priority order
   * @param {((v: string) => string)|null} [transform] - Optional value transform (e.g. strip slashes)
   * @returns {string}
   * @private
   */
  #resolve(keys, transform = null) {
    const [cacheKey] = keys;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);

    for (const key of keys) {
      const raw = this.#env(key);
      if (raw) {
        let value = raw.trim();
        if (transform) value = transform(value);
        this.#cache.set(cacheKey, value);
        return value;
      }
    }

    throw new Error(`${cacheKey} not found in environment`);
  }

  /**
   * Spawns `gh auth token` and caches the result under the GH_TOKEN key.
   * @returns {string}
   * @private
   */
  #resolveGhCli() {
    if (this.#cache.has("GH_TOKEN")) return this.#cache.get("GH_TOKEN");

    let token;
    try {
      token = this.#execSync("gh auth token", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: this.#process.env,
      }).trim();
    } catch {
      throw new Error(
        "GH_TOKEN not found in environment and `gh auth token` failed",
      );
    }

    if (!token) {
      throw new Error(
        "GH_TOKEN not found in environment and `gh auth token` returned empty",
      );
    }

    this.#cache.set("GH_TOKEN", token);
    return token;
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
        const parsed = parseEnvLine(line);
        if (parsed) this.#applyEnvEntry(parsed.key, parsed.value);
      }
    } catch (error) {
      // Missing .env is normal (not yet initialized); any other
      // filesystem error is a real problem.
      if (error?.code !== "ENOENT") throw error;
    }
  }

  #applyEnvEntry(key, value) {
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
