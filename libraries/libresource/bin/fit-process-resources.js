#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ResourceProcessor } from "@forwardimpact/libresource/processor/resource.js";
import { Parser } from "@forwardimpact/libresource/parser.js";
import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js";

// `bun build --compile` injects FIT_PROCESS_RESOURCES_VERSION via --define,
// eliminating the readFileSync branch in the compiled binary (which would
// ENOENT against the bunfs virtual mount). Source execution falls through.
const VERSION =
  process.env.FIT_PROCESS_RESOURCES_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-process-resources",
  version: VERSION,
  description:
    "Process HTML files in the knowledge base directory and generate resources",
  globalOptions: {
    base: {
      type: "string",
      short: "b",
      description: "Base URI (default: https://example.invalid/)",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
const logger = createLogger("resources", runtime);

/**
 * Process all HTML files in the knowledge base directory and generate resources
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  await createScriptConfig("resources");

  const base = parsed.values.base || "https://example.invalid/";
  const knowledgeStorage = createStorage("knowledge");

  const resourceIndex = createResourceIndex("resources");
  const skolemizer = new Skolemizer();
  const parser = new Parser(skolemizer, logger);

  const resourceProcessor = new ResourceProcessor(
    base,
    resourceIndex,
    knowledgeStorage,
    parser,
    logger,
  );
  await resourceProcessor.process(".html");
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
