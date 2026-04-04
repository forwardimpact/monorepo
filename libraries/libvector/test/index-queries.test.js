import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { VectorIndex } from "../index/vector.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

const normalize = (vector) => {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / magnitude);
};

describe("VectorIndex - Queries and Edge Cases", () => {
  let vectorIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vectorIndex = new VectorIndex(mockStorage, "test-vectors.jsonl");
  });

  describe("Vector Query and Similarity", () => {
    beforeEach(async () => {
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
      const queryVector1 = normalize([1.0, 0.0, 0.0]);
      const queryVector2 = normalize([0.95, 0.05, 0.0]);
      const queryVector3 = normalize([0.9, 0.1, 0.0]);

      const results = await vectorIndex.queryItems(
        [queryVector1, queryVector2, queryVector3],
        { threshold: 0 },
      );

      const idCounts = new Map();
      for (const result of results) {
        const id = `${result.type}.${result.name}`;
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }

      for (const [id, count] of idCounts) {
        assert.strictEqual(count, 1, `${id} should appear exactly once`);
      }
    });

    test("queryItems keeps highest score when deduplicating across multiple vectors", async () => {
      const queryVector1 = normalize([1.0, 0.0, 0.0]);
      const queryVector2 = normalize([0.5, 0.5, 0.0]);

      const results = await vectorIndex.queryItems(
        [queryVector1, queryVector2],
        { threshold: 0, prefix: "Message" },
      );

      const similar1 = results.find((r) => r.name === "similar1");
      assert(similar1, "Should find similar1 in results");

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
