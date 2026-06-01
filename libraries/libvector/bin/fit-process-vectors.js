#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { VectorProcessor } from "@forwardimpact/libvector/processor/vector.js";

// `bun build --compile` injects FIT_PROCESS_VECTORS_VERSION via --define,
// eliminating the readFileSync branch in the compiled binary (which would
// ENOENT against the bunfs virtual mount). Source execution falls through.
const VERSION =
  process.env.FIT_PROCESS_VECTORS_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-process-vectors",
  version: VERSION,
  description: "Process resources into vector embeddings",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, { runtime });
const logger = createLogger("vectors", runtime);

/**
 * Processes resources into vector embeddings
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const embeddingConfig = await createServiceConfig("embedding");
  const { EmbeddingClient } = clients;
  const embeddingClient = new EmbeddingClient(embeddingConfig);

  const vectorStorage = createStorage("vectors");

  const resourceIndex = createResourceIndex("resources");
  const vectorIndex = new VectorIndex(vectorStorage);
  const llm = {
    async createEmbeddings(input) {
      const req = new embedding.EmbeddingsRequest({
        input: Array.isArray(input) ? input : [input],
      });
      const res = await embeddingClient.CreateEmbeddings(req);
      return {
        data: res.data.map((v) => ({ embedding: Array.from(v.values) })),
      };
    },
  };

  const processor = new VectorProcessor(
    vectorIndex,
    resourceIndex,
    llm,
    logger,
  );

  const actor = "common.System.root";

  // Process content representation
  await processor.process(actor);
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
