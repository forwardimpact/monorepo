import { join } from "path";

import { S3Client } from "@aws-sdk/client-s3";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { generateUUID } from "@forwardimpact/libsecret";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";
import { SupabaseStorage } from "./supabase.js";

/**
 * @typedef {object} StorageInterface
 * @property {function(string, string|Buffer|object): Promise<void>} put - Store data with the given key
 * @property {function(string): Promise<any>} get - Retrieve data by key
 * @property {function(string): Promise<void>} delete - Remove data by key
 * @property {function(string): Promise<boolean>} exists - Check if key exists
 * @property {function(string, string|Buffer): Promise<void>} append - Append data to an existing key
 * @property {function(string[]): Promise<object>} getMany - Retrieve multiple items by their keys
 * @property {function(): Promise<string[]>} list - Lists all keys in storage
 * @property {function(string, string=): Promise<string[]>} findByPrefix - Find keys with specified prefix, optionally grouped by delimiter
 * @property {function(string): Promise<string[]>} findByExtension - Find keys with specified extension
 * @property {function(string=): string} path - Gets the full path for a storage key
 */

/**
 * Parse JSON Lines (JSONL) format into an array of objects
 * @param {Buffer|string} content - Content to parse as JSON Lines
 * @returns {object[]} Array of parsed JSON objects
 */
