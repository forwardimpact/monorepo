import { createGraphIndex, parseGraphQuery } from "@forwardimpact/libgraph";

/**
 * Format one `fit-rag query` result line — the bare identifier, byte-identical
 * to the old `fit-query` output.
 * @param {unknown} identifier
 * @returns {string}
 */
export function formatQueryLine(identifier) {
  return String(identifier);
}

/**
 * `fit-rag query` — query the graph index with a triple pattern. Ports
 * `fit-query`; prints one bare identifier per line.
 * @param {object} ctx
 * @param {string[]} ctx.positionals - Subcommand arguments: `<subject> <predicate> <object>`
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @param {import("@forwardimpact/libcli").Cli} ctx.cli
 * @returns {Promise<void>}
 */
export async function run({ positionals, runtime, cli }) {
  if (positionals.length !== 3) {
    cli.usageError("expected 3 arguments: <subject> <predicate> <object>");
    process.exit(2);
  }

  const pattern = parseGraphQuery(positionals.join(" "));
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const identifiers = await graphIndex.queryItems(pattern);

  for (const identifier of identifiers) {
    console.log(formatQueryLine(identifier));
  }
}
