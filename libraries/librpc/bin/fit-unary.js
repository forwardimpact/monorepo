#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

const definition = {
  name: "fit-unary",
  description: "Make a unary gRPC call to a service",
  usage: "fit-unary <service> <method> [json-request]",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ['fit-unary memory GetWindow \'{"resource_id":"..."}\''],
  documentation: [
    {
      title: "Ship a Service Endpoint",
      url: "https://www.forwardimpact.team/docs/libraries/typed-contracts/ship-endpoint/index.md",
      description:
        "Ship and consume a gRPC service with typed contracts, authentication, retries, and health checks; fit-unary is the command-line client for it.",
    },
    {
      title: "Keep Types Synced with Proto Definitions",
      url: "https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md",
      description:
        "The full workflow for defining proto contracts and generating typed base classes and clients.",
    },
  ],
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("cli", runtime);

/**
 * Makes a unary gRPC call to a service
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0);

  const [service, method, requestJson] = parsed.positionals;
  if (!service || !method) {
    cli.usageError("expected arguments: <service> <method> [json-request]");
    return runtime.proc.exit(2);
  }

  const request = requestJson ? JSON.parse(requestJson) : {};
  const tracer = await createTracer("cli");
  const client = await createClient(service, logger, tracer);

  const response = await client.callUnary(method, request);
  runtime.proc.stdout.write(JSON.stringify(response, null, 2) + "\n");
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  runtime.proc.exit(1);
});
