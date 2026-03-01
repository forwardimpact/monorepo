import { test, describe } from "node:test";
import assert from "node:assert";

import { ToolProcessor } from "../processor/tool.js";

describe("libtool", () => {
  describe("ToolProcessor", () => {
    const protoRoot = "/tmp";

    test("requires resourceIndex", () => {
      const logger = { debug: () => {} };
      const configStorage = { get: async () => ({}) };

      assert.throws(() => {
        new ToolProcessor(null, configStorage, protoRoot, logger);
      }, /resourceIndex is required/);
    });

    test("requires configStorage", () => {
      const logger = { debug: () => {} };
      const resourceIndex = { put: async () => {} };

      assert.throws(() => {
        new ToolProcessor(resourceIndex, null, protoRoot, logger);
      }, /configStorage is required/);
    });

    test("requires protoRoot", () => {
      const logger = { debug: () => {} };
      const resourceIndex = { put: async () => {} };
      const configStorage = { get: async () => ({}) };

      assert.throws(() => {
        new ToolProcessor(resourceIndex, configStorage, null, logger);
      }, /protoRoot is required/);
    });

    test("requires logger", () => {
      const resourceIndex = { put: async () => {} };
      const configStorage = { get: async () => ({}) };

      assert.throws(() => {
        new ToolProcessor(resourceIndex, configStorage, protoRoot, null);
      }, /logger is required/);
    });

    test("creates processor with valid dependencies", () => {
      const logger = { debug: () => {} };
      const resourceIndex = { put: async () => {} };
      const configStorage = { get: async () => ({}) };

      const processor = new ToolProcessor(
        resourceIndex,
        configStorage,
        protoRoot,
        logger,
      );
      assert(processor instanceof ToolProcessor);
    });

    test("handles empty endpoints gracefully", async () => {
      const logger = { debug: () => {} };
      const resourceIndex = { put: async () => {} };
      const configStorage = {
        get: async (key) => {
          if (key === "config.json")
            return { service: { tool: { endpoints: {} } } };
          if (key === "tools.yml") return "{}";
          return null;
        },
      };

      const processor = new ToolProcessor(
        resourceIndex,
        configStorage,
        protoRoot,
        logger,
      );
      await processor.process();
    });
  });
});
