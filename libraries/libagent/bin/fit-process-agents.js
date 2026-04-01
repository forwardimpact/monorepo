#!/usr/bin/env node
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";

import { AgentProcessor } from "../processor/agent.js";

/**
 * Process agent configurations from config/agents/*.agent.md and generate Agent resources
 * using the AgentProcessor
 * @returns {Promise<void>}
 */
async function main() {
  const configStorage = createStorage("config");
  const logger = createLogger("agents");

  const resourceIndex = createResourceIndex("resources");

  // Process agents using AgentProcessor
  const agentProcessor = new AgentProcessor(
    resourceIndex,
    configStorage,
    logger,
  );
  await agentProcessor.process();
}

main();
