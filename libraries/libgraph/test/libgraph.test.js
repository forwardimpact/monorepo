import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
import { parseGraphQuery } from "../index.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

const { namedNode, literal } = DataFactory;

/**
 * Helper function to convert JSON-LD to N3 quads for testing
 * @param {object} jsonld - JSON-LD document
 * @returns {object[]} Array of N3 quad objects
 */
function jsonldToQuads(jsonld) {
  const quads = [];
  const subjectNode = namedNode(jsonld["@id"] || "http://example.org/blank");

  // Add type if present
  if (jsonld["@type"]) {
    quads.push({
      subject: subjectNode,
      predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
      object: namedNode(`http://schema.org/${jsonld["@type"]}`),
    });
  }

  // Add other properties
  for (const [key, value] of Object.entries(jsonld)) {
    if (key.startsWith("@")) continue; // Skip JSON-LD keywords

    // Expand predicate URI
    let predicateUri = key;
    if (key.includes(":") && jsonld["@context"]) {
      // Handle prefixed properties like dcterms:description
      const [prefix, localPart] = key.split(":");
      if (jsonld["@context"][prefix]) {
        predicateUri = jsonld["@context"][prefix] + localPart;
      }
    } else if (jsonld["@context"] && jsonld["@context"]["@vocab"]) {
      // Handle @vocab expansion for simple properties like "description"
      predicateUri = jsonld["@context"]["@vocab"] + key;
    }

    quads.push({
      subject: subjectNode,
      predicate: namedNode(predicateUri),
      object: literal(String(value)),
    });
  }

  return quads;
}

