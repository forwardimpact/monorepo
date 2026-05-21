import { services } from "@forwardimpact/librpc";

const { EmbeddingBase } = services;

/**
 * gRPC embedding service that wraps a Text Embeddings Inference (TEI) HTTP
 * backend. Implements the `Embedding` proto contract by forwarding requests
 * to `<backendUrl>/v1/embeddings` and reshaping the TEI response into the
 * proto's `EmbeddingsResponse` form.
 */
export class EmbeddingService extends EmbeddingBase {
  #backendUrl;

  /**
   * @param {import("@forwardimpact/libconfig").Config} config - Service
   *   config produced by `createServiceConfig("embedding")`.
   * @param {string} backendUrl - Base URL of the TEI HTTP endpoint (e.g.
   *   `http://localhost:8080`). Required — throws if missing or empty.
   */
  constructor(config, backendUrl) {
    super(config);
    if (!backendUrl) throw new Error("backendUrl is required");
    this.#backendUrl = backendUrl;
  }

  /**
   * Embed one or more input strings via the TEI backend.
   *
   * @param {{input: string[]}} req - Proto `EmbeddingsRequest`. `input` is
   *   the list of strings to embed, in order.
   * @returns {Promise<{data: Array<{values: number[]}>}>} Proto
   *   `EmbeddingsResponse`: one `EmbeddingVector` per input string, in the
   *   same order.
   * @throws {Error} When the TEI backend returns a non-2xx response.
   */
  async CreateEmbeddings(req) {
    const res = await fetch(`${this.#backendUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: req.input, model: "default" }),
    });
    if (!res.ok) throw new Error(`TEI request failed: ${res.status}`);
    const body = await res.json();
    return { data: body.data.map((d) => ({ values: d.embedding })) };
  }
}
