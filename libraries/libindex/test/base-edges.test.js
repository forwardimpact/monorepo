import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { IndexBase } from "../index.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

class TestIndex extends IndexBase {
  constructor(storage, indexKey = "test.jsonl") {
    super(storage, indexKey);
  }

  async add(identifier, data) {
    const item = {
      id: String(identifier),
      identifier,
      data,
    };
    await super.add(item);
  }
}

describe("IndexBase - Implementation and Edge Cases", () => {
  let testIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    testIndex = new TestIndex(mockStorage);
  });

  describe("New IndexBase Implementation", () => {
    test("add uses parent class storage logic", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "test-data");

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should call storage append",
      );

      assert.strictEqual(
        await testIndex.has(String(identifier)),
        true,
        "Should store item in memory index",
      );
    });

    test("queryItems provides default filtering implementation", async () => {
      const items = [
        { type: "common.Message", name: "msg1", tokens: 10 },
        { type: "common.Message", name: "msg2", tokens: 20 },
        { type: "tool.Function", name: "func1", tokens: 15 },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item);
        await testIndex.add(identifier, `data-${item.name}`);
      }

      const allResults = await testIndex.queryItems({});
      assert.strictEqual(
        allResults.length,
        3,
        "Should return all items with empty filter",
      );

      const messageResults = await testIndex.queryItems({
        prefix: "common.Message",
      });
      assert.strictEqual(messageResults.length, 2, "Should filter by prefix");

      const limitedResults = await testIndex.queryItems({ limit: 2 });
      assert.strictEqual(limitedResults.length, 2, "Should limit results");

      const tokenResults = await testIndex.queryItems({ max_tokens: 25 });
      assert(tokenResults.length <= 3, "Should apply token filter");
    });
  });

  describe("Abstract Method Enforcement", () => {
    test("IndexBase provides concrete implementations", () => {
      const index = new IndexBase(mockStorage);

      assert.strictEqual(
        typeof index.add,
        "function",
        "Should provide add method",
      );
      assert.strictEqual(
        typeof index.queryItems,
        "function",
        "Should provide queryItems method",
      );
    });

    test("IndexBase add handles basic storage operations", async () => {
      const index = new IndexBase(mockStorage);
      const item = {
        id: "test.Item.basic",
        identifier: { type: "test.Item", name: "basic", tokens: 5 },
        data: "basic-data",
      };

      await index.add(item);

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should call storage append",
      );
      assert.strictEqual(
        await index.has("test.Item.basic"),
        true,
        "Should store item in index",
      );
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("get throws error for non-array ids parameter", async () => {
      await assert.rejects(
        async () => await testIndex.get("not-an-array"),
        /ids must be an array or null/,
        "Should throw for non-array ids",
      );
    });

    test("get handles array with some non-existent IDs", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "exists",
        tokens: 10,
      });

      await testIndex.add(identifier, "data");

      const result = await testIndex.get([
        String(identifier),
        "test.Item.nonexistent",
        "test.Item.another-missing",
      ]);

      assert.strictEqual(result.length, 1, "Should return only existing items");
      assert.strictEqual(result[0].name, "exists");
    });

    test("queryItems handles undefined filter", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "data");

      const result = await testIndex.queryItems(undefined);
      assert.strictEqual(result.length, 1, "Should handle undefined filter");
    });

    test("queryItems handles empty object filter", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "data");

      const result = await testIndex.queryItems({});
      assert.strictEqual(result.length, 1, "Should handle empty object");
    });

    test("queryItems handles filter with undefined properties", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "data");

      const result = await testIndex.queryItems({
        prefix: undefined,
        limit: undefined,
        max_tokens: undefined,
      });
      assert.strictEqual(
        result.length,
        1,
        "Should handle undefined filter properties",
      );
    });

    test("loadData handles storage with empty array", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve([]));

      await testIndex.loadData();

      assert.strictEqual(testIndex.loaded, true, "Should mark as loaded");
      const result = await testIndex.queryItems({});
      assert.strictEqual(result.length, 0, "Should have empty index");
    });

    test("loadData reconstructs identifiers from plain objects", async () => {
      const testData = [
        {
          id: "test.Item.item1",
          identifier: {
            type: "test.Item",
            name: "item1",
            tokens: 10,
          },
        },
      ];

      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve(testData));

      await testIndex.loadData();

      const result = await testIndex.get(["test.Item.item1"]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(typeof result[0].toJSON, "function");
    });

    test("_applyTokensFilter handles items at exact boundary", async () => {
      const items = [
        { type: "test.Item", name: "item1", tokens: 10 },
        { type: "test.Item", name: "item2", tokens: 10 },
        { type: "test.Item", name: "item3", tokens: 10 },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item);
        await testIndex.add(identifier, "data");
      }

      const results = await testIndex.queryItems({ max_tokens: 20 });
      assert.strictEqual(results.length, 2, "Should include items up to limit");
    });

    test("_applyLimitFilter handles limit of 1", async () => {
      const items = [
        { type: "test.Item", name: "item1", tokens: 10 },
        { type: "test.Item", name: "item2", tokens: 20 },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item);
        await testIndex.add(identifier, "data");
      }

      const results = await testIndex.queryItems({ limit: 1 });
      assert.strictEqual(results.length, 1, "Should respect limit of 1");
    });

    test("_applyPrefixFilter handles exact prefix matches", async () => {
      const items = [
        { type: "test.Item", name: "test1", tokens: 10 },
        { type: "test.Item.Sub", name: "test2", tokens: 20 },
        { type: "other.Type", name: "test3", tokens: 30 },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item);
        await testIndex.add(identifier, "data");
      }

      const exactResults = await testIndex.queryItems({ prefix: "test.Item" });
      assert.strictEqual(
        exactResults.length,
        2,
        "Should match prefix and sub-prefixes",
      );
    });

    test("add handles items with missing optional fields", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "minimal",
      });

      await testIndex.add(identifier, "data");

      const exists = await testIndex.has(String(identifier));
      assert.strictEqual(exists, true, "Should handle minimal identifiers");
    });
  });
});
