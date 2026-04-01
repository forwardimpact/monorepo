#!/usr/bin/env node
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

/**
 * Makes a unary gRPC call to a service
 * Usage: fit-unary <service> <method> [json-request]
 * @returns {Promise<void>}
 */
async function main() {
  const [service, method, requestJson] = process.argv.slice(2);
  if (!service || !method) {
    console.error("Usage: fit-unary <service> <method> [json-request]");
    console.error(
      'Example: fit-unary memory GetWindow \'{"resource_id":"..."}\'',
    );
    process.exit(1);
  }

  const request = requestJson ? JSON.parse(requestJson) : {};
  const logger = createLogger("cli");
  const tracer = await createTracer("cli");
  const client = await createClient(service, logger, tracer);

  const response = await client.callUnary(method, request);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
