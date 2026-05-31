import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import { EmbeddingService } from "../index.js";

// RPC-contract snapshot (plan-a-06 Step 2 substitution for services): the
// embedding adapter is a thin translator over the TEI HTTP backend, so the
// contract is the request it issues and the proto-shaped response it returns.
// The backend is stubbed via a fake `fetch`, so no real subprocess or network
// is touched — the test exercises only the adapter's record shape.

describe("embedding service contract", () => {
  const config = { backend_port: 8090, model: "test-model" };
  const backendUrl = "http://127.0.0.1:8090";
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("construction requires a backendUrl", () => {
    assert.throws(() => new EmbeddingService(config, ""), /backendUrl/);
  });

  test("CreateEmbeddings posts to the TEI endpoint and maps embeddings to values", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
        }),
      };
    };

    const service = new EmbeddingService(config, backendUrl);
    const res = await service.CreateEmbeddings({ input: ["a", "b"] });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `${backendUrl}/v1/embeddings`);
    assert.strictEqual(calls[0].init.method, "POST");
    // The adapter intentionally sends a fixed `model: "default"` (TEI is
    // single-model per process; the model is selected at spawn via
    // `--model-id`), so `config.model` does not flow into the request body.
    assert.deepStrictEqual(JSON.parse(calls[0].init.body), {
      input: ["a", "b"],
      model: "default",
    });
    assert.deepStrictEqual(res, {
      data: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
    });
  });

  test("CreateEmbeddings throws on a non-2xx backend response", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    const service = new EmbeddingService(config, backendUrl);
    await assert.rejects(
      () => service.CreateEmbeddings({ input: ["a"] }),
      /503/,
    );
  });
});
