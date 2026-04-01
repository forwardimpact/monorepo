#!/usr/bin/env node
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLlmApi } from "@forwardimpact/libllm";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { VectorProcessor } from "@forwardimpact/libvector/processor/vector.js";

/**
 * Processes resources into vector embeddings
 * @returns {Promise<void>}
 */
async function main() {
  const config = await createScriptConfig("vectors");

  const vectorStorage = createStorage("vectors");

  const resourceIndex = createResourceIndex("resources");
  const vectorIndex = new VectorIndex(vectorStorage);
  const llm = createLlmApi(
    await config.llmToken(),
    undefined,
    config.llmBaseUrl(),
    config.embeddingBaseUrl(),
  );
  const logger = createLogger("vectors");

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

const logger = createLogger("vectors");

main().catch((error) => {
  logger.exception("main", error);
  process.exit(1);
});