describe("libgraph", () => {
  describe("GraphIndex - Essential Functionality", () => {
    let graphIndex;
    let mockStorage;
    let n3Store;

    beforeEach(() => {
      mockStorage = createMockStorage();

      n3Store = new Store();
      graphIndex = new GraphIndex(mockStorage, n3Store, {}, "test.jsonl");
    });

    test("multiple resources can be added and queried selectively", async () => {
      // Create multiple test resources with different types and properties
      const resources = [
        {
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "user-message",
          }),
          jsonld: {
            "@context": {
              "@vocab": "http://schema.org/",
              dcterms: "http://purl.org/dc/terms/",
            },
            "@id": "http://example.org/message1",
            "@type": "Message",
            "dcterms:description": "User message about JavaScript",
            "dcterms:creator": "user123",
            "dcterms:subject": "javascript",
          },
        },
        {
          identifier: resource.Identifier.fromObject({
            type: "tool.ToolFunction",
            name: "search-tool",
          }),
          jsonld: {
            "@context": {
              "@vocab": "http://schema.org/",
              dcterms: "http://purl.org/dc/terms/",
            },
            "@id": "http://example.org/tool1",
            "@type": "ToolFunction",
            "dcterms:description": "Search functionality",
            "dcterms:creator": "system",
            "dcterms:subject": "search",
          },
        },
        {
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "assistant-message",
          }),
          jsonld: {
            "@context": {
              "@vocab": "http://schema.org/",
              dcterms: "http://purl.org/dc/terms/",
            },
            "@id": "http://example.org/message2",
            "@type": "Message",
            "dcterms:description": "Assistant response about Python",
            "dcterms:creator": "assistant",
            "dcterms:subject": "python",
          },
        },
      ];

      // Add all resources to the index
      for (const { identifier, jsonld } of resources) {
        const quads = jsonldToQuads(jsonld);
        await graphIndex.add(identifier, quads);
      }

      // Test 1: Query by type - should find only Message resources
      const messagePattern = {
        subject: null,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/Message",
      };
      const messageResults = await graphIndex.queryItems(messagePattern);
      assert.strictEqual(
        messageResults.length,
        2,
        "Should find 2 Message resources",
      );
      assert(
        messageResults.some((r) => String(r) === "common.Message.user-message"),
        "Should include user message",
      );
      assert(
        messageResults.some(
          (r) => String(r) === "common.Message.assistant-message",
        ),
        "Should include assistant message",
      );

      // Test 2: Query by type - should find only ToolFunction resources
      const toolPattern = {
        subject: null,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/ToolFunction",
      };
      const toolResults = await graphIndex.queryItems(toolPattern);
      assert.strictEqual(
        toolResults.length,
        1,
        "Should find 1 ToolFunction resource",
      );
      assert.strictEqual(
        String(toolResults[0]),
        "tool.ToolFunction.search-tool",
        "Should find search tool",
      );

      // Test 3: Query by creator - should find only system resources
      const systemPattern = {
        subject: null,
        predicate: "http://purl.org/dc/terms/creator",
        object: "system",
      };
      const systemResults = await graphIndex.queryItems(systemPattern);
      assert.strictEqual(
        systemResults.length,
        1,
        "Should find 1 system resource",
      );
      assert.strictEqual(
        String(systemResults[0]),
        "tool.ToolFunction.search-tool",
        "Should find search tool created by system",
      );

      // Test 4: Query by specific subject - should find only JavaScript resource
      const jsPattern = {
        subject: null,
        predicate: "http://purl.org/dc/terms/subject",
        object: "javascript",
      };
      const jsResults = await graphIndex.queryItems(jsPattern);
      assert.strictEqual(
        jsResults.length,
        1,
        "Should find 1 JavaScript resource",
      );
      assert.strictEqual(
        String(jsResults[0]),
        "common.Message.user-message",
        "Should find user message about JavaScript",
      );

      // Test 5: Query by specific ID - should find exactly one resource
      const specificPattern = {
        subject: "http://example.org/message1",
        predicate: null,
        object: null,
      };
      const specificResults = await graphIndex.queryItems(specificPattern);
      assert.strictEqual(
        specificResults.length,
        1,
        "Should find 1 specific resource",
      );
      assert.strictEqual(
        String(specificResults[0]),
        "common.Message.user-message",
        "Should find user message by ID",
      );

      // Test 6: Non-matching query - should find nothing
      const nonExistentPattern = {
        subject: "http://example.org/nonexistent",
        predicate: null,
        object: null,
      };
      const nonExistentResults =
        await graphIndex.queryItems(nonExistentPattern);
      assert.strictEqual(
        nonExistentResults.length,
        0,
        "Should find no non-existent resources",
      );
    });

    test("pattern normalization handles RDF queries correctly", async () => {
      // Add a test resource
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test-message",
      });

      const jsonld = {
        "@context": { "@vocab": "http://schema.org/" },
        "@id": "http://example.org/test",
        "@type": "Message",
        description: "Test content",
      };

      const quads = jsonldToQuads(jsonld);
      await graphIndex.add(identifier, quads);

      // Test: Query using full RDF type predicate should work
      const fullTypePattern = {
        subject: null,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/Message",
      };
      const fullTypeResults = await graphIndex.queryItems(fullTypePattern);
      assert.strictEqual(
        fullTypeResults.length,
        1,
        "Should find resource using full RDF type predicate",
      );
      assert.strictEqual(
        String(fullTypeResults[0]),
        "common.Message.test-message",
        "Should find correct resource using full predicate",
      );

      // Test: Non-type predicates should work with full URIs
      const descPattern = {
        subject: null,
        predicate: "http://schema.org/description",
        object: "Test content",
      };
      const descResults = await graphIndex.queryItems(descPattern);
      assert.strictEqual(
        descResults.length,
        1,
        "Should find resource by description predicate",
      );
      assert.strictEqual(
        String(descResults[0]),
        "common.Message.test-message",
        "Should find correct resource by description",
      );
    });

    test("individual resource operations work correctly", async () => {
      const identifier = resource.Identifier.fromObject({
        type: "common.Message",
        name: "test-message",
      });

      const jsonld = {
        "@context": { "@vocab": "http://schema.org/" },
        "@id": "http://example.org/test",
        "@type": "Message",
        description: "Test content",
      };

      // Test hasItem returns false before adding
      const hasBeforeAdd = await graphIndex.has(String(identifier));
      assert.strictEqual(
        hasBeforeAdd,
        false,
        "Should not have item before adding",
      );

      // Test get returns empty array before adding
      const getBeforeAdd = await graphIndex.get([String(identifier)]);
      assert.strictEqual(
        getBeforeAdd.length,
        0,
        "Should return empty array before adding",
      );

      // Add the item
      const quads = jsonldToQuads(jsonld);
      await graphIndex.add(identifier, quads);

      // Test hasItem returns true after adding
      const hasAfterAdd = await graphIndex.has(String(identifier));
      assert.strictEqual(hasAfterAdd, true, "Should have item after adding");

      // Test get returns identifier after adding
      const getAfterAdd = await graphIndex.get([String(identifier)]);
      assert.strictEqual(getAfterAdd.length, 1, "Should return one item");
      assert.strictEqual(
        String(getAfterAdd[0]),
        String(identifier),
        "Should return correct identifier after adding",
      );
    });

    test("constructor validation works correctly", () => {
      // Test missing storage
      assert.throws(
        () => new GraphIndex(null, new Store(), {}),
        /storage is required/,
        "Should throw for missing storage",
      );

      // Test missing store
      assert.throws(
        () => new GraphIndex(mockStorage, null, {}),
        /store must be an N3 Store instance/,
        "Should throw for missing store",
      );

      // Test invalid store
      assert.throws(
        () => new GraphIndex(mockStorage, {}, {}),
        /store must be an N3 Store instance/,
        "Should throw for invalid store",
      );
    });

    test("accessor methods return correct instances", () => {
      assert.strictEqual(
        graphIndex.storage(),
        mockStorage,
        "storage() should return storage instance",
      );
      assert.strictEqual(
        graphIndex.indexKey,
        "test.jsonl",
        "indexKey should return correct key",
      );
    });

    test("queryItems respects shared filters from IndexBase", async () => {
      // Add resources with different types and token counts for filter testing
      const resources = [
        {
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "msg1",
            tokens: 10,
          }),
          jsonld: {
            "@context": { "@vocab": "http://schema.org/" },
            "@id": "http://example.org/message1",
            "@type": "Message",
            description: "First message",
          },
        },
        {
          identifier: resource.Identifier.fromObject({
            type: "common.Message",
            name: "msg2",
            tokens: 20,
          }),
          jsonld: {
            "@context": { "@vocab": "http://schema.org/" },
            "@id": "http://example.org/message2",
            "@type": "Message",
            description: "Second message",
          },
        },
        {
          identifier: resource.Identifier.fromObject({
            type: "tool.Function",
            name: "func1",
            tokens: 15,
          }),
          jsonld: {
            "@context": { "@vocab": "http://schema.org/" },
            "@id": "http://example.org/tool1",
            "@type": "ToolFunction",
            description: "Search tool",
          },
        },
        {
          identifier: resource.Identifier.fromObject({
            type: "resource.Document",
            name: "doc1",
            tokens: 30,
          }),
          jsonld: {
            "@context": { "@vocab": "http://schema.org/" },
            "@id": "http://example.org/doc1",
            "@type": "Document",
            description: "Test document",
          },
        },
      ];

      // Add all resources
      for (const { identifier, jsonld } of resources) {
        const quads = jsonldToQuads(jsonld);
        await graphIndex.add(identifier, quads);
      }

      // Test prefix filter
      const messagePattern = {
        subject: null,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/Message",
      };

      const allMessageResults = await graphIndex.queryItems(messagePattern);
      const prefixFilteredResults = await graphIndex.queryItems(
        messagePattern,
        {
          prefix: "common.Message",
        },
      );
      const noMatchPrefixResults = await graphIndex.queryItems(messagePattern, {
        prefix: "nonexistent.Type",
      });

      assert.strictEqual(
        allMessageResults.length,
        2,
        "Should find all Message types without prefix filter",
      );
      assert.strictEqual(
        prefixFilteredResults.length,
        2,
        "Should find Message types matching prefix",
      );
      assert.strictEqual(
        noMatchPrefixResults.length,
        0,
        "Should find no items with non-matching prefix",
      );

      // Test limit filter
      const limitedResults = await graphIndex.queryItems(messagePattern, {
        limit: 1,
      });
      const zeroLimitResults = await graphIndex.queryItems(messagePattern, {
        limit: 0,
      });

      assert.strictEqual(
        limitedResults.length,
        1,
        "Should respect limit filter",
      );
      assert.strictEqual(
        zeroLimitResults.length,
        2,
        "Should return all items when limit is 0",
      );

      // Test max_tokens filter
      const tokenLimitedResults = await graphIndex.queryItems(messagePattern, {
        max_tokens: 25,
      });
      const strictTokenResults = await graphIndex.queryItems(messagePattern, {
        max_tokens: 15,
      });

      assert.strictEqual(
        tokenLimitedResults.length,
        1,
        "Should respect token limit and stop when exceeded",
      );
      assert.strictEqual(
        strictTokenResults.length,
        1,
        "Should return only first item within strict token limit",
      );
      assert.strictEqual(
        tokenLimitedResults[0].tokens,
        10,
        "Should return item with lowest token count first",
      );

      // Test combined filters
      const combinedResults = await graphIndex.queryItems(messagePattern, {
        prefix: "common.Message",
        limit: 1,
        max_tokens: 50,
      });

      assert.strictEqual(
        combinedResults.length,
        1,
        "Should apply all filters together",
      );
      assert(
        String(combinedResults[0]).startsWith("common.Message"),
        "Should match prefix filter",
      );
    });
  });

  describe("parseGraphQuery", () => {
    test("parses simple triple query with wildcards", () => {
      const result = parseGraphQuery("person:john ? ?");
      assert.deepStrictEqual(result, {
        subject: "person:john",
        predicate: "?",
        object: "?",
      });
    });

    test("parses triple query with quoted object", () => {
      const result = parseGraphQuery('? foaf:name "John Doe"');
      assert.deepStrictEqual(result, {
        subject: "?",
        predicate: "foaf:name",
        object: '"John Doe"',
      });
    });

    test("parses triple query with all fields specified", () => {
      const result = parseGraphQuery("person:john foaf:name person:john");
      assert.deepStrictEqual(result, {
        subject: "person:john",
        predicate: "foaf:name",
        object: "person:john",
      });
    });

    test("parses triple query with all wildcards", () => {
      const result = parseGraphQuery("? ? ?");
      assert.deepStrictEqual(result, {
        subject: "?",
        predicate: "?",
        object: "?",
      });
    });

    test("parses triple query with rdf:type predicate", () => {
      const result = parseGraphQuery("person:john rdf:type schema:Person");
      assert.deepStrictEqual(result, {
        subject: "person:john",
        predicate: "rdf:type",
        object: "schema:Person",
      });
    });

    test("handles quoted strings with spaces", () => {
      const result = parseGraphQuery('person:john foaf:name "John Q. Doe Jr."');
      assert.deepStrictEqual(result, {
        subject: "person:john",
        predicate: "foaf:name",
        object: '"John Q. Doe Jr."',
      });
    });

    test("throws error for empty line", () => {
      assert.throws(() => parseGraphQuery(""), /line cannot be empty/);
    });

    test("throws error for non-string input", () => {
      assert.throws(() => parseGraphQuery(null), /line must be a string/);
    });

    test("throws error for wrong number of parts", () => {
      assert.throws(
        () => parseGraphQuery("person:john foaf:name"),
        /Expected 3 parts/,
      );
    });

    test("throws error for unterminated quotes", () => {
      assert.throws(
        () => parseGraphQuery('person:john foaf:name "unterminated'),
        /Unterminated quoted string/,
      );
    });
  });
});