export function fromJsonLines(content) {
  const text = content.toString().trim();
  if (!text) return [];

  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/**
 * Parse JSON format into an object
 * @param {Buffer|string} content - Content to parse as JSON
 * @returns {object} Parsed JSON object
 */
export function fromJson(content) {
  const text = content.toString().trim();
  if (!text) return {};

  return JSON.parse(text);
}

/**
 * Convert array of objects to JSON Lines (JSONL) format
 * @param {object[]} data - Array of objects to convert to JSONL
 * @returns {string} JSONL formatted string
 */
export function toJsonLines(data) {
  if (!Array.isArray(data)) {
    throw new Error("Data must be an array for JSONL format");
  }
  return data.map((item) => JSON.stringify(item)).join("\n") + "\n";
}

/**
 * Convert object to JSON format
 * @param {object} data - Object to convert to JSON
 * @returns {string} JSON formatted string
 */
export function toJson(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Check if key represents a JSON Lines file and data is an array
 * @param {string} key - Storage key identifier
 * @param {*} data - Data to check
 * @returns {boolean} True if this should be serialized as JSONL
 */
export function isJsonLines(key, data) {
  return key.endsWith(".jsonl") && Array.isArray(data);
}

/**
 * Check if key represents a JSON file and data is an object
 * @param {string} key - Storage key identifier
 * @param {*} data - Data to check
 * @returns {boolean} True if this should be serialized as JSON
 */
export function isJson(key, data) {
  return (
    key.endsWith(".json") &&
    typeof data === "object" &&
    data !== null &&
    !Buffer.isBuffer(data)
  );
}

/**
 * Adapt an old-style `process`-shaped object `{ env, cwd? }` into a minimal
 * `runtime.proc`-shaped collaborator so BC callers keep working.
 * @param {object} proc - Old-style process-like object.
 * @returns {object} Runtime-proc-shaped object.
 */
function _procFromLegacy(proc) {
  return {
    env: proc.env ?? {},
    cwd: typeof proc.cwd === "function" ? () => proc.cwd() : () => "",
  };
}

/**
 * Creates a local storage instance
 * @param {string} prefix - Bucket/directory name for local storage
 * @param {object} runtime - Runtime collaborator bag
 * @param {string|null} rootDir - Explicit root directory (highest priority)
 * @returns {LocalStorage} Local storage instance
 * @throws {Error} When bucket directory cannot be found
 */
function _createLocalStorage(prefix, runtime, rootDir = null) {
  const { fs, proc } = runtime;
  let relative;

  switch (prefix) {
    case "config":
    case "generated":
      relative = prefix;
      break;

    default:
      relative = join("data", prefix);
      break;
  }

  // 1. Explicit root directory parameter
  if (rootDir) {
    return new LocalStorage(join(rootDir, relative), fs);
  }

  // 2. STORAGE_ROOT environment variable
  if (proc.env?.STORAGE_ROOT) {
    return new LocalStorage(join(proc.env.STORAGE_ROOT, relative), fs);
  }

  // 3. Filesystem discovery (fallback) via the injected finder collaborator,
  //    so the runtime's fs flows through path discovery (SC9).
  const root = proc.cwd();
  const basePath = runtime.finder.findUpward(root, relative);

  // Use discovered path, or fall back to CWD-relative path.
  // Callers use ensureBucket() to create the directory if it doesn't exist yet.
  return new LocalStorage(basePath || join(root, relative), fs);
}

/**
 * Creates an S3 storage instance
 * @param {string} prefix - Prefix for S3 storage operations
 * @param {object} runtime - Runtime collaborator bag
 * @returns {S3Storage} S3 storage instance
 */
function _createS3Storage(prefix, runtime) {
  const { proc } = runtime;
  const config = {
    forcePathStyle: true,
    region: proc.env.S3_REGION,
  };

  // Configure credentials
  if (proc.env.S3_BUCKET_ROLE_ARN) {
    config.credentials = fromTemporaryCredentials({
      params: {
        RoleArn: proc.env.S3_BUCKET_ROLE_ARN,
        RoleSessionName: `guide-${generateUUID()}`,
        DurationSeconds: 3600, // 1 hour
      },
    });
  } else if (proc.env.AWS_ACCESS_KEY_ID && proc.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: proc.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: proc.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // If no explicit credentials are provided, use default credential chain

  // Optional custom endpoint for S3-compatible services (AWS SDK standard variable)
  if (proc.env.AWS_ENDPOINT_URL) config.endpoint = proc.env.AWS_ENDPOINT_URL;

  const client = new S3Client(config);

  // Get bucket name from environment, use the factory parameter as prefix
  const bucketName = proc.env.S3_BUCKET_NAME || "guide";
  return new S3Storage(prefix, bucketName, client);
}

/**
 * Creates a Supabase storage instance
 * @param {string} prefix - Prefix for Supabase storage operations
 * @param {object} runtime - Runtime collaborator bag
 * @returns {SupabaseStorage} Supabase storage instance
 * @throws {Error} If SUPABASE_SERVICE_ROLE_KEY is missing
 */
function _createSupabaseStorage(prefix, runtime) {
  const { proc } = runtime;
  const endpoint = proc.env.AWS_ENDPOINT_URL;
  const storageUrl = endpoint?.replace(/\/s3$/, "");
  // libconfig depends on libstorage; threading Config here would create a
  // runtime cycle. Allow-listed in
  // libraries/libconfig/test/no-supabase-env-in-src.test.js.
  const serviceRoleKey = proc.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for Supabase storage",
    );
  }

  const config = {
    region: proc.env.S3_REGION || "local",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: proc.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: proc.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  const client = new S3Client(config);
  const bucketName = proc.env.S3_BUCKET_NAME || "guide";

  return new SupabaseStorage(
    prefix,
    bucketName,
    client,
    storageUrl,
    serviceRoleKey,
  );
}

/**
 * Creates a storage instance based on configuration.
 *
 * Resolution order for local storage paths:
 * 1. Explicit rootDir parameter (for dependency injection and testing)
 * 2. STORAGE_ROOT environment variable (for deployment configuration)
 * 3. Filesystem discovery via Finder.findUpward (fallback)
 *
 * @param {string} prefix - Prefix for the storage operations (for S3) or bucket/directory name (for local)
 * @param {string} [type] - Storage type ("local", "s3", or "supabase")
 * @param {object|null} [processOrRuntime] - Legacy process-shaped object `{ env, cwd? }` OR a
 *   runtime bag `{ fs, proc, … }` — either is accepted for backward compatibility.
 *   When omitted, a default runtime is constructed automatically.
 * @param {string|null} [rootDir] - Explicit root directory for local storage
 * @returns {object} Storage instance
 * @throws {Error} When unsupported storage type is provided
 */
export function createStorage(
  prefix,
  type,
  processOrRuntime = null,
  rootDir = null,
) {
  // Build the runtime collaborator. Accept three shapes:
  //   (a) a full runtime bag (has `.proc`),
  //   (b) a legacy process-like object (has `.env` but no `.proc`),
  //   (c) null/undefined — construct the default runtime.
  let runtime;
  if (processOrRuntime && typeof processOrRuntime === "object") {
    if ("proc" in processOrRuntime && "fs" in processOrRuntime) {
      // Full runtime bag — use as-is.
      runtime = processOrRuntime;
    } else {
      // Legacy process-like object: adapt it into a minimal runtime.
      const legacyProc = _procFromLegacy(processOrRuntime);
      const defaultRuntime = createDefaultRuntime();
      runtime = { ...defaultRuntime, proc: legacyProc };
    }
  } else {
    runtime = createDefaultRuntime();
  }

  // Always use local storage for config and generated directories
  // These are part of the codebase and should never be stored in S3
  if (prefix === "config" || prefix === "generated") {
    return _createLocalStorage(prefix, runtime, rootDir);
  }

  const finalType = type || runtime.proc.env.STORAGE_TYPE || "local";

  switch (finalType) {
    case "local":
    case undefined:
      return _createLocalStorage(prefix, runtime, rootDir);

    case "s3":
      return _createS3Storage(prefix, runtime);

    case "supabase":
      return _createSupabaseStorage(prefix, runtime);

    default:
      throw new Error(`Unsupported storage type: ${finalType}`);
  }
}

// Re-export storage classes
export { LocalStorage } from "./local.js";
export { S3Storage } from "./s3.js";
export { SupabaseStorage } from "./supabase.js";
