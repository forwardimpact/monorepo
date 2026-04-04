import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
import { parseGraphQuery } from "../index.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

const { namedNode, literal } = DataFactory;

function jsonldToQuads(jsonld) {
  const quads = [];
  const subjectNode = namedNode(jsonld["@id"] || "http://example.org/blank");

  if (jsonld["@type"]) {
    quads.push({
      subject: subjectNode,
      predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
      object: namedNode(`http://schema.org/${jsonld["@type"]}`),
    });
  }

  for (const [key, value] of Object.entries(jsonld)) {
    if (key.startsWith("@")) continue;

    let predicateUri = key;
    if (key.includes(":") && jsonld["@context"]) {
      const [prefix, localPart] = key.split(":");
      if (jsonld["@context"][prefix]) {
        predicateUri = jsonld["@context"][prefix] + localPart;
      }
    } else if (jsonld["@context"] && jsonld["@context"]["@vocab"]) {
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

describe("GraphIndex - Filters and parseGraphQuery", () => {
  describe("queryItems respects shared filters from IndexBase", () => {
    let graphIndex;
    let mockStorage;
    let n3Store;

    beforeEach(() => {
      mockStorage = createMockStorage();
      n3Store = new Store();
      graphIndex = new GraphIndex(mockStorage, n3Store, {}, "test.jsonl");
    });

    test("queryItems respects shared filters from IndexBase", async () => {
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

      for (const { identifier, jsonld } of resources) {
        const quads = jsonldToQuads(jsonld);
        await graphIndex.add(identifier, quads);
      }

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
