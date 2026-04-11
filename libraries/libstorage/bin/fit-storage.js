#!/usr/bin/env node

import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import {
  createCli,
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { Logger } from "@forwardimpact/libtelemetry";
import { Finder, waitFor } from "@forwardimpact/libutil";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const definition = {
  name: "fit-storage",
  version: VERSION,
  description: "Storage operations for local and remote data",
  commands: [
    {
      name: "create-bucket",
      description: "Create storage bucket (idempotent)",
    },
    { name: "wait", description: "Wait for storage to be ready" },
    { name: "upload", description: "Upload local data to remote storage" },
    { name: "download", description: "Download remote data to local storage" },
    { name: "list", description: "List remote storage contents" },
  ],
  options: {
    prefix: {
      type: "string",
      multiple: true,
      description: "Storage prefix to operate on (repeatable)",
    },
    timeout: {
      type: "string",
      description: "Timeout for wait command (default: 30000)",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-storage upload",
    "fit-storage upload --prefix resources",
    "fit-storage download",
    "fit-storage list --prefix graphs",
  ],
};

const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values, positionals } = parsed;
const [command] = positionals;

/**
 * Discovers storage prefixes from local data directory.
 * Lists subdirectories in data/, filtering out non-data directories.
 * @returns {Promise<string[]>} Array of discovered prefixes
 */
async function discoverLocalPrefixes() {
  const logger = new Logger("storage");
  const finder = new Finder(fs, logger);
  const root = finder.findUpward(process.cwd(), "data");
  if (!root) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/**
 * Discovers storage prefixes from remote S3 bucket.
 * Lists top-level "directories" using delimiter.
 * @returns {Promise<string[]>} Array of discovered prefixes
 */
async function discoverRemotePrefixes() {
  const storage = createStorage("");
  // Use findByPrefix with delimiter to get top-level "directories"
  const prefixes = await storage.findByPrefix("", "/");
  return prefixes
    .filter((p) => p.endsWith("/"))
    .map((p) => p.slice(0, -1))
    .sort();
}

const prefixList = values.prefix || [];

const commands = {
  async "create-bucket"() {
    await createScriptConfig("storage");
    // Use empty prefix for bucket-level operations
    const storage = createStorage("");
    const created = await storage.ensureBucket();
    process.stdout.write(
      formatSuccess(created ? "Bucket created" : "Bucket already exists") +
        "\n",
    );
  },

  async wait() {
    await createScriptConfig("storage");
    const storage = createStorage("");
    const timeout = parseInt(values.timeout || "30000");
    process.stdout.write(
      formatHeader(`Waiting for storage (timeout: ${timeout}ms)`) + "\n",
    );
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await waitFor(() => storage.isHealthy(), { timeout }, delay);
    process.stdout.write(formatSuccess("Storage is ready") + "\n");
  },

  async upload() {
    await createScriptConfig("storage");
    const logger = new Logger("storage");
    const prefixes = prefixList.length
      ? prefixList
      : await discoverLocalPrefixes();

    if (prefixes.length === 0) {
      process.stdout.write(
        "No prefixes to upload (data/ directory empty or not found)\n",
      );
      return;
    }

    // Ensure bucket exists before upload
    const storage = createStorage("");
    await storage.ensureBucket();

    for (const prefix of prefixes) {
      const local = createStorage(prefix, "local");
      const remote = createStorage(prefix);
      const keys = await local.list();

      // Filter out hidden files for security
      const filteredKeys = keys.filter((key) => !key.startsWith("."));

      for (const key of filteredKeys) {
        const data = await local.get(key);
        await remote.put(key, data);
      }

      logger.info("upload", `Uploaded ${filteredKeys.length} files`, {
        prefix,
      });
    }
    process.stdout.write(formatSuccess("Upload completed") + "\n");
  },

  async download() {
    await createScriptConfig("storage");
    const logger = new Logger("storage");
    const prefixes = prefixList.length
      ? prefixList
      : await discoverRemotePrefixes();

    if (prefixes.length === 0) {
      process.stdout.write("No prefixes found in remote storage\n");
      return;
    }

    for (const prefix of prefixes) {
      const local = createStorage(prefix, "local");
      const remote = createStorage(prefix);
      const keys = await remote.list();

      for (const key of keys) {
        const data = await remote.get(key);
        await local.put(key, data);
      }

      logger.info("download", `Downloaded ${keys.length} files`, { prefix });
    }
    process.stdout.write(formatSuccess("Download completed") + "\n");
  },

  async list() {
    await createScriptConfig("storage");
    const prefixes = prefixList.length
      ? prefixList
      : await discoverRemotePrefixes();

    if (prefixes.length === 0) {
      process.stdout.write("No prefixes found in remote storage\n");
      return;
    }

    for (const prefix of prefixes) {
      const storage = createStorage(prefix);
      const keys = await storage.list();
      for (const k of keys) {
        process.stdout.write(formatBullet(`${prefix}/${k}`, 0) + "\n");
      }
    }
  },
};

if (!command) {
  cli.usageError("no command specified");
  process.exit(2);
} else if (commands[command]) {
  await commands[command]();
} else {
  cli.usageError(`unknown command "${command}"`);
  process.exit(2);
}
