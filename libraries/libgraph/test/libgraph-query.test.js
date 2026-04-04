import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
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

    for (const { identifier, jsonld } of resources) {
      const quads = jsonldToQuads(jsonld);
      await graphIndex.add(identifier, quads);
    }

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

    const nonExistentPattern = {
      subject: "http://example.org/nonexistent",
      predicate: null,
      object: null,
    };
    const nonExistentResults = await graphIndex.queryItems(nonExistentPattern);
    assert.strictEqual(
      nonExistentResults.length,
      0,
      "Should find no non-existent resources",
    );
  });

  test("pattern normalization handles RDF queries correctly", async () => {
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

    const hasBeforeAdd = await graphIndex.has(String(identifier));
    assert.strictEqual(
      hasBeforeAdd,
      false,
      "Should not have item before adding",
    );

    const getBeforeAdd = await graphIndex.get([String(identifier)]);
    assert.strictEqual(
      getBeforeAdd.length,
      0,
      "Should return empty array before adding",
    );

    const quads = jsonldToQuads(jsonld);
    await graphIndex.add(identifier, quads);

    const hasAfterAdd = await graphIndex.has(String(identifier));
    assert.strictEqual(hasAfterAdd, true, "Should have item after adding");

    const getAfterAdd = await graphIndex.get([String(identifier)]);
    assert.strictEqual(getAfterAdd.length, 1, "Should return one item");
    assert.strictEqual(
      String(getAfterAdd[0]),
      String(identifier),
      "Should return correct identifier after adding",
    );
  });

  test("constructor validation works correctly", () => {
    assert.throws(
      () => new GraphIndex(null, new Store(), {}),
      /storage is required/,
      "Should throw for missing storage",
    );

    assert.throws(
      () => new GraphIndex(mockStorage, null, {}),
      /store must be an N3 Store instance/,
      "Should throw for missing store",
    );

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
});
