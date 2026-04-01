#!/usr/bin/env node
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLlmApi } from "@forwardimpact/libllm";
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";

/**
 * Searches vector index by embedding a query string
 * Usage: fit-search <query>
 * @returns {Promise<void>}
 */
async function main() {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.error("Usage: fit-search <query>");
    process.exit(1);
  }

  const config = await createScriptConfig("vectors");
  const storage = createStorage("vectors");
  const vectorIndex = new VectorIndex(storage);

  const llm = createLlmApi(
    await config.llmToken(),
    undefined,
    config.llmBaseUrl(),
    config.embeddingBaseUrl(),
  );

  const embeddings = await llm.createEmbeddings([query]);
  const results = await vectorIndex.queryItems(embeddings, { limit: 10 });

  for (const identifier of results) {
    console.log(`${String(identifier)}\t${identifier.score?.toFixed(4) ?? ""}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
