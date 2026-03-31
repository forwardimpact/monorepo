#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createBundleDownloader, execLine } from "@forwardimpact/libutil";

/**
 * Downloads generated code bundle from remote storage.
 * Used in containerized deployments to fetch pre-generated code.
 * @returns {Promise<void>}
 */
async function main() {
  await createScriptConfig("download-bundle");
  const logger = createLogger("generated");
  const downloader = createBundleDownloader(createStorage, logger);
  await downloader.download();

  // If additional arguments provided, execute them after download
  execLine(0, { spawn, process });
}

main().catch((error) => {
  console.error("Bundle download failed:", error);
  process.exit(1);
});
