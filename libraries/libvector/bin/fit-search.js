#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";

// `bun build --compile` injects FIT_SEARCH_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_SEARCH_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-search",
  version: VERSION,
  description: "Search vector index by embedding a query string",
  usage: "fit-search <query>",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-search 'career progression'"],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
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
  const embeddingClient = new EmbeddingClient(embeddingConfig);

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
