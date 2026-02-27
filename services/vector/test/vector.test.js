import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { VectorService } from "../index.js";
import {
  createMockConfig,
  createMockLlmClient,
} from "@forwardimpact/libharness";

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
      // Test constructor signature by checking parameter count
      assert.strictEqual(VectorService.length, 4); // config, contentIndex, llmClient, logFn
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
    let mockLlmClient;

    beforeEach(() => {
      mockConfig = createMockConfig("vector", {
        threshold: 0.3,
        limit: 10,
      });

      mockContentIndex = {
        queryItems: async () => [{ toString: () => "msg1" }],
      };

      mockLlmClient = createMockLlmClient();
    });

    test("creates service instance with index", () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockLlmClient,
      );

      assert.ok(service);
      assert.strictEqual(service.config, mockConfig);
    });

    test("SearchContent queries content index", async () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockLlmClient,
      );

      const result = await service.SearchContent({
        text: "test query",
        filter: { threshold: 0.3, limit: 10 },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.identifiers));
    });

    test("SearchContent handles empty filters", async () => {
      const service = new VectorService(
        mockConfig,
        mockContentIndex,
        mockLlmClient,
      );

      const result = await service.SearchContent({
        text: "test query",
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.identifiers));
    });
  });
});
