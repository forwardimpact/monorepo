#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

// `bun build --compile` injects FIT_UNARY_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_UNARY_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-unary",
  version: VERSION,
  description: "Make a unary gRPC call to a service",
  usage: "fit-unary <service> <method> [json-request]",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ['fit-unary memory GetWindow \'{"resource_id":"..."}\''],
};

const cli = createCli(definition);
const logger = createLogger("cli");

/**
 * Makes a unary gRPC call to a service
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const [service, method, requestJson] = parsed.positionals;
  if (!service || !method) {
    cli.usageError("expected arguments: <service> <method> [json-request]");
    process.exit(2);
  }

  const request = requestJson ? JSON.parse(requestJson) : {};
  const tracer = await createTracer("cli");
  const client = await createClient(service, logger, tracer);

  const response = await client.callUnary(method, request);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
