import { promises as fs } from "fs";
import fsAsync from "fs/promises";
import { join } from "path";

import { S3Client } from "@aws-sdk/client-s3";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import { generateUUID } from "@forwardimpact/libsecret";
import { Finder } from "@forwardimpact/libutil";
import { Logger } from "@forwardimpact/libtelemetry";

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
 * Creates a local storage instance
 * @param {string} prefix - Bucket/directory name for local storage
 * @param {object} process - Process environment access (for testing)
 * @param {string|null} rootDir - Explicit root directory (highest priority)
 * @returns {LocalStorage} Local storage instance
 * @throws {Error} When bucket directory cannot be found
 */
function _createLocalStorage(prefix, process, rootDir = null) {
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
  if (process.env?.STORAGE_ROOT) {
    return new LocalStorage(join(process.env.STORAGE_ROOT, relative), fs);
  }

  // 3. Filesystem discovery (fallback)
  const root =
    typeof process.cwd === "function" ? process.cwd() : global.process.cwd();

  const logger = new Logger("storage");
  const finder = new Finder(fsAsync, logger, process);
  const basePath = finder.findUpward(root, relative);

  // Use discovered path, or fall back to CWD-relative path.
  // Callers use ensureBucket() to create the directory if it doesn't exist yet.
  return new LocalStorage(basePath || join(root, relative), fs);
}

/**
 * Creates an S3 storage instance
 * @param {string} prefix - Prefix for S3 storage operations
 * @param {object} process - Process environment access (for testing)
 * @returns {S3Storage} S3 storage instance
 */
function _createS3Storage(prefix, process) {
  const config = {
    forcePathStyle: true,
    region: process.env.S3_REGION,
  };

  // Configure credentials
  if (process.env.S3_BUCKET_ROLE_ARN) {
    config.credentials = fromTemporaryCredentials({
      params: {
        RoleArn: process.env.S3_BUCKET_ROLE_ARN,
        RoleSessionName: `guide-${generateUUID()}`,
        DurationSeconds: 3600, // 1 hour
      },
    });
  } else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // If no explicit credentials are provided, use default credential chain

  // Optional custom endpoint for S3-compatible services (AWS SDK standard variable)
  if (process.env.AWS_ENDPOINT_URL)
    config.endpoint = process.env.AWS_ENDPOINT_URL;

  const client = new S3Client(config);

  // Get bucket name from environment, use the factory parameter as prefix
  const bucketName = process.env.S3_BUCKET_NAME || "guide";
  return new S3Storage(prefix, bucketName, client);
}

/**
 * Creates a Supabase storage instance
 * @param {string} prefix - Prefix for Supabase storage operations
 * @param {object} process - Process environment access (for testing)
 * @returns {SupabaseStorage} Supabase storage instance
 * @throws {Error} If SUPABASE_SERVICE_ROLE_KEY is missing
 */
function _createSupabaseStorage(prefix, process) {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const storageUrl = endpoint?.replace(/\/s3$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for Supabase storage",
    );
  }

  const config = {
    region: process.env.S3_REGION || "local",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  const client = new S3Client(config);
  const bucketName = process.env.S3_BUCKET_NAME || "guide";

  return new SupabaseStorage(
    prefix,
    bucketName,
    client,
    storageUrl,
    serviceRoleKey,
  );
}

/**
 * Creates a storage instance based on configuration
 *
 * Resolution order for local storage paths:
 * 1. Explicit rootDir parameter (for dependency injection and testing)
 * 2. STORAGE_ROOT environment variable (for deployment configuration)
 * 3. Filesystem discovery via Finder.findUpward (fallback)
 *
 * @param {string} prefix - Prefix for the storage operations (for S3) or bucket/directory name (for local)
 * @param {string} type - Storage type ("local", "s3", or "supabase")
 * @param {object} process - Process environment access (for testing)
 * @param {string|null} rootDir - Explicit root directory for local storage
 * @returns {object} Storage instance
 * @throws {Error} When unsupported storage type is provided
 */
export function createStorage(
  prefix,
  type,
  process = global.process,
  rootDir = null,
) {
  // Always use local storage for config and generated directories
  // These are part of the codebase and should never be stored in S3
  if (prefix === "config" || prefix === "generated") {
    return _createLocalStorage(prefix, process, rootDir);
  }

  const finalType = type || process.env.STORAGE_TYPE || "local";

  switch (finalType) {
    case "local":
    case undefined:
      return _createLocalStorage(prefix, process, rootDir);

    case "s3":
      return _createS3Storage(prefix, process);

    case "supabase":
      return _createSupabaseStorage(prefix, process);

    default:
      throw new Error(`Unsupported storage type: ${finalType}`);
  }
}

// Re-export storage classes
export { LocalStorage } from "./local.js";
export { S3Storage } from "./s3.js";
export { SupabaseStorage } from "./supabase.js";
