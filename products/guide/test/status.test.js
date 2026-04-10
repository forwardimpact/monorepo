import { test, describe } from "node:test";
import assert from "node:assert";
import { runStatus } from "../lib/status.js";

/**
 * Creates a mock createServiceConfig that returns configs with predictable URLs.
 * @param {object} [overrides] - Per-service config overrides
 * @returns {Function} Async config factory
 */
function createMockConfigFactory(overrides = {}) {
  const defaults = {
    agent: {
      name: "agent",
      host: "localhost",
      port: 3002,
      url: "grpc://localhost:3002",
    },
    llm: {
      name: "llm",
      host: "localhost",
      port: 3004,
      url: "grpc://localhost:3004",
      llmToken: async () => "test-token",
    },
    memory: {
      name: "memory",
      host: "localhost",
      port: 3003,
      url: "grpc://localhost:3003",
    },
    graph: {
      name: "graph",
      host: "localhost",
      port: 3006,
      url: "grpc://localhost:3006",
    },
    vector: {
      name: "vector",
      host: "localhost",
      port: 3005,
      url: "grpc://localhost:3005",
    },
    tool: {
      name: "tool",
      host: "localhost",
      port: 3007,
      url: "grpc://localhost:3007",
    },
    trace: {
      name: "trace",
      host: "localhost",
      port: 3008,
      url: "grpc://localhost:3008",
    },
    web: {
      name: "web",
      host: "localhost",
      port: 3001,
      url: "http://localhost:3001",
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
          // Derive service name from port for matching
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

/**
 * Creates a mock health definition (pass-through, just needs the shape).
 */
function createMockHealthDefinition() {
  return {
    Check: {
      path: "/grpc.health.v1.Health/Check",
      requestStream: false,
      responseStream: false,
    },
  };
}

/**
 * Creates mock fs module.
 * @param {string[]} agentFiles - Files to return from readdir
 */
function createMockFs(
  agentFiles = ["planner.agent.md", "researcher.agent.md"],
) {
  return {
    readdir: async () => agentFiles,
  };
}

/**
 * Builds a complete mock deps object.
 * @param {object} [opts] - Options
 * @param {Set<string>} [opts.unreachable] - Unreachable service names
 * @param {object} [opts.configOverrides] - Per-service config overrides
 * @param {string[]} [opts.agentFiles] - Agent files for fs mock
 * @returns {object} deps for runStatus
 */
/**
 * Creates a mock fetch that returns ok for /web/health.
 * @param {boolean} [ok=true] - Whether the response should be ok
 */
function createMockFetch(ok = true) {
  return async () => ({ ok });
}

function createMockDeps(opts = {}) {
  return {
    createServiceConfig: createMockConfigFactory(opts.configOverrides),
    grpc: createMockGrpc(opts.unreachable),
    healthDefinition: createMockHealthDefinition(),
    fs: createMockFs(opts.agentFiles),
    fetch: opts.fetch || createMockFetch(true),
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
    assert.strictEqual(result.credentials.LLM_TOKEN, "configured");
    assert.strictEqual(result.data.agents, 2);
  });

  test("one service unreachable: not ready", async () => {
    // Make the mock client detect "agent" in the URI
    const deps = createMockDeps({
      configOverrides: {
        agent: {
          name: "agent",
          host: "agent.guide.local",
          port: 3002,
          url: "grpc://agent.guide.local:3002",
        },
      },
      unreachable: new Set(["agent"]),
    });

    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "not ready");
    assert.strictEqual(result.services.agent.status, "unreachable");
    assert.strictEqual(result.services.llm.status, "ok");
  });

  test("LLM_TOKEN missing: not ready", async () => {
    const deps = createMockDeps({
      configOverrides: {
        llm: {
          name: "llm",
          host: "localhost",
          port: 3004,
          url: "grpc://localhost:3004",
          llmToken: async () => {
            throw new Error("LLM_TOKEN not set");
          },
        },
      },
    });

    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "not ready");
    assert.strictEqual(result.credentials.LLM_TOKEN, "missing");
  });

  test("zero data counts do not affect verdict", async () => {
    // All services ok, credentials ok, but no agent files
    const deps = createMockDeps({ agentFiles: [] });
    const result = await runStatus(deps);

    assert.strictEqual(result.verdict, "ready");
    assert.strictEqual(result.data.agents, 0);
    // resources/triples are 0 because graph data query is skipped in test
    // (no real GraphClient), which is fine — they default to 0
    assert.strictEqual(result.data.resources, 0);
    assert.strictEqual(result.data.triples, 0);
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
    assert.strictEqual(typeof parsed.services.agent.url, "string");
    assert.strictEqual(typeof parsed.services.agent.status, "string");
    assert.strictEqual(typeof parsed.data.resources, "number");
    assert.strictEqual(typeof parsed.data.triples, "number");
    assert.strictEqual(typeof parsed.data.agents, "number");
  });
});
