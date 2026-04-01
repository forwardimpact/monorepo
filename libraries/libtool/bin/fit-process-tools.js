#!/usr/bin/env node
import { parseArgs } from "node:util";

import { createScriptConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ToolProcessor } from "@forwardimpact/libtool/processor/tool.js";

/**
 * Process tool endpoint configurations and generate tool resources
 * using the ToolProcessor
 * @returns {Promise<void>}
 */
async function main() {
  await createScriptConfig("tools");

  const { values } = parseArgs({
    options: {
      "proto-root": {
        type: "string",
        short: "p",
        default: process.cwd(),
      },
    },
  });

  const configStorage = createStorage("config", "local");
  const logger = createLogger("tools");
  const resourceIndex = createResourceIndex("resources");

  const toolProcessor = new ToolProcessor(
    resourceIndex,
    configStorage,
    values["proto-root"],
    logger,
  );
  await toolProcessor.process();
}

main().catch((error) => {
  console.error("Tool processing failed:", error);
  process.exit(1);
});
