import { test, describe } from "node:test";

import { VectorIndex } from "../index/vector.js";
import { createPerformanceTest } from "@forwardimpact/libperf";

describe("LibVector Performance Tests", () => {
  /**
   * Generate a random vector of specified dimensions
   * @param {number} dimensions - Number of dimensions
   * @returns {number[]} Random vector
   */
  function generateRandomVector(dimensions) {
    return Array.from({ length: dimensions }, () => Math.random() - 0.5);
  }

  /**
   * Generate mock vector data for testing
   * @param {number} count - Number of vectors to generate
   * @param {number} dimensions - Vector dimensions
   * @returns {object[]} Mock vector data
   */
  function generateMockVectors(count, dimensions) {
    const vectors = [];

    for (let i = 0; i < count; i++) {
      const vector = generateRandomVector(dimensions);

      vectors.push({
        id: `item-${i.toString().padStart(6, "0")}`,
        vector,
        tokens: Math.floor(Math.random() * 1000),
      });
    }

    return vectors;
  }

  /**
   * Create mock storage with generated vector data
   * @param {number} vectorCount - Number of vectors to generate
   * @param {number} dimensionCount - Vector dimensions
   * @returns {object} Mock storage and vector data
   */
  function createDependencies(vectorCount, dimensionCount = 1024) {
    const vectorData = generateMockVectors(vectorCount, dimensionCount);

    const mockStorage = {
      get: (key) => {
        if (key === "index.json") {
          return Promise.resolve(Buffer.from(JSON.stringify(vectorData)));
        }
        return Promise.resolve(Buffer.from(""));
      },
      exists: (key) => {
        if (key === "index.json") return Promise.resolve(true);
        return Promise.resolve(false);
      },
      put: () => Promise.resolve(),
    };

    return { mockStorage };
  }

  test(
    "VectorIndex.loadData by vector",
    createPerformanceTest({
      count: [100, 500, 1000, 2000],
      setupFn: (vectorCount) => createDependencies(vectorCount, 1024),
      testFn: ({ mockStorage }) => {
        const index = new VectorIndex(mockStorage);
        return index.loadData();
      },
      constraints: {
        maxDuration: 650,
        maxMemory: 82000,
        scaling: "linear",
        tolerance: 8.0,
      },
    }),
  );

  test(
    "VectorIndex.loadData by dimensions",
    createPerformanceTest({
      count: [256, 512, 1024],
      setupFn: (dimensionCount) => createDependencies(1000, dimensionCount),
      testFn: ({ mockStorage }) => {
        const index = new VectorIndex(mockStorage);
        return index.loadData();
      },
      constraints: {
        maxDuration: 450,
        maxMemory: 47000,
        scaling: "linear",
        tolerance: 8.0,
      },
    }),
  );

  test(
    "VectorIndex.queryItems by vector",
    createPerformanceTest({
      count: [100, 300, 600, 1200],
      setupFn: async (vectorCount) => {
        const { mockStorage } = createDependencies(vectorCount, 512);
        const index = new VectorIndex(mockStorage);
        await index.loadData();
        return { index, query: generateRandomVector(512) };
      },
      testFn: ({ index, query }) =>
        index.queryItems(query, { threshold: 0.3, limit: 10 }),
      constraints: {
        maxDuration: 2,
        maxMemory: 10,
        scaling: "linear",
        tolerance: 2.0,
      },
    }),
  );

  test(
    "VectorIndex.queryItems memory stability",
    createPerformanceTest({
      count: 1000,
      setupFn: async (iterations) => {
        const { mockStorage } = createDependencies(1000, 1024);
        const index = new VectorIndex(mockStorage);
        await index.loadData();
        return { index, query: generateRandomVector(1024), iterations };
      },
      testFn: async ({ index, query, iterations }) => {
        for (let i = 0; i < iterations; i++) {
          await index.queryItems(query, { threshold: 0.3, limit: 10 });
        }
      },
      constraints: {
        maxMemory: 1650,
      },
    }),
  );
});
