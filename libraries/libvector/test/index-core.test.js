import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { VectorIndex } from "../index/vector.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("VectorIndex - Core Functionality", () => {
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
});
