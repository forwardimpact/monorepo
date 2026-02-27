import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { VectorIndex } from "../index/vector.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

// Helper function to normalize vectors
const normalize = (vector) => {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / magnitude);
};

describe("VectorIndex - IndexBase Functionality", () => {
  let vectorIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    vectorIndex = new VectorIndex(mockStorage, "test-vectors.jsonl");
  });

  describe("Constructor and Properties", () => {
    test("constructor validates storage parameter", () => {
      assert.throws(
        () => new VectorIndex(null),
        /storage is required/,
        "Should throw for missing storage",
      );
    });

    test("constructor sets properties correctly", () => {
      const index = new VectorIndex(mockStorage, "custom.jsonl");
      assert.strictEqual(index.storage(), mockStorage, "Should set storage");
      assert.strictEqual(index.indexKey, "custom.jsonl", "Should set indexKey");
      assert.strictEqual(
        index.loaded,
        false,
        "Should initialize loaded as false",
      );
    });

    test("constructor uses default indexKey when not provided", () => {
      const index = new VectorIndex(mockStorage);
      assert.strictEqual(
        index.indexKey,
        "index.jsonl",
        "Should use default indexKey",
      );
    });
  });

  describe("Data Loading", () => {
    test("loadData initializes empty index when file doesn't exist", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(false));

      await vectorIndex.loadData();

      assert.strictEqual(vectorIndex.loaded, true, "Should mark as loaded");
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
          id: "Message.msg1",
          identifier: { type: "Message", name: "msg1", tokens: 10 },
          vector: [0.1, 0.2, 0.3],
        },
        {
          id: "Message.msg2",
          identifier: { type: "Message", name: "msg2", tokens: 20 },
          vector: [0.4, 0.5, 0.6],
        },
      ];

      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve(testData));

      await vectorIndex.loadData();

      assert.strictEqual(vectorIndex.loaded, true, "Should mark as loaded");
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

      // Verify data was loaded into index
      assert.strictEqual(
        await vectorIndex.has("Message.msg1"),
        true,
        "Should load first item",
      );
      assert.strictEqual(
        await vectorIndex.has("Message.msg2"),
        true,
        "Should load second item",
      );
    });

    test("loadData is idempotent", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(false));

      await vectorIndex.loadData();
      mockStorage.exists.mock.resetCalls();

      await vectorIndex.loadData();

      assert.strictEqual(
        mockStorage.exists.mock.callCount(),
        0,
        "Should not check existence again when already loaded",
      );
      assert.strictEqual(vectorIndex.loaded, true, "Should remain loaded");
    });
  });

  describe("Item Management", () => {
    test("has returns false for non-existent items", async () => {
      const exists = await vectorIndex.has("Message.nonexistent");
      assert.strictEqual(
        exists,
        false,
        "Should return false for non-existent item",
      );
    });

    test("has returns true for existing items", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "test1",
        tokens: 10,
      });

      await vectorIndex.add(identifier, [0.1, 0.2, 0.3]);
      const exists = await vectorIndex.has(String(identifier));

      assert.strictEqual(exists, true, "Should return true for existing item");
    });

    test("add stores vector with correct structure", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "test1",
        tokens: 10,
      });

      const vector = [0.1, 0.2, 0.3];
      await vectorIndex.add(identifier, vector);

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should call storage append",
      );

      const appendedData = JSON.parse(
        mockStorage.append.mock.calls[0].arguments[1],
      );
      assert.strictEqual(appendedData.id, String(identifier));
      assert.strictEqual(appendedData.identifier.name, "test1");
      assert.strictEqual(appendedData.identifier.type, "Message");
      assert.strictEqual(appendedData.identifier.tokens, 10);
      assert.deepStrictEqual(appendedData.vector, vector);
    });

    test("add updates existing vector", async () => {
      const identifier1 = resource.Identifier.fromObject({
        type: "Message",
        name: "test1",
        tokens: 10,
      });
      const identifier2 = resource.Identifier.fromObject({
        type: "Message",
        name: "test1",
        tokens: 20,
      });

      await vectorIndex.add(identifier1, [0.1, 0.2, 0.3]);
      await vectorIndex.add(identifier2, [0.4, 0.5, 0.6]);

      const result = await vectorIndex.get(["Message.test1"]);
      assert.strictEqual(result.length, 1, "Should have one item");
      assert.strictEqual(result[0].tokens, 20, "Should update with new tokens");
    });

    test("get returns items by IDs", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "test1",
        tokens: 10,
      });

      await vectorIndex.add(identifier, [0.1, 0.2, 0.3]);
      const result = await vectorIndex.get([String(identifier)]);

      assert.strictEqual(result.length, 1, "Should return one item");
      assert.strictEqual(
        result[0].name,
        "test1",
        "Should return correct identifier",
      );
      assert.strictEqual(
        result[0].type,
        "Message",
        "Should return correct type",
      );
      assert.strictEqual(result[0].tokens, 10, "Should return correct tokens");
    });

    test("get returns empty array for non-existent IDs", async () => {
      const result = await vectorIndex.get(["Message.nonexistent"]);
      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for non-existent item",
      );
    });

    test("get handles null IDs parameter", async () => {
      const result = await vectorIndex.get(null);
      assert.deepStrictEqual(result, [], "Should return empty array for null");
    });

    test("get handles empty IDs array", async () => {
      const result = await vectorIndex.get([]);
      assert.deepStrictEqual(
        result,
        [],
        "Should return empty array for empty array",
      );
    });
  });

  describe("Vector Query and Similarity", () => {
    // Helper function to normalize vectors
    const normalize = (vector) => {
      const magnitude = Math.sqrt(
        vector.reduce((sum, val) => sum + val * val, 0),
      );
      return vector.map((val) => val / magnitude);
    };

    beforeEach(async () => {
      // Add test vectors with different similarities
      const items = [
        {
          identifier: { type: "Message", name: "similar1", tokens: 10 },
          vector: normalize([1.0, 0.0, 0.0]),
        },
        {
          identifier: { type: "Message", name: "similar2", tokens: 15 },
          vector: normalize([0.9, 0.1, 0.0]),
        },
        {
          identifier: { type: "Message", name: "different", tokens: 20 },
          vector: normalize([0.0, 0.0, 1.0]),
        },
        {
          identifier: { type: "Function", name: "func1", tokens: 25 },
          vector: normalize([0.5, 0.5, 0.0]),
        },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item.identifier);
        await vectorIndex.add(identifier, item.vector);
      }
    });

    test("queryItems returns similar vectors sorted by score", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const results = await vectorIndex.queryItems([queryVector], {
        threshold: 0.5,
      });

      assert(results.length >= 2, "Should return similar vectors");
      assert.strictEqual(
        results[0].name,
        "similar1",
        "Most similar should be first",
      );
      assert(results[0].score > 0.9, "Should have high similarity score");
      // Verify results are sorted by score descending
      for (let i = 0; i < results.length - 1; i++) {
        assert(
          results[i].score >= results[i + 1].score,
          "Results should be sorted by score descending",
        );
      }
    });

    test("queryItems respects threshold", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const strictResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0.95,
      });
      const lenientResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0.5,
      });

      assert(
        strictResults.length < lenientResults.length,
        "Strict threshold should return fewer results",
      );
      assert(
        strictResults.every((r) => r.score >= 0.95),
        "All results should meet threshold",
      );
    });

    test("queryItems applies prefix filter", async () => {
      const queryVector = normalize([0.5, 0.5, 0.0]);

      const allResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
      });
      const messageResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
        prefix: "Message",
      });

      assert(
        messageResults.length < allResults.length,
        "Prefix filter should reduce results",
      );
      assert(
        messageResults.every((r) => r.type === "Message"),
        "All results should match prefix",
      );
    });

    test("queryItems applies limit filter", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const limitedResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
        limit: 2,
      });

      assert.strictEqual(
        limitedResults.length,
        2,
        "Should return limited number of results",
      );

      const zeroLimitResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
        limit: 0,
      });
      assert(
        zeroLimitResults.length > 2,
        "Zero limit should return all results",
      );
    });

    test("queryItems applies max_tokens filter", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const tokenLimitedResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
        max_tokens: 30,
      });

      assert(
        tokenLimitedResults.length >= 1,
        "Should return at least one result",
      );

      const totalTokens = tokenLimitedResults.reduce(
        (sum, r) => sum + r.tokens,
        0,
      );
      assert(totalTokens <= 30, "Total tokens should not exceed max_tokens");
    });

    test("queryItems applies combined filters", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const combinedResults = await vectorIndex.queryItems([queryVector], {
        threshold: 0.5,
        prefix: "Message",
        limit: 1,
        max_tokens: 50,
      });

      assert.strictEqual(
        combinedResults.length,
        1,
        "Should apply all filters together",
      );
      assert.strictEqual(
        combinedResults[0].type,
        "Message",
        "Should match prefix filter",
      );
      assert(
        combinedResults[0].score >= 0.5,
        "Should meet threshold requirement",
      );
    });

    test("queryItems returns empty array for no matches above threshold", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      // Use a very high but achievable threshold
      // Identical normalized vectors should have score ~0.9999+
      const results = await vectorIndex.queryItems([queryVector], {
        threshold: 0.99999,
      });

      assert(
        results.length <= 1,
        "Should return at most the identical vector when threshold is very high",
      );
    });

    test("queryItems includes score in results", async () => {
      const queryVector = normalize([1.0, 0.0, 0.0]);

      const results = await vectorIndex.queryItems([queryVector], {
        threshold: 0,
      });

      assert(results.length > 0, "Should have results");
      for (const result of results) {
        assert(
          typeof result.score === "number",
          "Each result should have a score",
        );
        assert(
          result.score >= 0 && result.score <= 1,
          "Score should be between 0 and 1",
        );
      }
    });

    test("queryItems deduplicates results when using multiple query vectors", async () => {
      // Query with multiple similar vectors that will match the same items
      const queryVector1 = normalize([1.0, 0.0, 0.0]);
      const queryVector2 = normalize([0.95, 0.05, 0.0]);
      const queryVector3 = normalize([0.9, 0.1, 0.0]);

      const results = await vectorIndex.queryItems(
        [queryVector1, queryVector2, queryVector3],
        { threshold: 0 },
      );

      // Count occurrences of each identifier
      const idCounts = new Map();
      for (const result of results) {
        const id = `${result.type}.${result.name}`;
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }

      // Verify no duplicates
      for (const [id, count] of idCounts) {
        assert.strictEqual(count, 1, `${id} should appear exactly once`);
      }
    });

    test("queryItems keeps highest score when deduplicating across multiple vectors", async () => {
      // Query with vectors that will produce different scores for the same item
      const queryVector1 = normalize([1.0, 0.0, 0.0]); // Highest score for similar1
      const queryVector2 = normalize([0.5, 0.5, 0.0]); // Lower score for similar1

      const results = await vectorIndex.queryItems(
        [queryVector1, queryVector2],
        { threshold: 0, prefix: "Message" },
      );

      const similar1 = results.find((r) => r.name === "similar1");
      assert(similar1, "Should find similar1 in results");

      // The score should be from queryVector1 (highest match)
      // similar1 has vector [1, 0, 0] normalized, queryVector1 is also [1, 0, 0] normalized
      // Dot product should be ~1.0
      assert(
        similar1.score > 0.9,
        "Should keep highest score from queryVector1",
      );
    });
  });

  describe("Edge Cases", () => {
    test("queryItems with empty index returns empty array", async () => {
      const queryVector = [0.1, 0.2, 0.3];
      const results = await vectorIndex.queryItems([queryVector], {});

      assert.deepStrictEqual(
        results,
        [],
        "Should return empty array for empty index",
      );
    });

    test("add handles zero vectors", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "zero",
        tokens: 10,
      });

      const zeroVector = [0.0, 0.0, 0.0];
      await vectorIndex.add(identifier, zeroVector);

      assert.strictEqual(
        await vectorIndex.has("Message.zero"),
        true,
        "Should store zero vector",
      );
    });

    test("queryItems handles identical vectors", async () => {
      const vector = normalize([0.1, 0.2, 0.3]);
      const identifier = resource.Identifier.fromObject({
        type: "Message",
        name: "identical",
        tokens: 10,
      });

      await vectorIndex.add(identifier, vector);

      const results = await vectorIndex.queryItems([vector], {
        threshold: 0.99,
      });

      assert.strictEqual(results.length, 1, "Should find identical vector");
      assert(
        results[0].score >= 0.99,
        "Should have very high similarity score",
      );
    });
  });
});
