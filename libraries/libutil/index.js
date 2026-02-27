import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

import { Tokenizer, ranks } from "./tokenizer.js";
import { Finder } from "./finder.js";
import { BundleDownloader } from "./downloader.js";
import { TarExtractor } from "./extractor.js";

/**
 * Updates or creates an environment variable in .env file
 * @param {string} key - Environment variable name (e.g., "SERVICE_SECRET")
 * @param {string} value - Environment variable value
 * @param {string} [envPath] - Path to .env file (defaults to .env in current directory)
 */
export async function updateEnvFile(key, value, envPath = ".env") {
  const fullPath = path.resolve(envPath);
  let content = "";

  try {
    content = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    // It's ok if the file doesn't exist
    if (error.code !== "ENOENT") throw error;
  }

  const envLine = `${key}=${value}`;
  const lines = content.split("\n");
  let found = false;

  // Look for existing key line (both active and commented)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`) || lines[i].startsWith(`# ${key}=`)) {
      lines[i] = envLine;
      found = true;
      break;
    }
  }

  // If not found, add it to the end
  if (!found) {
    if (content && !content.endsWith("\n")) {
      lines.push("");
    }
    lines.push(envLine);
  }

  // Write back to file
  await fs.writeFile(fullPath, lines.join("\n"));
}

/**
 * Generates a deterministic hash from multiple input values
 * @param {...string} values - Values to hash together
 * @returns {string} The first 16 characters of SHA256 hash
 */
export function generateHash(...values) {
  const input = values.filter(Boolean).join(".");
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("hex")
    .substring(0, 8);
}

/**
 * Generates a unique session ID for conversation tracking
 * @returns {string} Unique session identifier
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Helper function to count tokens
 * @param {string} text - Text to count tokens for
 * @param {Tokenizer} tokenizer - Tokenizer instance
 * @returns {number} Approximate token count
 */
export function countTokens(text, tokenizer) {
  if (!tokenizer) tokenizer = createTokenizer();
  return tokenizer.encode(text).length;
}

/**
 * Creates a new tokenizer instance
 * @returns {Tokenizer} New tokenizer instance
 */
export function createTokenizer() {
  return new Tokenizer(ranks);
}

/**
 * Creates a BundleDownloader instance configured for generated code management.
 * Used in containerized deployments to download pre-generated code bundles.
 * @param {Function} createStorage - Storage factory function from libstorage
 * @returns {Promise<BundleDownloader>} Configured BundleDownloader instance
 */
export async function createBundleDownloader(createStorage) {
  if (!createStorage) throw new Error("createStorage is required");

  // Dynamic import to avoid circular dependency with libtelemetry
  const { createLogger } = await import("@forwardimpact/libtelemetry");
  const logger = createLogger("generated");
  const finder = new Finder(fs, logger);
  const extractor = new TarExtractor(fs, path);

  return new BundleDownloader(createStorage, finder, logger, extractor);
}

/**
 * Executes command line arguments as child process, similar to execv() in C
 * @param {number} [shift] - Number of arguments to skip from process.argv before extracting command
 * @returns {void} Function does not return - exits parent process
 */
export function execLine(shift = 0) {
  const args = process.argv.slice(2 + shift);
  if (args.length === 0) return;

  // Look for '--' delimiter and use everything after it as the command
  const index = args.indexOf("--");
  const line = index !== -1 ? args.slice(index + 1) : args;

  if (line.length === 0) return;

  const [command, ...commandArgs] = line;
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
  });

  // Forward signals to child process
  ["SIGTERM", "SIGINT", "SIGQUIT"].forEach((signal) => {
    process.on(signal, () => child.kill(signal));
  });

  child.on("error", (error) => {
    console.error("Error:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : code || 0);
  });
}

export { Finder } from "./finder.js";
export { BundleDownloader } from "./downloader.js";
export { TarExtractor, ZipExtractor } from "./extractor.js";
export { ProcessorBase } from "./processor.js";
export { Retry, createRetry } from "./retry.js";
export { parseJsonBody } from "./http.js";
export { waitFor } from "./wait.js";
