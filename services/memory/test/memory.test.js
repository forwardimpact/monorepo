import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { resource, common } from "@forwardimpact/libtype";

// Module under test
import { MemoryService } from "../index.js";
import {
  createMockConfig,
  createMockStorage,
  createMockResourceIndex,
} from "@forwardimpact/libharness";

describe("memory service", () => {
  describe("MemoryService", () => {
    test("exports MemoryService class", () => {
      assert.strictEqual(typeof MemoryService, "function");
      assert.ok(MemoryService.prototype);
    });

    test("MemoryService has AppendMemory method", () => {
      assert.strictEqual(
        typeof MemoryService.prototype.AppendMemory,
        "function",
      );
    });

    test("MemoryService has GetWindow method", () => {
      assert.strictEqual(typeof MemoryService.prototype.GetWindow, "function");
    });

    test("MemoryService constructor accepts expected parameters", () => {
      // Test constructor signature by checking parameter count
      assert.strictEqual(MemoryService.length, 3); // config, storage, resourceIndex
    });

    test("MemoryService has proper method signatures", () => {
      const methods = Object.getOwnPropertyNames(MemoryService.prototype);
      assert(methods.includes("AppendMemory"));
      assert(methods.includes("GetWindow"));
      assert(methods.includes("constructor"));
    });
  });

  describe("MemoryService business logic", () => {
    let mockConfig;
    let mockStorage;
    let mockResourceIndex;

    beforeEach(() => {
      mockConfig = createMockConfig("memory");
      mockStorage = createMockStorage();
      mockResourceIndex = createMockResourceIndex({ tools: ["search"] });
    });

    test("constructor validates required dependencies", () => {
      assert.throws(
        () => new MemoryService(mockConfig, null),
        /storage is required/,
      );

      assert.throws(
        () => new MemoryService(mockConfig, mockStorage, null),
        /resourceIndex is required/,
      );
    });

    test("creates service instance with valid parameters", () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      assert.ok(service);
      assert.strictEqual(service.config, mockConfig);
    });

    test("AppendMemory validates required resource_id parameter", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      await assert.rejects(
        () => service.AppendMemory({ identifiers: [] }),
        /resource_id is required/,
      );
    });

    test("AppendMemory processes identifiers correctly", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      const result = await service.AppendMemory({
        resource_id: "test-conversation",
        identifiers: [
          resource.Identifier.fromObject({
            type: "common.Message",
            name: "message1",
            tokens: 10,
          }),
        ],
      });

      assert.ok(result);
      assert.strictEqual(result.accepted, "test-conversation");
    });

    test("GetWindow validates required resource_id parameter", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      await assert.rejects(
        () => service.GetWindow({}),
        /resource_id is required/,
      );
    });

    test("GetWindow validates required model parameter", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      await assert.rejects(
        () => service.GetWindow({ resource_id: "test-conversation" }),
        /model is required/,
      );

      await assert.rejects(
        () =>
          service.GetWindow({ resource_id: "test-conversation", model: "" }),
        /model is required/,
      );
    });

    test("GetWindow returns messages and tools structure with max_tokens", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      const result = await service.GetWindow({
        resource_id: "test-conversation",
        model: "test-model-1000",
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.messages), "Should have messages array");
      assert.ok(Array.isArray(result.tools), "Should have tools array");
      assert.strictEqual(
        result.max_tokens,
        4096,
        "Should include max_tokens from config",
      );
    });

    test("GetWindow returns assistant as first message", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      const result = await service.GetWindow({
        resource_id: "test-conversation",
        model: "test-model-1000",
      });

      assert.ok(
        result.messages.length >= 1,
        "Should have at least one message",
      );
      assert.strictEqual(
        result.messages[0].id?.name,
        "test-agent",
        "First message should be assistant",
      );
    });

    test("GetWindow returns tools from assistant configuration", async () => {
      const service = new MemoryService(
        mockConfig,
        mockStorage,
        mockResourceIndex,
      );

      const result = await service.GetWindow({
        resource_id: "test-conversation",
        model: "test-model-1000",
      });

      assert.strictEqual(result.tools.length, 1, "Should have 1 tool");
      assert.strictEqual(
        result.tools[0].function?.name,
        "search",
        "Tool should be search",
      );
    });

    test("GetWindow returns conversation messages within budget", async () => {
      // Override max_tokens to fit within test model context (1000 tokens)
      const customConfig = {
        ...mockConfig,
        max_tokens: 100,
      };

      // Add some test messages to memory
      await mockStorage.append(
        "test-conversation.jsonl",
        JSON.stringify({
          id: "common.Message.message1",
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "message1",
            tokens: 15,
          }),
        }),
      );
      await mockStorage.append(
        "test-conversation.jsonl",
        JSON.stringify({
          id: "common.Message.message2",
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "message2",
            tokens: 20,
          }),
        }),
      );

      // Add messages to resource index so they can be loaded
      mockResourceIndex.addMessage(
        common.Message.fromObject({
          id: { name: "message1", tokens: 15 },
          role: "user",
          content: "Hello",
        }),
      );
      mockResourceIndex.addMessage(
        common.Message.fromObject({
          id: { name: "message2", tokens: 20 },
          role: "assistant",
          content: "Hi there",
        }),
      );

      const service = new MemoryService(
        customConfig,
        mockStorage,
        mockResourceIndex,
      );

      const result = await service.GetWindow({
        resource_id: "test-conversation",
        model: "test-model-1000",
      });

      // Should return assistant + 2 conversation messages
      assert.strictEqual(result.messages.length, 3);
      assert.strictEqual(result.messages[0].id?.name, "test-agent");
      assert.strictEqual(result.messages[1].id?.name, "message1");
      assert.strictEqual(result.messages[2].id?.name, "message2");
    });
  });
});
