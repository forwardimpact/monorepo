#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createCli } from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createBundleDownloader, execLine } from "@forwardimpact/libutil";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// `bun build --compile` injects FIT_DOWNLOAD_BUNDLE_VERSION via --define,
// eliminating the readFileSync branch in the compiled binary (which would
// ENOENT against the bunfs virtual mount). Source execution falls through.
const VERSION =
  process.env.FIT_DOWNLOAD_BUNDLE_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-download-bundle",
  version: VERSION,
  description: "Download generated code bundle from remote storage",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
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
