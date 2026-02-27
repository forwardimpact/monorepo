#!/usr/bin/env node

import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { Logger } from "@forwardimpact/libtelemetry";
import { Finder, waitFor } from "@forwardimpact/libutil";

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

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    prefix: { type: "string", multiple: true },
    timeout: { type: "string", default: "30000" },
    help: { type: "boolean", short: "h" },
  },
});

const [command] = positionals;

const commands = {
  async "create-bucket"() {
    await createScriptConfig("storage");
    // Use empty prefix for bucket-level operations
    const storage = createStorage("");
    const created = await storage.ensureBucket();
    console.log(created ? "Bucket created" : "Bucket already exists");
  },

  async wait() {
    await createScriptConfig("storage");
    const storage = createStorage("");
    const timeout = parseInt(values.timeout);
    console.log(`Waiting for storage (timeout: ${timeout}ms)...`);
    await waitFor(() => storage.isHealthy(), { timeout });
    console.log("Storage is ready");
  },

  async upload() {
    await createScriptConfig("storage");
    const logger = new Logger("storage");
    const prefixes = values.prefix?.length
      ? values.prefix
      : await discoverLocalPrefixes();

    if (prefixes.length === 0) {
      console.log("No prefixes to upload (data/ directory empty or not found)");
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
    console.log("Upload completed");
  },

  async download() {
    await createScriptConfig("storage");
    const logger = new Logger("storage");
    const prefixes = values.prefix?.length
      ? values.prefix
      : await discoverRemotePrefixes();

    if (prefixes.length === 0) {
      console.log("No prefixes found in remote storage");
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
    console.log("Download completed");
  },

  async list() {
    await createScriptConfig("storage");
    const prefixes = values.prefix?.length
      ? values.prefix
      : await discoverRemotePrefixes();

    if (prefixes.length === 0) {
      console.log("No prefixes found in remote storage");
      return;
    }

    for (const prefix of prefixes) {
      const storage = createStorage(prefix);
      const keys = await storage.list();
      keys.forEach((k) => console.log(`${prefix}/${k}`));
    }
  },

  async help() {
    console.log(`
Usage: fit-storage <command> [options]

Commands:
  create-bucket    Create storage bucket (idempotent)
  wait             Wait for storage to be ready
  upload           Upload local data to remote storage
  download         Download remote data to local storage
  list             List remote storage contents

Options:
  --prefix <name>  Storage prefix(es) to operate on (repeatable)
                   If omitted, discovers prefixes automatically:
                   - upload: from local data/ subdirectories
                   - download/list: from remote bucket prefixes
  --timeout <ms>   Timeout for wait command (default: 30000)
  -h, --help       Show this help message

Examples:
  fit-storage upload                           # Upload all data/* dirs
  fit-storage upload --prefix resources        # Upload specific prefix
  fit-storage download                         # Download all remote prefixes
  fit-storage list --prefix graphs             # List specific prefix
`);
  },
};

if (!command || command === "help" || values.help) {
  await commands.help();
} else if (commands[command]) {
  await commands[command]();
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "fit-storage help" for usage');
  process.exit(1);
}
