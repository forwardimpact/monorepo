import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { createStorage } from "@forwardimpact/libstorage";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";

/**
 * Format one `fit-rag search` result line — `identifier<TAB>score` with the
 * score fixed to four decimals (empty when absent), byte-identical to the old
 * `fit-search` output.
 * @param {{ score?: number }} identifier
 * @returns {string}
 */
export function formatSearchLine(identifier) {
  return `${String(identifier)}\t${identifier.score?.toFixed(4) ?? ""}`;
}

/**
 * `fit-rag search` — search the vector index by embedding a query string.
 * Ports `fit-search`. Builds the embedding client here so the offline read
 * commands never require the embedding service.
 * @param {object} ctx
 * @param {string[]} ctx.positionals - Subcommand arguments: `<query>`
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @param {import("@forwardimpact/libcli").Cli} ctx.cli
 * @returns {Promise<void>}
 */
export async function run({ positionals, runtime, cli }) {
  const query = positionals.join(" ");
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
    console.log(formatSearchLine(identifier));
  }
}
