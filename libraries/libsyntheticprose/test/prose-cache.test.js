import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";
import { ProseCache } from "../src/engine/cache.js";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

function makeCache(cachePath, mockFs, extraOptions = {}) {
  const runtime = createTestRuntime({ fs: mockFs, fsSync: mockFs });
  return new ProseCache({
    cachePath,
    logger: makeLogger(),
    runtime,
    ...extraOptions,
  });
}

describe("ProseCache", () => {
  test("get returns undefined and bumps misses on absent key", () => {
    const mockFs = createMockFs();
    const cache = makeCache("/cache/cache.json", mockFs);
    assert.strictEqual(cache.get("nope"), undefined);
    assert.strictEqual(cache.stats.misses, 1);
    assert.strictEqual(cache.stats.hits, 0);
    assert.deepStrictEqual([...cache.stats.missKeys], ["nope"]);
  });

  test("missKeys deduplicates repeat lookups of the same absent key", () => {
    const mockFs = createMockFs();
    const cache = makeCache("/cache/cache.json", mockFs);
    cache.get("a");
    cache.get("a");
    cache.get("b");
    assert.strictEqual(cache.stats.misses, 3);
    assert.deepStrictEqual([...cache.stats.missKeys].sort(), ["a", "b"]);
  });

  test("set then get returns value and bumps hits", () => {
    const mockFs = createMockFs();
    const cache = makeCache("/cache/cache.json", mockFs);
    cache.set("k", "v");
    assert.strictEqual(cache.get("k"), "v");
    assert.strictEqual(cache.stats.hits, 1);
    assert.strictEqual(cache.has("k"), true);
  });

  test("save writes dirty cache; reload restores entries", () => {
    const cachePath = "/cache/cache.json";
    const mockFs = createMockFs();

    const cache = makeCache(cachePath, mockFs);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.save();

    const onDisk = JSON.parse(mockFs.readFileSync(cachePath, "utf-8"));
    assert.deepStrictEqual(onDisk, { _schema: 1, a: "1", b: "2" });

    const reloaded = makeCache(cachePath, mockFs);
    assert.strictEqual(reloaded.get("a"), "1");
    assert.strictEqual(reloaded.get("b"), "2");
    assert.deepStrictEqual([...reloaded.keys()], ["a", "b"]);
  });

  test("save is a no-op when cache is not dirty", () => {
    const cachePath = "/cache/cache.json";
    const mockFs = createMockFs({
      [cachePath]: JSON.stringify({ pre: "loaded" }),
    });
    const cache = makeCache(cachePath, mockFs);
    // No mutation — save should not rewrite the file.
    const before = mockFs.readFileSync(cachePath, "utf-8");
    cache.save();
    const after = mockFs.readFileSync(cachePath, "utf-8");
    assert.strictEqual(before, after);
  });

  test("schema-mismatched cache file is discarded", () => {
    const cachePath = "/cache/cache.json";
    const mockFs = createMockFs({
      [cachePath]: JSON.stringify({ _schema: 99, leftover: "x" }),
    });
    const cache = makeCache(cachePath, mockFs);
    assert.strictEqual(cache.has("leftover"), false);
    assert.deepStrictEqual([...cache.keys()], []);
  });

  test("corrupt cache file falls back to empty map", () => {
    const cachePath = "/cache/cache.json";
    const mockFs = createMockFs({ [cachePath]: "{not json" });
    const cache = makeCache(cachePath, mockFs);
    assert.strictEqual(cache.has("anything"), false);
    assert.deepStrictEqual([...cache.keys()], []);
  });
});
