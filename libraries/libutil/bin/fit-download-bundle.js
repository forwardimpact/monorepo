#!/usr/bin/env node

import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createBundleDownloader, execLine } from "@forwardimpact/libutil";

/**
 * Downloads generated code bundle from remote storage.
 * Used in containerized deployments to fetch pre-generated code.
 * @returns {Promise<void>}
 */
async function main() {
  await createScriptConfig("download-bundle");
  const downloader = await createBundleDownloader(createStorage);
  await downloader.download();

  // If additional arguments provided, execute them after download
  execLine();
}

main().catch((error) => {
  console.error("Bundle download failed:", error);
  process.exit(1);
});
