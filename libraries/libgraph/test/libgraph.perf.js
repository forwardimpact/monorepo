import { test, describe } from "node:test";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../index/graph.js";
import { parseGraphQuery } from "../index.js";
import { createPerformanceTest } from "@forwardimpact/libperf";

const { namedNode, literal } = DataFactory;

describe("LibGraph Performance Tests", () => {
  /**
   * Generate mock RDF triples for testing
   * @param {number} count - Number of triples to generate
   * @returns {object[]} Array of quad objects
   */
  function generateMockTriples(count) {
    const quads = [];

    for (let i = 0; i < count; i++) {
      const personId = Math.floor(i / 10);
      quads.push({
        subject: namedNode(`https://example.invalid/person-${personId}`),
        predicate: namedNode("http://xmlns.com/foaf/0.1/name"),
        object: literal(`Person ${personId}`),
      });

      quads.push({
        subject: namedNode(`https://example.invalid/person-${personId}`),
        predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        object: namedNode("https://schema.org/Person"),
      });
    }

    return quads.slice(0, count);
  }

  /**
   * Create mock storage with graph data
   * @param {number} tripleCount - Number of triples to generate
   * @returns {object} Mock storage and dependencies
   */
  function createDependencies(tripleCount) {
    const quads = generateMockTriples(tripleCount);
    const items = [];

    for (let i = 0; i < Math.ceil(tripleCount / 10); i++) {
      const itemQuads = quads.slice(i * 10, (i + 1) * 10);
      items.push({
        id: `resource-${i}`,
        identifier: { name: `resource-${i}`, type: "schema.Person" },
        quads: itemQuads,
      });
    }

    const jsonlData = items.map((item) => JSON.stringify(item)).join("\n");

    const mockStorage = {
      get: (key) => {
        if (key === "index.jsonl") {
          return Promise.resolve(Buffer.from(jsonlData));
        }
        return Promise.resolve(Buffer.from(""));
      },
      exists: (key) => {
        if (key === "index.jsonl") return Promise.resolve(true);
        return Promise.resolve(false);
      },
      put: () => Promise.resolve(),
    };

    return { mockStorage, quads };
  }

  test(
    "parseGraphQuery parsing performance",
    createPerformanceTest({
      count: 10000,
      setupFn: (iterations) => {
        const queries = [
          "person:john ? ?",
          "? foaf:name ?",
          '? ? "John Doe"',
          "? rdf:type schema:Person",
          "person:sarah foaf:knows person:michael",
        ];
        return { queries, iterations };
      },
      testFn: async ({ queries, iterations }) => {
        for (let i = 0; i < iterations; i++) {
          parseGraphQuery(queries[i % queries.length]);
        }
      },
      constraints: {
        maxDuration: 12,
        maxMemory: 4500,
      },
    }),
  );

  test(
    "GraphIndex.loadData by triple count",
    createPerformanceTest({
      count: [500, 1000, 2000, 5000],
      setupFn: (tripleCount) => {
        const { mockStorage } = createDependencies(tripleCount);
        const store = new Store();
        return { mockStorage, store };
      },
      testFn: ({ mockStorage, store }) => {
        const index = new GraphIndex(mockStorage, store, {}, "index.jsonl");
        return index.loadData();
      },
      constraints: {
        maxDuration: 800,
        maxMemory: 25000,
        scaling: "linear",
        tolerance: 3.0,
      },
    }),
  );

  test(
    "GraphIndex.query by graph size",
    createPerformanceTest({
      count: [500, 1000, 2000, 4000],
      setupFn: async (tripleCount) => {
        const { mockStorage } = createDependencies(tripleCount);
        const store = new Store();
        const index = new GraphIndex(mockStorage, store, {}, "index.jsonl");
        await index.loadData();
        const pattern = { subject: "?", predicate: "?", object: "?" };
        return { index, pattern };
      },
      testFn: ({ index, pattern }) => index.queryItems(pattern),
      constraints: {
        maxDuration: 35,
        maxMemory: 5000,
        scaling: "linear",
        tolerance: 2.0,
      },
    }),
  );

  test(
    "GraphIndex.query memory stability",
    createPerformanceTest({
      count: 1000,
      setupFn: async (iterations) => {
        const { mockStorage } = createDependencies(1000);
        const store = new Store();
        const index = new GraphIndex(mockStorage, store, {}, "index.jsonl");
        await index.loadData();
        const patterns = [
          { subject: "?", predicate: "?", object: "?" },
          { subject: "?", predicate: "foaf:name", object: "?" },
          { subject: "?", predicate: "rdf:type", object: "schema:Person" },
        ];
        return { index, patterns, iterations };
      },
      testFn: async ({ index, patterns, iterations }) => {
        for (let i = 0; i < iterations; i++) {
          await index.queryItems(patterns[i % patterns.length]);
        }
      },
      constraints: {
        maxMemory: 2500,
      },
    }),
  );
});
