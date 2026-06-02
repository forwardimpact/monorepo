#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

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

const definition = {
  name: "fit-process-vectors",
  description: "Process resources into vector embeddings",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
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
  const embeddingClient = new EmbeddingClient(embeddingConfig, runtime);

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
