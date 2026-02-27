import { services } from "@forwardimpact/librpc";
import { llm } from "@forwardimpact/libtype";

const { VectorBase } = services;

/**
 * Vector search service for querying content vector index
 */
export class VectorService extends VectorBase {
  #vectorIndex;
  #llmClient;

  /**
   * Creates a new Vector service instance
   * @param {import("@forwardimpact/libconfig").ServiceConfigInterface} config - Service configuration object
   * @param {import("@forwardimpact/libvector").VectorIndexInterface} vectorIndex - Pre-initialized vector index
   * @param {object} llmClient - LLM service client for embeddings
   * @param {Function} logFn - Optional logging function
   */
  constructor(config, vectorIndex, llmClient, logFn) {
    super(config, logFn);
    if (!vectorIndex) throw new Error("vectorIndex is required");
    if (!llmClient) throw new Error("llmClient is required");

    this.#vectorIndex = vectorIndex;
    this.#llmClient = llmClient;
  }

  /**
   * Search content index using text input
   * @param {import("@forwardimpact/libtype").vector.TextQuery} req - Text query request
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>} Query results with resource identifiers
   */
  async SearchContent(req) {
    const embeddingRequest = llm.EmbeddingsRequest.fromObject(req);
    const embeddings = await this.#llmClient.CreateEmbeddings(embeddingRequest);

    if (!embeddings.data?.length) {
      throw new Error("No embeddings returned from LLM service");
    }

    const vectors = embeddings.data.map((item) => item.embedding);

    const identifiers = await this.#vectorIndex.queryItems(vectors, req.filter);
    return { identifiers };
  }
}
