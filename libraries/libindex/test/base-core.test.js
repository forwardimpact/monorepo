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

describe("IndexBase - Core Functionality", () => {
  let testIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    testIndex = new TestIndex(mockStorage);
  });

  describe("Constructor and Properties", () => {
    test("constructor validates storage parameter", () => {
      assert.throws(
        () => new TestIndex(null),
        /storage is required/,
        "Should throw for missing storage",
      );
    });

    test("constructor sets properties correctly", () => {
      const index = new TestIndex(mockStorage, "custom.jsonl");
      assert.strictEqual(index.storage(), mockStorage, "Should set storage");
      assert.strictEqual(index.indexKey, "custom.jsonl", "Should set indexKey");
      assert.strictEqual(
        index.loaded,
        false,
        "Should initialize loaded as false",
      );
    });

    test("constructor uses default indexKey when not provided", () => {
      const index = new TestIndex(mockStorage);
      assert.strictEqual(
        index.indexKey,
        "test.jsonl",
        "Should use default indexKey",
      );
    });
  });

  describe("Data Loading", () => {
    test("loadData initializes empty index when file doesn't exist", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(false));

      await testIndex.loadData();

      assert.strictEqual(testIndex.loaded, true, "Should mark as loaded");
      assert.strictEqual(
        mockStorage.exists.mock.callCount(),
        1,
        "Should check file existence",
      );
      assert.strictEqual(
        mockStorage.get.mock.callCount(),
        0,
        "Should not try to read non-existent file",
      );
    });

    test("loadData loads existing data from storage", async () => {
      const testData = [
        {
          id: "test.Item.item1",
          identifier: { type: "test.Item", name: "item1", tokens: 10 },
          data: "test-data-1",
        },
        {
          id: "test.Item.item2",
          identifier: { type: "test.Item", name: "item2", tokens: 20 },
          data: "test-data-2",
        },
      ];

      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve(testData));

      await testIndex.loadData();

      assert.strictEqual(testIndex.loaded, true, "Should mark as loaded");
      assert.strictEqual(
        mockStorage.exists.mock.callCount(),
        1,
        "Should check file existence",
      );
      assert.strictEqual(
        mockStorage.get.mock.callCount(),
        1,
        "Should read existing file",
      );

      assert.strictEqual(
        await testIndex.has("test.Item.item1"),
        true,
        "Should load first item",
      );
      assert.strictEqual(
        await testIndex.has("test.Item.item2"),
        true,
        "Should load second item",
      );
    });

    test("loadData is idempotent", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(false));

      await testIndex.loadData();
      mockStorage.exists.mock.resetCalls();

      await testIndex.loadData();

      assert.strictEqual(
        mockStorage.exists.mock.callCount(),
        0,
        "Should not check existence again when already loaded",
      );
      assert.strictEqual(testIndex.loaded, true, "Should remain loaded");
    });
  });

  describe("Item Management", () => {
    test("has returns false for non-existent items", async () => {
      const exists = await testIndex.has("test.Item.nonexistent");
      assert.strictEqual(
        exists,
        false,
        "Should return false for non-existent item",
      );
    });

    test("has returns true for existing items", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "test-data");
      const exists = await testIndex.has(String(identifier));

      assert.strictEqual(exists, true, "Should return true for existing item");
    });

    test("get returns empty array for non-existent items", async () => {
      const result = await testIndex.get(["test.Item.nonexistent"]);
      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for non-existent item",
      );
    });

    test("get returns identifier for existing items", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "test.Item",
        name: "test1",
        tokens: 10,
      });

      await testIndex.add(identifier, "test-data");
      const result = await testIndex.get([String(identifier)]);

      assert.strictEqual(result.length, 1, "Should return one item");
      assert.strictEqual(
        result[0].name,
        "test1",
        "Should return correct identifier",
      );
      assert.strictEqual(
        result[0].type,
        "test.Item",
        "Should return correct type",
      );
      assert.strictEqual(result[0].tokens, 10, "Should return correct tokens");
    });
  });

  describe("Shared Filter Logic", () => {
    beforeEach(async () => {
      const items = [
        { type: "common.Message", name: "msg1", tokens: 10, data: "message-1" },
        { type: "common.Message", name: "msg2", tokens: 20, data: "message-2" },
        {
          type: "tool.Function",
          name: "func1",
          tokens: 15,
          data: "function-1",
        },
        {
          type: "tool.Function",
          name: "func2",
          tokens: 25,
          data: "function-2",
        },
        {
          type: "resource.Document",
          name: "doc1",
          tokens: 30,
          data: "document-1",
        },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item);
        await testIndex.add(identifier, item.data);
      }
    });

    test("_applyPrefixFilter works correctly", async () => {
      const allResults = await testIndex.queryItems({});
      const messageResults = await testIndex.queryItems({
        prefix: "common.Message",
      });
      const toolResults = await testIndex.queryItems({
        prefix: "tool.Function",
      });
      const resourceResults = await testIndex.queryItems({
        prefix: "resource.Document",
      });
      const noMatchResults = await testIndex.queryItems({
        prefix: "nonexistent",
      });

      assert.strictEqual(
        allResults.length,
        5,
        "Should return all items without prefix filter",
      );
      assert.strictEqual(
        messageResults.length,
        2,
        "Should return only Message items",
      );
      assert.strictEqual(
        toolResults.length,
        2,
        "Should return only Function items",
      );
      assert.strictEqual(
        resourceResults.length,
        1,
        "Should return only Document items",
      );
      assert.strictEqual(
        noMatchResults.length,
        0,
        "Should return no items for non-matching prefix",
      );
    });

    test("_applyLimitFilter works correctly", async () => {
      const unlimitedResults = await testIndex.queryItems({});
      const limitedResults = await testIndex.queryItems({ limit: 3 });
      const zeroLimitResults = await testIndex.queryItems({ limit: 0 });

      assert.strictEqual(
        unlimitedResults.length,
        5,
        "Should return all items without limit",
      );
      assert.strictEqual(
        limitedResults.length,
        3,
        "Should return limited items",
      );
      assert.strictEqual(
        zeroLimitResults.length,
        5,
        "Should return all items when limit is 0",
      );
    });

    test("_applyTokensFilter works correctly", async () => {
      const unlimitedResults = await testIndex.queryItems({});
      const tokenLimitedResults = await testIndex.queryItems({
        max_tokens: 35,
      });
      const strictTokenResults = await testIndex.queryItems({
        max_tokens: 20,
      });
      const veryStrictResults = await testIndex.queryItems({
        max_tokens: 5,
      });

      assert.strictEqual(
        unlimitedResults.length,
        5,
        "Should return all items without token limit",
      );
      assert(
        tokenLimitedResults.length >= 1,
        "Should return at least one item within token limit",
      );
      assert(
        tokenLimitedResults.length <= 5,
        "Should not return more than available items",
      );
      assert.strictEqual(
        strictTokenResults.length,
        1,
        "Should return only first item for strict limit",
      );
      assert.strictEqual(
        veryStrictResults.length,
        0,
        "Should return no items when first exceeds limit",
      );
    });

    test("combined filters work correctly", async () => {
      const combinedResults = await testIndex.queryItems({
        prefix: "common.Message",
        limit: 1,
        max_tokens: 50,
      });

      assert.strictEqual(
        combinedResults.length,
        1,
        "Should apply all filters together",
      );
      assert(
        String(combinedResults[0]).startsWith("common.Message"),
        "Should match prefix filter",
      );
    });
  });
});
