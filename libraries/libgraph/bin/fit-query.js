#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";

const definition = {
  name: "fit-query",
  description: "Query the graph index with a triple pattern",
  usage: "fit-query <subject> <predicate> <object>",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ['fit-query "?" rdf:type schema:Person'],
  documentation: [
    {
      title: "Query a Knowledge Graph",
      url: "https://www.forwardimpact.team/docs/libraries/ground-agents/query-graph/index.md",
      description:
        "Answer relationship questions from an RDF graph index with triple-pattern queries and type-filtered subject listings.",
    },
    {
      title: "Give Agents Typed, Retrievable Knowledge",
      url: "https://www.forwardimpact.team/docs/libraries/ground-agents/index.md",
      description:
        "The full workflow for building and populating the graph index from HTML knowledge sources.",
    },
  ],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("query", runtime);

/**
 * Queries the graph index with a triple pattern
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  if (parsed.positionals.length !== 3) {
    cli.usageError("expected 3 arguments: <subject> <predicate> <object>");
    process.exit(2);
  }

  const pattern = parseGraphQuery(parsed.positionals.join(" "));
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const identifiers = await graphIndex.queryItems(pattern);

  for (const identifier of identifiers) {
    console.log(String(identifier));
  }
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
