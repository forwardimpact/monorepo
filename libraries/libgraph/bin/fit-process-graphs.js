#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createLogger } from "@forwardimpact/libtelemetry";

import { createGraphIndex } from "@forwardimpact/libgraph";
import { GraphProcessor } from "@forwardimpact/libgraph/processor/graph.js";

// `bun build --compile` injects FIT_PROCESS_GRAPHS_VERSION via --define,
// eliminating the readFileSync branch in the compiled binary (which would
// ENOENT against the bunfs virtual mount). Source execution falls through.
const VERSION =
  process.env.FIT_PROCESS_GRAPHS_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-process-graphs",
  version: VERSION,
  description: "Process resources into RDF graphs",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
const logger = createLogger("graphs", runtime);

/**
 * Processes resources into RDF graphs
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const resourceIndex = createResourceIndex("resources");
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const processor = new GraphProcessor(graphIndex, resourceIndex, logger);

  const actor = "cld:common.System.root";

  // Process resources into RDF graphs (content only)
  await processor.process(actor);
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
