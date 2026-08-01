import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";
import { ProseCache } from "../src/engine/cache.js";
import { ProseGenerator } from "../src/engine/generator.js";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

function makePromptLoader() {
  return {
    load: () => "system prompt",
    render: () => "rendered prompt",
  };
}

function makeLlmApi(response = "test response") {
  return {
    createCompletions: async () => ({
      choices: [{ message: { content: response } }],
    }),
  };
}

const CACHE_PATH = "/prose/cache.json";

function makeFixture(overrides = {}) {
  // The runtime is shared and in memory. The mock fs persists writes,
  // so a second ProseCache over the same path sees what the first one
  // saved.
  const runtime = createTestRuntime({ fs: createMockFs() });
  const cache = new ProseCache({
    cachePath: CACHE_PATH,
    logger: makeLogger(),
    runtime,
  });
  const generator = new ProseGenerator({
    cache,
    mode: "generate",
    llmApi: makeLlmApi(),
    promptLoader: makePromptLoader(),
    logger: makeLogger(),
    runtime,
    ...overrides,
  });
  return { cache, generator, runtime };
}

describe("ProseGenerator", () => {
  test("generatePlain returns null in no-prose mode", async () => {
    const { generator } = makeFixture({ mode: "no-prose" });
    const result = await generator.generatePlain("test-key", {
      topic: "test",
    });
    assert.strictEqual(result, null);
  });

  test("generatePlain writes through to cache and bumps generated count", async () => {
    const { cache, generator } = makeFixture({
      llmApi: makeLlmApi("fresh response"),
    });
    const r1 = await generator.generatePlain("key1", { topic: "test" });
    assert.strictEqual(r1, "fresh response");
    assert.strictEqual(generator.stats.generated, 1);
    assert.strictEqual([...cache.keys()].length, 1);
  });

  test("generatePlain returns cached value with no LLM call", async () => {
    const { cache, generator, runtime } = makeFixture({
      llmApi: makeLlmApi("first"),
    });
    await generator.generatePlain("key1", { topic: "test" });
    cache.save();

    // New generator over the same cache file (same runtime → same mock fs),
    // in cached mode (no LLM).
    const cache2 = new ProseCache({
      cachePath: cache.cachePath,
      logger: makeLogger(),
      runtime,
    });
    const generator2 = new ProseGenerator({
      cache: cache2,
      mode: "cached",
      promptLoader: makePromptLoader(),
      logger: makeLogger(),
      runtime,
    });
    const r2 = await generator2.generatePlain("key1", { topic: "test" });
    assert.strictEqual(r2, "first");
    assert.strictEqual(cache2.stats.hits, 1);
    assert.strictEqual(generator2.stats.generated, 0);
  });

  test("generatePlain throws on cache miss when strict + cached", async () => {
    const { generator } = makeFixture({
      mode: "cached",
      strict: true,
    });
    await assert.rejects(
      () => generator.generatePlain("missing", { topic: "x" }),
      /Cache miss/,
    );
  });

  test("generatePlain returns null on cache miss when cached + non-strict", async () => {
    const { generator } = makeFixture({ mode: "cached" });
    const result = await generator.generatePlain("missing", { topic: "x" });
    assert.strictEqual(result, null);
  });

  test("generateStructured respects maxTokens option", async () => {
    let capturedMaxTokens = null;
    const { generator } = makeFixture({
      llmApi: {
        createCompletions: async (opts) => {
          capturedMaxTokens = opts.max_tokens;
          return {
            choices: [{ message: { content: '{"test": true}' } }],
          };
        },
      },
    });
    await generator.generateStructured(
      "test-key",
      [{ role: "user", content: "test" }],
      { maxTokens: 2000 },
    );
    assert.strictEqual(capturedMaxTokens, 2000);
  });

  test("generateJson strips markdown fences", async () => {
    const { generator } = makeFixture({
      llmApi: makeLlmApi('```json\n{"key": "value"}\n```'),
    });
    const result = await generator.generateJson("test-key", [
      { role: "user", content: "test" },
    ]);
    assert.deepStrictEqual(result, { key: "value" });
  });

  test("generateJson returns null in no-prose mode", async () => {
    const { generator } = makeFixture({ mode: "no-prose" });
    const result = await generator.generateJson("test-key", [
      { role: "user", content: "test" },
    ]);
    assert.strictEqual(result, null);
  });
});
