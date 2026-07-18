#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

const definition = {
  name: "fit-process",
  description:
    "Build the knowledge indexes: process resources, then graphs and vectors",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  commands: [
    {
      name: "resources",
      description:
        "Process HTML files in the knowledge base directory into the resources index",
      options: {
        base: {
          type: "string",
          short: "b",
          description: "Base URI (default: https://example.invalid/)",
        },
      },
      examples: ["fit-process resources --base https://example.invalid/"],
    },
    {
      name: "graphs",
      description: "Process resources into RDF graphs",
      examples: ["fit-process graphs"],
    },
    {
      name: "vectors",
      description: "Process resources into vector embeddings",
      examples: ["fit-process vectors"],
    },
  ],
  examples: [
    "fit-process resources --base https://example.invalid/",
    "fit-process graphs",
    "fit-process vectors",
  ],
};

const HANDLERS = {
  resources: () => import("../src/commands/resources.js"),
  graphs: () => import("../src/commands/graphs.js"),
  vectors: () => import("../src/commands/vectors.js"),
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("process", runtime);

/**
 * Parse argv, route the leading positional to its write-stage handler.
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const subcommand = parsed.positionals[0];
  const load = HANDLERS[subcommand];
  if (!load) {
    cli.usageError(
      `unknown command "${subcommand ?? ""}" (expected resources, graphs, or vectors)`,
    );
    process.exit(2);
  }

  const { run } = await load();
  await run({
    positionals: parsed.positionals.slice(1),
    values: parsed.values,
    runtime,
    cli,
  });
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
