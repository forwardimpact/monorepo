import { createServiceConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { VectorProcessor } from "@forwardimpact/libvector/processor/vector.js";

/**
 * `fit-process vectors` — process resources into vector embeddings (the
 * `vectors` index). Ports `fit-process-vectors`. Builds the embedding client
 * here so the offline write commands never require the embedding service.
 * @param {object} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ runtime }) {
  const logger = createLogger("vectors", runtime);

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
