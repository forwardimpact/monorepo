import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createSilentLogger } from "@forwardimpact/libmock";

// Module under test
import { ProcessorBase } from "../src/processor.js";

describe("ProcessorBase", () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createSilentLogger();
  });

  describe("constructor", () => {
    test("creates a ProcessorBase with a logger and a batch size", () => {
      const processor = new ProcessorBase(mockLogger, 5);

      assert.ok(processor instanceof ProcessorBase);
    });

    test("validates the logger parameter", () => {
      assert.throws(() => new ProcessorBase(), {
        message: /logger is required/,
      });
      assert.throws(() => new ProcessorBase(null), {
        message: /logger is required/,
      });
    });

    test("validates the batch size parameter", () => {
      assert.throws(() => new ProcessorBase(mockLogger, 0), {
        message: /batchSize must be a positive number/,
      });
      assert.throws(() => new ProcessorBase(mockLogger, -1), {
        message: /batchSize must be a positive number/,
      });
      assert.throws(() => new ProcessorBase(mockLogger, "invalid"), {
        message: /batchSize must be a positive number/,
      });
    });

    test("uses the default batch size when the caller omits it", () => {
      const processor = new ProcessorBase(mockLogger);
      // The test passes if nothing throws
      assert.ok(processor instanceof ProcessorBase);
    });
  });

  describe("process", () => {
    test("validates the items parameter", async () => {
      const processor = new ProcessorBase(mockLogger, 2);

      await assert.rejects(() => processor.process("not-array"), {
        message: /items must be an array/,
      });
    });

    test("handles an empty array", async () => {
      const processor = new ProcessorBase(mockLogger, 2);

      // Should not throw
      await processor.process([]);
    });

    test("calls processItem for each item", async () => {
      /** Test processor that tracks processed items */
      class TestProcessor extends ProcessorBase {
        /**
         * Creates a test processor
         * @param {object} logger - Logger instance
         */
        constructor(logger) {
          super(logger, 2);
          this.processedItems = [];
        }

        /**
         * Processes a single item
         * @param {any} item - Item to process
         * @returns {Promise<string>} Processed result
         */
        async processItem(item) {
          this.processedItems.push(item);
          return `processed-${item}`;
        }
      }

      const processor = new TestProcessor(mockLogger);
      await processor.process(["a", "b", "c", "d"]);

      assert.strictEqual(processor.processedItems.length, 4);
      assert.deepStrictEqual(processor.processedItems, ["a", "b", "c", "d"]);
    });

    test("continues to process when individual items fail", async () => {
      /** Test processor that simulates failures */
      class TestProcessor extends ProcessorBase {
        /**
         * Creates a test processor
         * @param {object} logger - Logger instance
         */
        constructor(logger) {
          super(logger, 3);
          this.processedItems = [];
        }

        /**
         * Processes a single item and simulates a failure
         * @param {any} item - Item to process
         * @returns {Promise<string>} Processed result
         */
        async processItem(item) {
          if (item === "fail") {
            throw new Error("Simulated failure");
          }
          this.processedItems.push(item);
          return `processed-${item}`;
        }
      }

      const processor = new TestProcessor(mockLogger);
      await processor.process(["a", "fail", "b", "c"]);

      // Should process every item except the one that fails
      assert.deepStrictEqual(processor.processedItems, ["a", "b", "c"]);
    });
  });

  describe("processItem", () => {
    test("throws an error when a subclass does not implement it", async () => {
      const processor = new ProcessorBase(mockLogger, 2);

      await assert.rejects(() => processor.processItem("item"), {
        message: /processItem must be implemented by subclass/,
      });
    });
  });
});
