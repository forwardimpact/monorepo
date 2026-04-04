import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
import { createMockStorage } from "@forwardimpact/libharness";

const { namedNode, literal } = DataFactory;

describe("GraphIndex - Constructor and Data Loading", () => {
  let graphIndex;
  let mockStorage;
  let n3Store;

  beforeEach(() => {
    mockStorage = createMockStorage();

    n3Store = new Store();
    graphIndex = new GraphIndex(mockStorage, n3Store, {}, "test-graph.jsonl");
  });

  describe("Constructor and Properties", () => {
    test("constructor validates storage parameter", () => {
      assert.throws(
        () => new GraphIndex(null, n3Store),
        /storage is required/,
        "Should throw for missing storage",
      );
    });

    test("constructor validates store parameter", () => {
      assert.throws(
        () => new GraphIndex(mockStorage, null),
        /store must be an N3 Store instance/,
        "Should throw for missing store",
      );

      assert.throws(
        () => new GraphIndex(mockStorage, {}),
        /store must be an N3 Store instance/,
        "Should throw for invalid store",
      );
    });

    test("constructor sets properties correctly", () => {
      const index = new GraphIndex(mockStorage, n3Store, {}, "custom.jsonl");
      assert.strictEqual(index.storage(), mockStorage, "Should set storage");
      assert.strictEqual(index.indexKey, "custom.jsonl", "Should set indexKey");
      assert.strictEqual(
        index.loaded,
        false,
        "Should initialize loaded as false",
      );
    });

    test("constructor uses default indexKey when not provided", () => {
      const index = new GraphIndex(mockStorage, n3Store);
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

      await graphIndex.loadData();

      assert.strictEqual(graphIndex.loaded, true, "Should mark as loaded");
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

    test("loadData loads existing data and populates graph", async () => {
      const testData = [
        {
          id: "common.Message.msg1",
          identifier: { type: "common.Message", name: "msg1", tokens: 10 },
          quads: [
            {
              subject: namedNode("http://example.org/msg1"),
              predicate: namedNode("http://schema.org/text"),
              object: literal("Hello"),
            },
          ],
        },
        {
          id: "common.Message.msg2",
          identifier: { type: "common.Message", name: "msg2", tokens: 20 },
          quads: [
            {
              subject: namedNode("http://example.org/msg2"),
              predicate: namedNode("http://schema.org/text"),
              object: literal("World"),
            },
          ],
        },
      ];

      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve(testData));

      await graphIndex.loadData();

      assert.strictEqual(graphIndex.loaded, true, "Should mark as loaded");
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
        await graphIndex.has("common.Message.msg1"),
        true,
        "Should load first item",
      );
      assert.strictEqual(
        await graphIndex.has("common.Message.msg2"),
        true,
        "Should load second item",
      );

      // Verify graph was populated
      const quads = n3Store.getQuads(null, null, null);
      assert.strictEqual(quads.length, 2, "Should populate graph with quads");
    });

    test("loadData is idempotent", async () => {
      mockStorage.exists = mock.fn(() => Promise.resolve(false));

      await graphIndex.loadData();
      mockStorage.exists.mock.resetCalls();

      await graphIndex.loadData();

      assert.strictEqual(
        mockStorage.exists.mock.callCount(),
        0,
        "Should not check existence again when already loaded",
      );
      assert.strictEqual(graphIndex.loaded, true, "Should remain loaded");
    });

    test("loadData clears and reloads graph when reloading", async () => {
      // First load: add initial data
      const initialData = [
        {
          id: "common.Message.initial",
          identifier: { type: "common.Message", name: "initial", tokens: 5 },
          quads: [
            {
              subject: namedNode("http://example.org/initial"),
              predicate: namedNode("http://schema.org/text"),
              object: literal("Initial data"),
            },
          ],
        },
      ];

      mockStorage.exists = mock.fn(() => Promise.resolve(true));
      mockStorage.get = mock.fn(() => Promise.resolve(initialData));

      await graphIndex.loadData();

      assert.strictEqual(
        n3Store.getQuads(null, null, null).length,
        1,
        "Should load initial data",
      );

      // Now simulate a reload scenario with different data
      const newData = [
        {
          id: "common.Message.new",
          identifier: { type: "common.Message", name: "new", tokens: 10 },
          quads: [
            {
              subject: namedNode("http://example.org/new"),
              predicate: namedNode("http://schema.org/text"),
              object: literal("New data"),
            },
          ],
        },
      ];

      mockStorage.get = mock.fn(() => Promise.resolve(newData));

      // Create a fresh instance with a fresh store to test reload behavior
      const freshStore = new Store();
      const freshGraphIndex = new GraphIndex(
        mockStorage,
        freshStore,
        {},
        "test-graph.jsonl",
      );
      await freshGraphIndex.loadData();

      const quads = freshStore.getQuads(null, null, null);
      assert.strictEqual(
        quads.length,
        1,
        "Should clear old graph data before loading new data",
      );
      assert.strictEqual(
        quads[0].subject.value,
        "http://example.org/new",
        "Should only have new data after reload",
      );
    });
  });
});
