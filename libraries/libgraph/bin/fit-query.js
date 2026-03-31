#!/usr/bin/env bun
import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";

/**
 * Queries the graph index with a triple pattern
 * Usage: fit-query <subject> <predicate> <object>
 * @returns {Promise<void>}
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error("Usage: fit-query <subject> <predicate> <object>");
    console.error('Example: fit-query "?" rdf:type schema:Person');
    process.exit(1);
  }

  const pattern = parseGraphQuery(args.join(" "));
  const graphIndex = createGraphIndex("graphs");

  const identifiers = await graphIndex.queryItems(pattern);

  for (const identifier of identifiers) {
    console.log(String(identifier));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
