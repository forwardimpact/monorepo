#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";

const definition = {
  name: "fit-search",
  description: "Search vector index by embedding a query string",
  usage: "fit-search <query>",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-search 'career progression'"],
  documentation: [
    {
      title: "Search Semantically",
      url: "https://www.forwardimpact.team/docs/libraries/ground-agents/search-semantically/index.md",
      description:
        "Find related content by meaning with ranked results from a vector index, no vector database required.",
    },
    {
      title: "Give Agents Typed, Retrievable Knowledge",
      url: "https://www.forwardimpact.team/docs/libraries/ground-agents/index.md",
      description:
        "The full workflow for building an embedding pipeline from knowledge sources.",
    },
  ],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("search", runtime);

/**
 * Searches vector index by embedding a query string
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const query = parsed.positionals.join(" ");
  if (!query) {
    cli.usageError("expected a query string");
    process.exit(2);
  }

  const embeddingConfig = await createServiceConfig("embedding");
  const { EmbeddingClient } = clients;
  const embeddingClient = new EmbeddingClient(embeddingConfig, runtime);

  const storage = createStorage("vectors");
  const vectorIndex = new VectorIndex(storage);

  const req = new embedding.EmbeddingsRequest({ input: [query] });
  const res = await embeddingClient.CreateEmbeddings(req);
  const vectors = res.data.map((d) => Array.from(d.values));
  const results = await vectorIndex.queryItems(vectors, { limit: 10 });

  for (const identifier of results) {
    console.log(`${String(identifier)}\t${identifier.score?.toFixed(4) ?? ""}`);
  }
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
