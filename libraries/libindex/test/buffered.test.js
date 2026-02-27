import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

// Module under test
import { BufferedIndex } from "../index.js";
import { createMockStorage } from "@forwardimpact/libharness";

describe("BufferedIndex - Buffered Write Operations", () => {
  let bufferedIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  afterEach(async () => {
    if (bufferedIndex) {
      await bufferedIndex.shutdown();
    }
  });

  describe("Constructor Configuration", () => {
    test("uses default config values when not provided", () => {
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl");
      assert.ok(bufferedIndex, "Should create instance with defaults");
    });

    test("accepts config with flush_interval", () => {
      const config = { flush_interval: 1000 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);
      assert.ok(bufferedIndex, "Should create instance with custom config");
    });

    test("accepts config with max_buffer_size", () => {
      const config = { max_buffer_size: 500 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);
      assert.ok(bufferedIndex, "Should create instance with custom config");
    });
  });

  describe("Buffered Add Operations", () => {
    test("add buffers items without immediate write", async () => {
      const config = { flush_interval: 10000 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);

      await bufferedIndex.add({ id: "item1", data: "test" });

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        0,
        "Should not write immediately",
      );
    });

    test("add makes items immediately queryable", async () => {
      const config = { flush_interval: 10000 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);

      await bufferedIndex.add({ id: "item1", data: "test" });
      const exists = await bufferedIndex.has("item1");

      assert.strictEqual(
        exists,
        true,
        "Should be immediately queryable in memory",
      );
    });

    test("flush writes buffered items to storage", async () => {
      const config = { flush_interval: 10000 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);

      await bufferedIndex.add({ id: "item1", data: "test1" });
      await bufferedIndex.add({ id: "item2", data: "test2" });

      const flushed = await bufferedIndex.flush();

      assert.strictEqual(flushed, 2, "Should return count of flushed items");
      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should write to storage once",
      );
    });

    test("flush returns zero when buffer is empty", async () => {
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl");

      const flushed = await bufferedIndex.flush();

      assert.strictEqual(flushed, 0, "Should return zero for empty buffer");
      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        0,
        "Should not write when buffer is empty",
      );
    });
  });

  describe("Automatic Flush Behavior", () => {
    test("forces flush when max_buffer_size is reached", async () => {
      const config = { flush_interval: 10000, max_buffer_size: 2 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);

      await bufferedIndex.add({ id: "item1", data: "test1" });
      await bufferedIndex.add({ id: "item2", data: "test2" });

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should auto-flush when max buffer size reached",
      );
    });
  });

  describe("Shutdown", () => {
    test("shutdown flushes remaining buffered items", async () => {
      const config = { flush_interval: 10000 };
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl", config);

      await bufferedIndex.add({ id: "item1", data: "test" });
      await bufferedIndex.shutdown();

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        1,
        "Should flush on shutdown",
      );
    });

    test("shutdown succeeds with empty buffer", async () => {
      bufferedIndex = new BufferedIndex(mockStorage, "test.jsonl");
      await bufferedIndex.shutdown();

      assert.strictEqual(
        mockStorage.append.mock.callCount(),
        0,
        "Should not write when buffer is empty",
      );
    });
  });
});
