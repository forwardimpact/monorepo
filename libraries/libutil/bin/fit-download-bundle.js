#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { spawn } from "node:child_process";
import { createCli } from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createBundleDownloader, execLine } from "@forwardimpact/libutil";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const definition = {
  name: "fit-download-bundle",
  description: "Download generated code bundle from remote storage",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("generated", runtime);

/**
 * Downloads generated code bundle from remote storage.
 * Used in containerized deployments to fetch pre-generated code.
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  await createScriptConfig("download-bundle");
  const downloader = createBundleDownloader(createStorage, logger, runtime);
  await downloader.download();

  // If additional arguments provided, execute them after download
  execLine(0, { spawn, process });
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
