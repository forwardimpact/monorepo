import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { LlmApi, DEFAULT_BASE_URL } from "../index.js";
import { Retry } from "@forwardimpact/libutil";

const EMBEDDING_BASE_URL = "http://localhost:8090";

describe("LlmApi instance methods", () => {
  let llmApi;
  let retry;

  beforeEach(() => {
    const mockFetch = mock.fn();
    retry = new Retry();
    llmApi = new LlmApi(
      "test-token",
      "gpt-4",
      DEFAULT_BASE_URL,
      EMBEDDING_BASE_URL,
      retry,
      mockFetch,
    );
  });

  test("countTokens returns token count for text", () => {
    const text = "Hello, world!";
    const count = llmApi.countTokens(text);

    assert.strictEqual(typeof count, "number");
    assert(count > 0);
  });

  test("countTokens handles empty text", () => {
    const count = llmApi.countTokens("");
    assert.strictEqual(count, 0);
  });

  test("countTokens handles longer text", () => {
    const shortText = "Hello";
    const longText =
      "Hello, this is a much longer text that should have more tokens";

    const shortCount = llmApi.countTokens(shortText);
    const longCount = llmApi.countTokens(longText);

    assert(longCount > shortCount);
  });
});

describe("Proxy Support", () => {
  test("createLlmApi creates LlmApi instance with default fetch", async () => {
    const { createLlmApi, LlmApi, DEFAULT_BASE_URL } =
      await import("../index.js");

    const llm = createLlmApi(
      "test-token",
      "gpt-4",
      DEFAULT_BASE_URL,
      EMBEDDING_BASE_URL,
    );

    assert.ok(llm instanceof LlmApi);
  });

  test("createLlmApi throws when embeddingBaseUrl is not provided", async () => {
    const { createLlmApi, DEFAULT_BASE_URL } = await import("../index.js");

    assert.throws(() => createLlmApi("test-token", "gpt-4", DEFAULT_BASE_URL), {
      message: /embeddingBaseUrl is required/,
    });
  });

  test("createLlmApi works when HTTPS_PROXY environment variable is set", async () => {
    const originalProxy = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = "http://proxy.example.com:3128";

    try {
      const { createLlmApi, LlmApi, DEFAULT_BASE_URL } =
        await import("../index.js");

      const llm = createLlmApi(
        "test-token",
        "gpt-4",
        DEFAULT_BASE_URL,
        EMBEDDING_BASE_URL,
      );

      assert.ok(llm instanceof LlmApi);
    } finally {
      if (originalProxy) {
        process.env.HTTPS_PROXY = originalProxy;
      } else {
        delete process.env.HTTPS_PROXY;
      }
    }
  });
});
