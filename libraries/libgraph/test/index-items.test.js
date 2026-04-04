import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

const { namedNode, literal } = DataFactory;

describe("GraphIndex - Item Management and Queries", () => {
  let graphIndex;
  let mockStorage;
  let n3Store;

  beforeEach(() => {
    mockStorage = createMockStorage();

    n3Store = new Store();
    graphIndex = new GraphIndex(mockStorage, n3Store, {}, "test-graph.jsonl");
  });

  describe("Item Management", () => {
    test("has returns false for non-existent items", async () => {
      const exists = await graphIndex.has("common.Message.nonexistent");
      assert.strictEqual(
        exists,
        false,
        "Should return false for non-existent item",
      );
    });

    test("has returns true for existing items", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      const quads = [
        {
          subject: namedNode("http://example.org/test1"),
          predicate: namedNode("http://schema.org/text"),
          object: literal("Test message"),
        },
      ];

      await graphIndex.add(identifier, quads);
      const exists = await graphIndex.has(String(identifier));

      assert.strictEqual(exists, true, "Should return true for existing item");
    });

    test("add stores quads in both index and graph", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      const quads = [
        {
          subject: namedNode("http://example.org/test1"),
          predicate: namedNode("http://schema.org/text"),
          object: literal("Test message"),
        },
      ];

      await graphIndex.add(identifier, quads);

      // Verify storage
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
      assert.strictEqual(appendedData.quads.length, 1);

      // Verify graph
      const graphQuads = n3Store.getQuads(null, null, null);
      assert.strictEqual(graphQuads.length, 1, "Should add quads to graph");
      assert.strictEqual(
        graphQuads[0].subject.value,
        "http://example.org/test1",
      );
    });

    test("get returns items by IDs", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test1",
        tokens: 10,
      });

      const quads = [
        {
          subject: namedNode("http://example.org/test1"),
          predicate: namedNode("http://schema.org/text"),
          object: literal("Test"),
        },
      ];

      await graphIndex.add(identifier, quads);
      const result = await graphIndex.get([String(identifier)]);

      assert.strictEqual(result.length, 1, "Should return one item");
      assert.strictEqual(
        result[0].name,
        "test1",
        "Should return correct identifier",
      );
      assert.strictEqual(
        result[0].type,
        "common.Message",
        "Should return correct type",
      );
      assert.strictEqual(result[0].tokens, 10, "Should return correct tokens");
    });

    test("get returns empty array for non-existent IDs", async () => {
      const result = await graphIndex.get(["common.Message.nonexistent"]);
      assert.strictEqual(
        result.length,
        0,
        "Should return empty array for non-existent item",
      );
    });

    test("add handles multiple quads", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "resource.Document",
        name: "doc1",
        tokens: 50,
      });

      const quads = [
        {
          subject: namedNode("http://example.org/doc1"),
          predicate: namedNode("http://schema.org/name"),
          object: literal("Document 1"),
        },
        {
          subject: namedNode("http://example.org/doc1"),
          predicate: namedNode("http://schema.org/text"),
          object: literal("Document content"),
        },
        {
          subject: namedNode("http://example.org/doc1"),
          predicate: namedNode(
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          ),
          object: namedNode("http://schema.org/Document"),
        },
      ];

      await graphIndex.add(identifier, quads);

      const graphQuads = n3Store.getQuads(null, null, null);
      assert.strictEqual(graphQuads.length, 3, "Should add all quads to graph");
    });
  });

  describe("Query Filtering", () => {
    beforeEach(async () => {
      // Add test items with different types
      const items = [
        {
          identifier: { type: "common.Message", name: "msg1", tokens: 10 },
          quads: [
            {
              subject: namedNode("http://example.org/msg1"),
              predicate: namedNode(
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              ),
              object: namedNode("http://schema.org/Message"),
            },
          ],
        },
        {
          identifier: { type: "common.Message", name: "msg2", tokens: 20 },
          quads: [
            {
              subject: namedNode("http://example.org/msg2"),
              predicate: namedNode(
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              ),
              object: namedNode("http://schema.org/Message"),
            },
          ],
        },
        {
          identifier: { type: "tool.ToolFunction", name: "func1", tokens: 15 },
          quads: [
            {
              subject: namedNode("http://example.org/func1"),
              predicate: namedNode(
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              ),
              object: namedNode("http://schema.org/Function"),
            },
          ],
        },
      ];

      for (const item of items) {
        const identifier = resource.Identifier.fromObject(item.identifier);
        await graphIndex.add(identifier, item.quads);
      }
    });

    test("queryItems with graph pattern returns matching identifiers", async () => {
      // Query for Message types
      const pattern = {
        subject: null,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/Message",
      };

      const results = await graphIndex.queryItems(pattern);
      assert.strictEqual(results.length, 2, "Should return two Message items");

      const ids = results.map((r) => r.name);
      assert(ids.includes("msg1"), "Should include msg1");
      assert(ids.includes("msg2"), "Should include msg2");
    });

    test("queryItems with wildcard pattern returns all items", async () => {
      const pattern = {
        subject: null,
        predicate: null,
        object: null,
      };

      const results = await graphIndex.queryItems(pattern);
      assert.strictEqual(results.length, 3, "Should return all items");
    });

    test("queryItems with specific subject returns matching item", async () => {
      const pattern = {
        subject: "http://example.org/msg1",
        predicate: null,
        object: null,
      };

      const results = await graphIndex.queryItems(pattern);
      assert.strictEqual(results.length, 1, "Should return one item");
      assert.strictEqual(results[0].name, "msg1", "Should return correct item");
    });

    test("queryItems with no matches returns empty array", async () => {
      const pattern = {
        subject: "http://example.org/nonexistent",
        predicate: null,
        object: null,
      };

      const results = await graphIndex.queryItems(pattern);
      assert.strictEqual(results.length, 0, "Should return no items");
    });

    test("queryItems handles wildcard string patterns", async () => {
      const pattern = {
        subject: "?",
        predicate: "?",
        object: "?",
      };

      const results = await graphIndex.queryItems(pattern);
      assert.strictEqual(
        results.length,
        3,
        "Should treat ? as wildcard and return all items",
      );
    });
  });
});
