import { services } from "@forwardimpact/librpc";

const { VectorBase } = services;

/**
 * Vector search service that queries the content vector index
 */
export class VectorService extends VectorBase {
  #vectorIndex;
  #embeddingFn;

  /**
   * Creates a new Vector service instance
   * @param {import("@forwardimpact/libconfig").ServiceConfigInterface} config - Service configuration object
   * @param {import("@forwardimpact/libvector").VectorIndexInterface} vectorIndex - Pre-initialized vector index
   * @param {(input: string[]) => Promise<{data: Array<{embedding: number[]}>}>} embeddingFn - Returns embeddings for input texts
   * @param {Function} logFn - Optional function for log output
   */
  constructor(config, vectorIndex, embeddingFn, logFn) {
    super(config, logFn);
    if (!vectorIndex) throw new Error("vectorIndex is required");
    if (!embeddingFn) throw new Error("embeddingFn is required");

    this.#vectorIndex = vectorIndex;
    this.#embeddingFn = embeddingFn;
  }

  /**
   * Search the content index with text input
   * @param {import("@forwardimpact/libtype").vector.TextQuery} req - Text query request
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>} Query results with resource identifiers
   */
  async SearchContent(req) {
    const embeddings = await this.#embeddingFn(req.input);

    if (!embeddings.data?.length) {
      throw new Error("No embeddings returned");
    }

    const vectors = embeddings.data.map((item) => item.embedding);

    const identifiers = await this.#vectorIndex.queryItems(vectors, req.filter);
    return { identifiers };
  }
}
