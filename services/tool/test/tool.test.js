import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { ToolService } from "../index.js";
import { createMockConfig } from "@forwardimpact/libharness";

describe("tool service", () => {
  describe("ToolService", () => {
    test("exports ToolService class", () => {
      assert.strictEqual(typeof ToolService, "function");
      assert.ok(ToolService.prototype);
    });

    test("ToolService has CallTool method", () => {
      assert.strictEqual(typeof ToolService.prototype.CallTool, "function");
    });

    test("ToolService constructor accepts expected parameters", () => {
      // Test constructor signature by checking parameter count
      assert.strictEqual(ToolService.length, 1); // config (logger and tracer are optional)
    });

    test("ToolService has proper method signatures", () => {
      const methods = Object.getOwnPropertyNames(ToolService.prototype);
      assert(methods.includes("CallTool"));
      assert(methods.includes("constructor"));
    });
  });

  describe("ToolService business logic", () => {
    let mockConfig;

    beforeEach(() => {
      mockConfig = createMockConfig("tool", {
        endpoints: {
          "hash.sha256": {
            method: "hash.Hash.Sha256",
          },
          "vector.search": {
            method: "vector.Vector.QueryItems",
          },
        },
      });
    });

    test("creates service instance with config", () => {
      const service = new ToolService(mockConfig);

      assert.ok(service);
      assert.strictEqual(service.config, mockConfig);
    });

    test("gets endpoints from config", () => {
      const service = new ToolService(mockConfig);

      assert.deepStrictEqual(service.endpoints, mockConfig.endpoints);
    });

    test("CallTool validates request structure", async () => {
      const service = new ToolService(mockConfig);

      const result = await service.CallTool({});

      assert.ok(result);
      assert.ok(result.content);
      assert.ok(result.content.includes("error"));
    });

    test("CallTool handles missing endpoint", async () => {
      const service = new ToolService(mockConfig);

      const result = await service.CallTool({
        id: "test-call",
        function: {
          name: "unknown.tool",
        },
      });

      assert.ok(result);
      assert.ok(result.content);
      assert.ok(result.content.includes("not found"));
    });

    test("CallTool handles invalid endpoint method format", async () => {
      const invalidConfig = {
        name: "tool", // Required for logging
        endpoints: {
          "invalid.tool": {
            method: "invalid", // Invalid format - needs package.service.method
            request: "tool.Request",
          },
        },
      };

      const service = new ToolService(invalidConfig);

      const result = await service.CallTool({
        id: "test-call",
        function: {
          name: "invalid.tool",
          arguments: "{}",
        },
      });

      assert.ok(result);
      assert.ok(result.content);
      assert.ok(result.content.includes("Invalid endpoint method format"));
    });

    test("returns proper tool result structure", async () => {
      const service = new ToolService(mockConfig);

      const result = await service.CallTool({
        id: "test-call-123",
        function: {
          name: "nonexistent.tool",
        },
      });

      assert.ok(result);
      assert.ok(typeof result.content === "string");
    });
  });
});
