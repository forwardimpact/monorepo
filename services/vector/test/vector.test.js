import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { VectorService } from "../index.js";
import { createMockConfig, spy } from "@forwardimpact/libmock";

describe("vector service", () => {
  describe("VectorService", () => {
    test("exports VectorService class", () => {
      assert.strictEqual(typeof VectorService, "function");
      assert.ok(VectorService.prototype);
    });

    test("VectorService has SearchContent method", () => {
      assert.strictEqual(
        typeof VectorService.prototype.SearchContent,
        "function",
      );
    });

    test("VectorService constructor accepts expected parameters", () => {
      assert.strictEqual(VectorService.length, 4); // config, vectorIndex, embeddingFn, logFn
    });

    test("VectorService has proper method signatures", () => {
      const methods = Object.getOwnPropertyNames(VectorService.prototype);
      assert(methods.includes("SearchContent"));
      assert(methods.includes("constructor"));
    });
  });

  describe("VectorService business logic", () => {
    let mockConfig;
    let mockContentIndex;
    let mockEmbeddingFn;

    beforeEach(() => {
      mockConfig = createMockConfig("vector", {
        threshold: 0.3,
        limit: 10,
      });

      mockContentIndex = {
        queryItems: async () => [{ toString: () => "msg1" }],
      };

      mockEmbeddingFn = spy(() =>
        Promise.resolve({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      );
    });

    test("creates service instance with index", () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockEmbeddingFn,
      );

      assert.ok(service);
      assert.strictEqual(service.config, mockConfig);
    });

    test("SearchContent queries content index", async () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockEmbeddingFn,
      );

      const result = await service.SearchContent({
        input: ["test query"],
        filter: { threshold: 0.3, limit: 10 },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.identifiers));
    });

    test("SearchContent handles empty filters", async () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockEmbeddingFn,
      );

      const result = await service.SearchContent({
        input: ["test query"],
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.identifiers));
    });
  });
});
