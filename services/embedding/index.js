import { services } from "@forwardimpact/librpc";

const { EmbeddingBase } = services;

/**
 * gRPC service that produces text embeddings by delegating to a
 * Text Embeddings Inference (TEI) HTTP backend over its OpenAI-compatible
 * `/v1/embeddings` endpoint. The TEI process is spawned by `server.js`; this
 * class is a thin adapter that translates the proto request/response shapes
 * to and from TEI's HTTP payload.
 *
 * Implements the `Embedding.CreateEmbeddings` RPC defined in
 * `proto/embedding.proto`; see `generated/services/embedding/service.js` for
 * the `EmbeddingBase` it extends.
 */
export class EmbeddingService extends EmbeddingBase {
  #backendUrl;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config -
   *   Service configuration from `createServiceConfig("embedding")`.
   * @param {string} backendUrl - Base URL of the TEI HTTP backend
   *   (e.g. `http://127.0.0.1:8090`), without a trailing slash. Required;
   *   construction throws if empty.
   */
  constructor(config, backendUrl) {
    super(config);
    if (!backendUrl) throw new Error("backendUrl is required");
    this.#backendUrl = backendUrl;
  }

  /**
   * Embed one or more input strings via the TEI backend.
   *
   * @param {{input: string[]}} req - Proto-decoded `EmbeddingsRequest`.
   *   `input` is the list of text strings to embed; order is preserved in
   *   the response.
   * @returns {Promise<{data: Array<{values: number[]}>}>} A proto-shaped
   *   `EmbeddingsResponse` with one `EmbeddingVector` per input, in the same
   *   order. `values` is the dense embedding from the configured TEI model.
   * @throws {Error} If the TEI backend returns a non-2xx status. The error
   *   message includes the HTTP status code.
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
