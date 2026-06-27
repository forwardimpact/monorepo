#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createGraphIndex } from "@forwardimpact/libgraph";

const definition = {
  name: "fit-subjects",
  description: "List graph subjects, optionally filtered by type",
  usage: "fit-subjects [type]",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-subjects", "fit-subjects schema:Person"],
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
const logger = createLogger("subjects", runtime);

/**
 * Lists graph subjects, optionally filtered by type
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const type = parsed.positionals[0] || null;
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const subjects = await graphIndex.getSubjects(type);

  for (const [subject, subjectType] of subjects) {
    console.log(`${subject}\t${subjectType}`);
  }
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
