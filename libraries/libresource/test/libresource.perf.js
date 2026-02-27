import { test, describe } from "node:test";

import { ResourceIndex } from "../index.js";
import { common } from "@forwardimpact/libtype";
import { createPerformanceTest } from "@forwardimpact/libperf";

describe("LibResource Performance Tests", () => {
  /**
   * Generate mock resource data
   * @param {number} count - Number of resources to generate
   * @returns {object[]} Mock resources
   */
  function generateMockResources(count) {
    const resources = [];

    for (let i = 0; i < count; i++) {
      const msg = new common.Message({
        role: "user",
        content: { text: `Content ${i}` },
      });
      resources.push(msg);
    }

    return resources;
  }

  /**
   * Create mock storage and policy
   * @param {number} resourceCount - Number of resources
   * @returns {object} Mock dependencies
   */
  function createDependencies(resourceCount) {
    const resources = generateMockResources(resourceCount);
    const resourceMap = new Map();

    for (const res of resources) {
      res.withIdentifier();
      resourceMap.set(`${res.id.name}.json`, JSON.stringify(res.toJSON()));
    }

    const mockStorage = {
      get: (key) => {
        const data = resourceMap.get(key);
        if (data) {
          return Promise.resolve(Buffer.from(data));
        }
        return Promise.resolve(null);
      },
      getMany: async (keys) => {
        const result = {};
        for (const key of keys) {
          const data = resourceMap.get(key);
          if (data) {
            result[key] = JSON.parse(data);
          }
        }
        return result;
      },
      exists: (key) => Promise.resolve(resourceMap.has(key)),
      put: (key, data) => {
        resourceMap.set(key, data);
        return Promise.resolve();
      },
    };

    const mockPolicy = {
      evaluate: () => Promise.resolve(true),
    };

    return { mockStorage, mockPolicy, resources };
  }

  test(
    "ResourceIndex.get by resource count",
    createPerformanceTest({
      count: [25, 50, 100, 200],
      setupFn: (resourceCount) => {
        const { mockStorage, mockPolicy, resources } =
          createDependencies(resourceCount);
        const index = new ResourceIndex(mockStorage, mockPolicy);
        const ids = resources.map((r) => r.id.name);
        return { index, ids };
      },
      testFn: ({ index, ids }) => index.get(ids),
      constraints: {
        maxDuration: 250,
        maxMemory: 15000,
        scaling: "linear",
        tolerance: 2.0,
      },
    }),
  );

  test(
    "ResourceIndex.put by resource count",
    createPerformanceTest({
      count: [25, 50, 100, 200],
      setupFn: (resourceCount) => {
        const { mockStorage, mockPolicy } = createDependencies(0);
        const index = new ResourceIndex(mockStorage, mockPolicy);
        const resources = generateMockResources(resourceCount);
        return { index, resources };
      },
      testFn: async ({ index, resources }) => {
        for (const resource of resources) {
          await index.put(resource);
        }
      },
      constraints: {
        maxDuration: 150,
        maxMemory: 8000,
        scaling: "linear",
        tolerance: 2.0,
      },
    }),
  );

  test(
    "ResourceIndex.get with policy evaluation",
    createPerformanceTest({
      count: [25, 50, 100, 200],
      setupFn: (resourceCount) => {
        const { mockStorage, resources } = createDependencies(resourceCount);

        const mockPolicy = {
          evaluate: () => Promise.resolve(true),
        };

        const index = new ResourceIndex(mockStorage, mockPolicy);
        const ids = resources.map((r) => r.id.name);
        const actor = "common.System.root";
        return { index, ids, actor };
      },
      testFn: ({ index, ids, actor }) => index.get(ids, actor),
      constraints: {
        maxDuration: 280,
        maxMemory: 16000,
        scaling: "linear",
        tolerance: 2.0,
      },
    }),
  );

  test(
    "ResourceIndex memory stability",
    createPerformanceTest({
      count: 1000,
      setupFn: (iterations) => {
        const { mockStorage, mockPolicy } = createDependencies(0);
        const index = new ResourceIndex(mockStorage, mockPolicy);
        const resource = generateMockResources(1)[0];
        resource.withIdentifier();
        return { index, resource, iterations };
      },
      testFn: async ({ index, resource, iterations }) => {
        for (let i = 0; i < iterations; i++) {
          await index.put(resource);
          const retrieved = await index.get([resource.id.toString()]);
          if (!retrieved || retrieved.length === 0) {
            throw new Error("Resource retrieval failed");
          }
        }
      },
      constraints: {
        maxMemory: 10000,
      },
    }),
  );
});
