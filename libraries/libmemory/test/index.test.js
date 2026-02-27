import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { MemoryIndex } from "../index/memory.js";
import { resource } from "@forwardimpact/libtype";

describe("MemoryIndex - IndexBase Functionality", () => {
  let storage;
  let memoryIndex;

  beforeEach(() => {
    storage = {
      exists: mock.fn(() => Promise.resolve(false)),
      get: mock.fn(() => Promise.resolve([])),
      append: mock.fn(() => Promise.resolve()),
    };

    memoryIndex = new MemoryIndex(storage, "test-conversation.jsonl");
  });

  describe("Constructor and Properties", () => {
    it("should throw error when storage is missing", () => {
      assert.throws(() => new MemoryIndex(), /storage is required/);
    });

    it("should set properties correctly", () => {
      const index = new MemoryIndex(storage, "custom.jsonl");
      assert.strictEqual(index.storage(), storage, "Should set storage");
      assert.strictEqual(index.indexKey, "custom.jsonl", "Should set indexKey");
      assert.strictEqual(
        index.loaded,
        false,
        "Should initialize loaded as false",
      );
    });

    it("should use default indexKey when not provided", () => {
      const index = new MemoryIndex(storage);
      assert.strictEqual(
        index.indexKey,
        "index.jsonl",
        "Should use default indexKey",
      );
    });
  });

  describe("Data Loading", () => {
    it("should initialize empty index when file doesn't exist", async () => {
      storage.exists = mock.fn(() => Promise.resolve(false));

      await memoryIndex.loadData();

      assert.strictEqual(memoryIndex.loaded, true, "Should mark as loaded");
      assert.strictEqual(
        storage.exists.mock.callCount(),
        1,
        "Should check file existence",
      );
      assert.strictEqual(
        storage.get.mock.callCount(),
        0,
        "Should not try to read non-existent file",
      );
    });

    it("should load existing data from storage", async () => {
      const testData = [
        {
          id: "common.Message.msg1",
          identifier: { type: "common.Message", name: "msg1", tokens: 10 },
        },
        {
          id: "common.Message.msg2",
          identifier: { type: "common.Message", name: "msg2", tokens: 20 },
        },
      ];

      storage.exists = mock.fn(() => Promise.resolve(true));
      storage.get = mock.fn(() => Promise.resolve(testData));

      await memoryIndex.loadData();

      assert.strictEqual(memoryIndex.loaded, true, "Should mark as loaded");
      assert.strictEqual(
        storage.exists.mock.callCount(),
        1,
        "Should check file existence",
      );
      assert.strictEqual(
        storage.get.mock.callCount(),
        1,
        "Should read existing file",
      );

      // Verify data was loaded into index
      assert.strictEqual(
        await memoryIndex.has("common.Message.msg1"),
        true,
        "Should load first item",
      );
      assert.strictEqual(
        await memoryIndex.has("common.Message.msg2"),
        true,
        "Should load second item",
      );
    });

    it("should be idempotent", async () => {
      storage.exists = mock.fn(() => Promise.resolve(false));

      await memoryIndex.loadData();
      storage.exists.mock.resetCalls();

      await memoryIndex.loadData();

      assert.strictEqual(
        storage.exists.mock.callCount(),
        0,
        "Should not check existence again when already loaded",
      );
      assert.strictEqual(memoryIndex.loaded, true, "Should remain loaded");
    });
  });

  describe("Item Management", () => {
    it("should return false for non-existent items", async () => {
      const exists = await memoryIndex.has("common.Message.nonexistent");
      assert.strictEqual(
        exists,
        false,
        "Should return false for non-existent item",
      );
    });

    it("should return true for existing items", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      await memoryIndex.add([identifier]);
      const exists = await memoryIndex.has(String(identifier));

      assert.strictEqual(exists, true, "Should return true for existing item");
    });

    it("should add items with correct structure", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      await memoryIndex.add([identifier]);

      assert.strictEqual(
        storage.append.mock.callCount(),
        1,
        "Should call storage append",
      );

      const appendedData = JSON.parse(
        storage.append.mock.calls[0].arguments[1],
      );
      assert.strictEqual(appendedData.id, String(identifier));
      assert.strictEqual(appendedData.identifier.name, "test1");
      assert.strictEqual(appendedData.identifier.type, "common.Message");
      assert.strictEqual(appendedData.identifier.tokens, 10);
    });

    it("should get items by IDs", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      await memoryIndex.add([identifier]);
      const result = await memoryIndex.get([String(identifier)]);

      assert.strictEqual(result.length, 1, "Should return one item");
      assert.strictEqual(
        result[0].name,
        "test1",
        "Should return correct identifier",
      );
      assert.strictEqual(
        result[0].type,
        "common.Message",
        "Should return correct type",
      );
      assert.strictEqual(result[0].tokens, 10, "Should return correct tokens");
    });

    it("should return empty array for non-existent IDs", async () => {
      const result = await memoryIndex.get(["common.Message.nonexistent"]);
      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for non-existent item",
      );
    });

    it("should handle null IDs parameter", async () => {
      const result = await memoryIndex.get(null);
      assert.deepStrictEqual(result, [], "Should return empty array for null");
    });

    it("should handle empty IDs array", async () => {
      const result = await memoryIndex.get([]);
      assert.deepStrictEqual(
        result,
        [],
        "Should return empty array for empty array",
      );
    });
  });

  describe("Query and Filtering", () => {
    beforeEach(async () => {
      // Add test items with different types and token counts
      const items = [
        { type: "common.Message", name: "msg1", tokens: 10 },
        { type: "common.Message", name: "msg2", tokens: 20 },
        { type: "tool.ToolFunction", name: "func1", tokens: 15 },
        { type: "tool.ToolFunction", name: "func2", tokens: 25 },
        { type: "resource.Document", name: "doc1", tokens: 30 },
      ];

      const identifiers = items.map((item) =>
        resource.Identifier.fromObject(item),
      );
      await memoryIndex.add(identifiers);
    });

    it("should return all items without filters", async () => {
      const results = await memoryIndex.queryItems({});
      assert.strictEqual(
        results.length,
        5,
        "Should return all items without filters",
      );
    });

    it("should filter by prefix", async () => {
      const messageResults = await memoryIndex.queryItems({
        prefix: "common.Message",
      });
      assert.strictEqual(
        messageResults.length,
        2,
        "Should return only Message items",
      );

      const toolResults = await memoryIndex.queryItems({
        prefix: "tool.ToolFunction",
      });
      assert.strictEqual(
        toolResults.length,
        2,
        "Should return only ToolFunction items",
      );

      const noMatchResults = await memoryIndex.queryItems({
        prefix: "nonexistent",
      });
      assert.strictEqual(
        noMatchResults.length,
        0,
        "Should return no items for non-matching prefix",
      );
    });

    it("should apply limit filter", async () => {
      const limitedResults = await memoryIndex.queryItems({ limit: 3 });
      assert.strictEqual(
        limitedResults.length,
        3,
        "Should return limited items",
      );

      const zeroLimitResults = await memoryIndex.queryItems({ limit: 0 });
      assert.strictEqual(
        zeroLimitResults.length,
        5,
        "Should return all items when limit is 0",
      );
    });

    it("should apply max_tokens filter", async () => {
      const tokenLimitedResults = await memoryIndex.queryItems({
        max_tokens: 35,
      });
      assert(
        tokenLimitedResults.length >= 1,
        "Should return at least one item within token limit",
      );
      assert(
        tokenLimitedResults.length <= 5,
        "Should not return more than available items",
      );

      const strictTokenResults = await memoryIndex.queryItems({
        max_tokens: 20,
      });
      assert.strictEqual(
        strictTokenResults.length,
        1,
        "Should return only first item for strict limit",
      );

      const veryStrictResults = await memoryIndex.queryItems({
        max_tokens: 5,
      });
      assert.strictEqual(
        veryStrictResults.length,
        0,
        "Should return no items when first exceeds limit",
      );
    });

    it("should apply combined filters", async () => {
      const combinedResults = await memoryIndex.queryItems({
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

    it("should throw error when identifier is missing tokens field", async () => {
      // Add item without tokens by directly manipulating index
      const badIdentifier = {
        type: "common.Message",
        name: "bad",
      };
      const badItem = {
        id: "common.Message.bad",
        identifier: badIdentifier,
      };
      memoryIndex.index.set(badItem.id, badItem);

      await assert.rejects(
        async () => await memoryIndex.queryItems({ max_tokens: 100 }),
        /Identifier missing tokens field/,
        "Should throw when tokens field is missing",
      );
    });
  });

  describe("Deduplication Behavior", () => {
    it("should deduplicate items with same ID", async () => {
      const identifier1 = resource.Identifier.fromObject({
        name: "msg1",
        type: "common.Message",
        tokens: 10,
      });
      const identifier2 = resource.Identifier.fromObject({
        name: "msg1",
        type: "common.Message",
        tokens: 12,
      });

      await memoryIndex.add([identifier1]);
      await memoryIndex.add([identifier2]);

      const memory = await memoryIndex.queryItems();

      assert.strictEqual(memory.length, 1, "Should have only one item");
      assert.strictEqual(memory[0].tokens, 12, "Should keep latest occurrence");
    });
  });
});
