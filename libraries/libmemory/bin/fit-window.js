#!/usr/bin/env node
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

/**
 * Fetches the memory window for a conversation as JSON
 * Usage: fit-window <resource_id> [model]
 * @returns {Promise<void>}
 */
async function main() {
  const resourceId = process.argv[2];
  if (!resourceId) {
    console.error("Usage: fit-window <resource_id> [model]");
    process.exit(1);
  }

  const model = process.argv[3] || "default";
  const config = await createServiceConfig("memory");
  const logger = createLogger("cli");
  const tracer = await createTracer("cli");
  const client = await createClient("memory", logger, tracer);

  const response = await client.callUnary("GetWindow", {
    resource_id: resourceId,
    model,
    max_tokens: config.maxTokens || 4096,
  });

  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
