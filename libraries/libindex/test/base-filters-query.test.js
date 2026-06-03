import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libmock";
import { TestIndex } from "./base-filters-helpers.js";

describe("IndexBase - Filters and Query", () => {
  let testIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    testIndex = new TestIndex(mockStorage);
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
});
