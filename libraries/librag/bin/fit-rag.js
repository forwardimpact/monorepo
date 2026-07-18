#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

const definition = {
  name: "fit-rag",
  description:
    "Query the knowledge indexes: search by meaning, query relationships, or list subjects",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  commands: [
    {
      name: "search",
      args: "<query>",
      description: "Search the vector index by embedding a query string",
      examples: ["fit-rag search 'career progression'"],
    },
    {
      name: "query",
      args: "<subject> <predicate> <object>",
      description: "Query the graph index with a triple pattern",
      examples: ['fit-rag query "?" rdf:type schema:Person'],
    },
    {
      name: "subjects",
      args: "[type]",
      description: "List graph subjects, optionally filtered by type",
      examples: ["fit-rag subjects", "fit-rag subjects schema:Person"],
    },
  ],
  examples: [
    "fit-rag search 'career progression'",
    'fit-rag query "?" rdf:type schema:Person',
    "fit-rag subjects schema:Person",
  ],
  documentation: [
    {
      title: "Search Semantically",
      url: "https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md",
      description:
        "Find related content by meaning with ranked results from a vector index, no vector database required.",
    },
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
        "The full workflow for building the graph and vector indexes from HTML knowledge sources, then querying them.",
    },
  ],
};

const HANDLERS = {
  search: () => import("../src/commands/search.js"),
  query: () => import("../src/commands/query.js"),
  subjects: () => import("../src/commands/subjects.js"),
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("rag", runtime);

/**
 * Parse argv, route the leading positional to its read handler.
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const subcommand = parsed.positionals[0];
  const load = HANDLERS[subcommand];
  if (!load) {
    cli.usageError(
      `unknown command "${subcommand ?? ""}" (expected search, query, or subjects)`,
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
