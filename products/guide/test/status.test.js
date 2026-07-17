import { test, describe } from "node:test";
import assert from "node:assert";
import {
  createMockClock,
  createMockFs,
  createMockGrpcHealthDefinition,
} from "@forwardimpact/libmock";
import { runStatus } from "../src/lib/status.js";

/**
 * Creates a mock createServiceConfig that returns configs with predictable URLs.
 * @param {object} [overrides] - Per-service config overrides
 * @returns {Function} Async config factory
 */
function createMockConfigFactory(overrides = {}) {
  const defaults = {
    span: {
      name: "span",
      host: "localhost",
      port: 3001,
      url: "grpc://localhost:3001",
      anthropicToken: async () => "test-anthropic-key",
    },
    vector: {
      name: "vector",
      host: "localhost",
      port: 3002,
      url: "grpc://localhost:3002",
      anthropicToken: async () => "test-anthropic-key",
    },
    graph: {
      name: "graph",
      host: "localhost",
      port: 3003,
      url: "grpc://localhost:3003",
      anthropicToken: async () => "test-anthropic-key",
    },
    pathway: {
      name: "pathway",
      host: "localhost",
      port: 3004,
      url: "grpc://localhost:3004",
      anthropicToken: async () => "test-anthropic-key",
    },
    mcp: {
      name: "mcp",
      host: "localhost",
      port: 3005,
      url: "http://localhost:3005",
      anthropicToken: async () => "test-anthropic-key",
    },
  };

  return async (name) => ({
    ...defaults[name],
    ...overrides[name],
  });
}

/**
 * Creates a mock grpc module whose health clients always succeed.
 * @param {Set<string>} [unreachable] - Service names that should fail
 * @returns {object} Mock grpc module
 */
function createMockGrpc(unreachable = new Set()) {
  return {
    makeGenericClientConstructor: (_def, _name) => {
      return class MockClient {
        #uri;
        constructor(uri) {
          this.#uri = uri;
        }
        Check(_req, _opts, callback) {
          const isUnreachable = [...unreachable].some((name) =>
            this.#uri.includes(name),
          );
          if (isUnreachable) {
            callback(new Error("unreachable"));
          } else {
            callback(null, { status: 1 }); // SERVING
          }
        }
        close() {}
      };
    },
    credentials: {
      createInsecure: () => ({}),
    },
  };
}

function createMockFetch(ok = true) {
  return async () => ({ ok });
}

function createMockDeps(opts = {}) {
  return {
    createServiceConfig: createMockConfigFactory(opts.configOverrides),
    grpc: createMockGrpc(opts.unreachable),
    healthDefinition: createMockGrpcHealthDefinition(),
    fs: createMockFs(),
    clock: createMockClock(),
    fetch: opts.fetch || createMockFetch(true),
    queryDataInventory: async () => ({ resources: 0, triples: 0 }),
  };
}

describe("runStatus", () => {
  test("all services ok and credentials configured: ready", async () => {
    const deps = createMockDeps();
    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "ready");
    for (const [, info] of Object.entries(result.services)) {
      assert.strictEqual(info.status, "ok");
    }
    assert.strictEqual(result.credentials.ANTHROPIC_API_KEY, "configured");
  });

  test("one service unreachable: not ready", async () => {
    const deps = createMockDeps({
      configOverrides: {
        graph: {
          name: "graph",
          host: "graph.guide.local",
          port: 3003,
          url: "grpc://graph.guide.local:3003",
          anthropicToken: async () => "test-key",
        },
      },
      unreachable: new Set(["graph"]),
    });

    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "not ready");
    assert.strictEqual(result.services.graph.status, "unreachable");
    assert.strictEqual(result.services.vector.status, "ok");
  });

  test("ANTHROPIC_API_KEY missing: not ready", async () => {
    const deps = createMockDeps({
      configOverrides: {
        mcp: {
          name: "mcp",
          host: "localhost",
          port: 3005,
          url: "http://localhost:3005",
          anthropicToken: async () => {
            throw new Error("Not authenticated");
          },
        },
      },
    });

    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "not ready");
    assert.strictEqual(result.credentials.ANTHROPIC_API_KEY, "missing");
  });

  test("result serializes to expected JSON shape", async () => {
    const deps = createMockDeps();
    const result = await runStatus(deps);

    const json = JSON.stringify(result, null, 2);
    const parsed = JSON.parse(json);

    assert.ok(parsed.services);
    assert.ok(parsed.data);
    assert.ok(parsed.credentials);
    assert.ok(parsed.verdict);
    assert.strictEqual(typeof parsed.services.graph.url, "string");
    assert.strictEqual(typeof parsed.services.graph.status, "string");
    assert.strictEqual(typeof parsed.data.resources, "number");
    assert.strictEqual(typeof parsed.data.triples, "number");
  });
});
