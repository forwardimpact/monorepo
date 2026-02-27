import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Module under test
import { VectorIndex } from "../index/vector.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("libvector", () => {
  describe("VectorIndex", () => {
    let vectorIndex;
    let mockStorage;

    beforeEach(() => {
      mockStorage = createMockStorage({
        exists: mock.fn(() => Promise.resolve(true)),
        get: mock.fn(() => Promise.resolve(Buffer.from(""))),
      });

      vectorIndex = new VectorIndex(mockStorage);
    });

    test("storage returns storage instance", () => {
      assert.strictEqual(vectorIndex.storage(), mockStorage);
    });

    test("queryItems without maxTokens returns all results", async () => {
      const identifier1 = resource.Identifier.fromObject({
        type: "Message",
        name: "item1",
        tokens: 10,
      });
      const identifier2 = resource.Identifier.fromObject({
        type: "Message",
        name: "item2",
        tokens: 15,
      });
      await vectorIndex.add(identifier1, [0.1, 0.2, 0.3]);
      await vectorIndex.add(identifier2, [0.2, 0.3, 0.4]);

      const results = await vectorIndex.queryItems([[0.1, 0.2, 0.3]], {
        threshold: 0,
      });

      assert.strictEqual(results.length, 2);
    });

    test("queryItems with maxTokens null returns all results", async () => {
      const identifier1 = resource.Identifier.fromObject({
        type: "Message",
        name: "item1",
        tokens: 10,
      });
      const identifier2 = resource.Identifier.fromObject({
        type: "Message",
        name: "item2",
        tokens: 15,
      });
      await vectorIndex.add(identifier1, [0.1, 0.2, 0.3]);
      await vectorIndex.add(identifier2, [0.2, 0.3, 0.4]);

      const results = await vectorIndex.queryItems([[0.1, 0.2, 0.3]], {
        threshold: 0,
        limit: 0,
        max_tokens: null,
      });

      assert.strictEqual(results.length, 2);
    });

    test("get works after loadData", async () => {
      const testData = {
        id: "Message.test-1",
        identifier: {
          type: "Message",
          name: "test-1",
          tokens: 10,
        },
        vector: [0.1, 0.2, 0.3],
      };

      // Mock storage.get() to return parsed JSON array for .jsonl files
      mockStorage.get = mock.fn(() => Promise.resolve([testData]));

      await vectorIndex.loadData();
      const result = await vectorIndex.get(["Message.test-1"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "test-1");
      assert.strictEqual(result[0].type, "Message");
      assert.strictEqual(result[0].tokens, 10);
    });

    test("queryItems respects max_tokens filter - stops when limit reached", async () => {
      const identifier1 = resource.Identifier.fromObject({
        type: "Message",
        name: "item1",
        tokens: 10,
      });
      const identifier2 = resource.Identifier.fromObject({
        type: "Message",
        name: "item2",
        tokens: 15,
      });
      const identifier3 = resource.Identifier.fromObject({
        type: "Message",
        name: "item3",
        tokens: 20,
      });

      // Add items with identical vectors so they all match equally
      await vectorIndex.add(identifier1, [1.0, 0.0, 0.0]);
      await vectorIndex.add(identifier2, [1.0, 0.0, 0.0]);
      await vectorIndex.add(identifier3, [1.0, 0.0, 0.0]);

      // Query with max_tokens=20, should get first two items (10+15=25 > 20, so stops at first item)
      const results = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        max_tokens: 20,
      });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, "item1");
      assert.strictEqual(results[0].tokens, 10);
    });

    test("queryItems max_tokens filter returns empty when first item exceeds limit", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "large-item",
        tokens: 100,
      });

      await vectorIndex.add(identifier, [1.0, 0.0, 0.0]);

      // Query with max_tokens=50, should return empty since first item is 100 tokens
      const results = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        max_tokens: 50,
      });

      assert.strictEqual(results.length, 0);
    });

    test("queryItems respects prefix filter", async () => {
      const messageId = resource.Identifier.fromObject({
        type: "common.Message",
        name: "msg1",
        tokens: 10,
      });
      const toolId = resource.Identifier.fromObject({
        type: "tool.Function",
        name: "func1",
        tokens: 15,
      });
      const resourceId = resource.Identifier.fromObject({
        type: "resource.Document",
        name: "doc1",
        tokens: 20,
      });

      await vectorIndex.add(messageId, [1.0, 0.0, 0.0]);
      await vectorIndex.add(toolId, [1.0, 0.0, 0.0]);
      await vectorIndex.add(resourceId, [1.0, 0.0, 0.0]);

      // Test different prefix filters
      const allResults = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
      });
      const messageResults = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        prefix: "common.Message",
      });
      const toolResults = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        prefix: "tool.Function",
      });
      const resourceResults = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        prefix: "resource.Document",
      });
      const noMatchResults = await vectorIndex.queryItems([[1.0, 0.0, 0.0]], {
        threshold: 0,
        prefix: "nonexistent",
      });

      assert.strictEqual(
        allResults.length,
        3,
        "Should return all items without prefix",
      );
      assert.strictEqual(
        messageResults.length,
        1,
        "Should return only Message items",
      );
      assert.strictEqual(
        toolResults.length,
        1,
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

      assert.strictEqual(
        String(messageResults[0]),
        "common.Message.msg1",
        "Should return correct Message item",
      );
      assert.strictEqual(
        String(toolResults[0]),
        "tool.Function.func1",
        "Should return correct Function item",
      );
      assert.strictEqual(
        String(resourceResults[0]),
        "resource.Document.doc1",
        "Should return correct Document item",
      );
    });

    test("queryItems combines prefix filter with other filters", async () => {
      const msg1 = resource.Identifier.fromObject({
        type: "common.Message",
        name: "msg1",
        tokens: 10,
      });
      const msg2 = resource.Identifier.fromObject({
        type: "common.Message",
        name: "msg2",
        tokens: 20,
      });
      const tool1 = resource.Identifier.fromObject({
        type: "tool.Function",
        name: "func1",
        tokens: 15,
      });

      await vectorIndex.add(msg1, [1.0, 0.0, 0.0]);
      await vectorIndex.add(msg2, [1.0, 0.0, 0.0]);
      await vectorIndex.add(tool1, [1.0, 0.0, 0.0]);

      // Test prefix + limit filter
      const prefixLimitResults = await vectorIndex.queryItems(
        [[1.0, 0.0, 0.0]],
        {
          threshold: 0,
          prefix: "common.Message",
          limit: 1,
        },
      );

      // Test prefix + max_tokens filter
      const prefixTokenResults = await vectorIndex.queryItems(
        [[1.0, 0.0, 0.0]],
        {
          threshold: 0,
          prefix: "common.Message",
          max_tokens: 15,
        },
      );

      assert.strictEqual(
        prefixLimitResults.length,
        1,
        "Should apply both prefix and limit filters",
      );
      assert(
        String(prefixLimitResults[0]).startsWith("common.Message"),
        "Should match prefix filter",
      );

      assert.strictEqual(
        prefixTokenResults.length,
        1,
        "Should apply both prefix and token filters",
      );
      assert(
        String(prefixTokenResults[0]).startsWith("common.Message"),
        "Should match prefix filter",
      );
      assert.strictEqual(
        prefixTokenResults[0].tokens,
        10,
        "Should return item within token limit",
      );
    });
  });
});
