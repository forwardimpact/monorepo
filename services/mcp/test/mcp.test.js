import { test, describe } from "node:test";
import assert from "node:assert";
import { spy } from "@forwardimpact/libharness";

import { buildPromptText, createMcpService, isAuthorized } from "../index.js";
import { registerToolsFromConfig } from "@forwardimpact/libmcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Mock config with mcpToken() and tools */
function createMockConfig() {
  return {
    host: "127.0.0.1",
    port: 0,
    mcpToken: () => "test-bearer-token",
    systemPrompt: "You are Guide, a test agent.",
    tools: {
      get_ontology: {
        method: "graph.Graph.GetOntology",
        description: "Returns all entity types.",
      },
      get_subjects: {
        method: "graph.Graph.GetSubjects",
        description: "Lists entity URIs.",
      },
      query_by_pattern: {
        method: "graph.Graph.QueryByPattern",
        description: "Retrieves structured data.",
      },
      search_content: {
        method: "vector.Vector.SearchContent",
        description: "Semantic search.",
      },
      pathway_list_jobs: {
        method: "pathway.Pathway.ListJobs",
        description: "List jobs.",
      },
      pathway_describe_job: {
        method: "pathway.Pathway.DescribeJob",
        description: "Describe a job.",
      },
      pathway_list_agent_profiles: {
        method: "pathway.Pathway.ListAgentProfiles",
        description: "List agent profiles.",
      },
      pathway_describe_agent_profile: {
        method: "pathway.Pathway.DescribeAgentProfile",
        description: "Describe agent profile.",
      },
      pathway_describe_progression: {
        method: "pathway.Pathway.DescribeProgression",
        description: "Compute progression delta.",
      },
      pathway_list_job_software: {
        method: "pathway.Pathway.ListJobSoftware",
        description: "List job software.",
      },
    },
  };
}

/** Mock gRPC clients keyed by package name */
function createMockClients() {
  return {
    graph: {
      GetOntology: spy(() => Promise.resolve({ content: "ontology-ttl" })),
      GetSubjects: spy(() => Promise.resolve({ content: "sub1\tsub2" })),
      QueryByPattern: spy(() =>
        Promise.resolve({ identifiers: ["id1", "id2"] }),
      ),
    },
    vector: {
      SearchContent: spy(() => Promise.resolve({ identifiers: ["result1"] })),
    },
    pathway: {
      ListJobs: spy(() => Promise.resolve({ content: "pathway-jobs-ttl" })),
      DescribeJob: spy(() => Promise.resolve({ content: "pathway-job-ttl" })),
      ListAgentProfiles: spy(() =>
        Promise.resolve({ content: "agent-profiles-ttl" }),
      ),
      DescribeAgentProfile: spy(() =>
        Promise.resolve({ content: "agent-profile-ttl" }),
      ),
      DescribeProgression: spy(() =>
        Promise.resolve({ content: "progression-ttl" }),
      ),
      ListJobSoftware: spy(() => Promise.resolve({ content: "software-ttl" })),
    },
  };
}

/**
 * Helper: call a registered tool handler through the McpServer.
 * Uses the server's internal _registeredTools object.
 */
async function callTool(mcpServer, toolName, args = {}) {
  const tools = mcpServer._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return tool.handler({ name: toolName, arguments: args });
}

describe("buildPromptText", () => {
  test("returns systemPrompt unchanged when no tools have routing", () => {
    const result = buildPromptText("intro", {
      A: { method: "x.X.A", description: "a" },
    });
    assert.strictEqual(result, "intro");
  });

  test("appends one line per (tool, routing statement) pair", () => {
    const result = buildPromptText("intro", {
      ListJobs: { method: "p.P.ListJobs", routing: ["Jobs/roles"] },
      DescribeJob: { method: "p.P.DescribeJob", routing: ["Jobs/roles"] },
      QueryByPattern: {
        method: "g.G.QueryByPattern",
        routing: ["Skills (capability URI)", "Behaviour maturity"],
      },
    });
    assert.strictEqual(
      result,
      [
        "intro",
        "Jobs/roles -> ListJobs",
        "Jobs/roles -> DescribeJob",
        "Skills (capability URI) -> QueryByPattern",
        "Behaviour maturity -> QueryByPattern",
      ].join("\n"),
    );
  });

  test("omits routing lines for tools that are removed", () => {
    const result = buildPromptText("intro", {
      ListJobs: { method: "p.P.ListJobs", routing: ["Jobs/roles"] },
    });
    assert.ok(!result.includes("SearchContent"));
    assert.ok(result.includes("Jobs/roles -> ListJobs"));
  });

  test("handles missing tools object", () => {
    assert.strictEqual(buildPromptText("intro", undefined), "intro");
  });
});

describe("MCP service", () => {
  describe("tool registration", () => {
    test("registers all 10 expected tools", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const expectedTools = [
        "get_ontology",
        "get_subjects",
        "query_by_pattern",
        "search_content",
        "pathway_list_jobs",
        "pathway_describe_job",
        "pathway_list_agent_profiles",
        "pathway_describe_agent_profile",
        "pathway_describe_progression",
        "pathway_list_job_software",
      ];

      const registered = server._registeredTools;
      assert.strictEqual(Object.keys(registered).length, 10);
      for (const name of expectedTools) {
        assert.ok(registered[name], `Missing tool: ${name}`);
      }
    });
  });

  describe("HTTP server", () => {
    test("factory returns start function", async () => {
      const config = createMockConfig();
      const clients = createMockClients();
      const logger = { info: spy() };

      const { start } = createMcpService({
        config,
        logger,
        graphClient: clients.graph,
        vectorClient: clients.vector,
        pathwayClient: clients.pathway,
      });
      assert.strictEqual(typeof start, "function");
    });

    test("auth rejects missing token", async () => {
      const req = { headers: {} };
      assert.strictEqual(isAuthorized(req, "test-bearer-token"), false);
    });

    test("auth rejects wrong token", async () => {
      const req = { headers: { authorization: "Bearer wrong-token-xx" } };
      assert.strictEqual(isAuthorized(req, "test-bearer-token"), false);
    });

    test("auth rejects wrong-length token without timingSafeEqual throwing", async () => {
      const req = { headers: { authorization: "Bearer x" } };
      assert.strictEqual(isAuthorized(req, "test-bearer-token"), false);
    });

    test("auth rejects non-string authorization header", async () => {
      const req = { headers: { authorization: ["Bearer test-bearer-token"] } };
      assert.strictEqual(isAuthorized(req, "test-bearer-token"), false);
    });

    test("auth accepts valid token", async () => {
      const req = { headers: { authorization: "Bearer test-bearer-token" } };
      assert.strictEqual(isAuthorized(req, "test-bearer-token"), true);
    });
  });

  describe("tool handlers route to correct backend", () => {
    test("get_ontology calls graph.GetOntology", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const result = await callTool(server, "get_ontology");
      assert.strictEqual(clients.graph.GetOntology.mock.calls.length, 1);
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "ontology-ttl" }],
      });
    });

    test("get_subjects calls graph.GetSubjects", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const result = await callTool(server, "get_subjects", {
        type: "schema:Organization",
      });
      assert.strictEqual(clients.graph.GetSubjects.mock.calls.length, 1);
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "sub1\tsub2" }],
      });
    });

    test("search_content calls vector.SearchContent", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const result = await callTool(server, "search_content", {
        input: "test query",
      });
      assert.strictEqual(clients.vector.SearchContent.mock.calls.length, 1);
      assert.ok(result.content[0].text.includes("result1"));
    });

    test("pathway_describe_job calls pathway.DescribeJob", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const result = await callTool(server, "pathway_describe_job", {
        discipline: "fde",
        level: "l3",
      });
      assert.strictEqual(clients.pathway.DescribeJob.mock.calls.length, 1);
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "pathway-job-ttl" }],
      });
    });

    test("pathway_list_jobs calls pathway.ListJobs", async () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      const config = createMockConfig();
      const clients = createMockClients();
      registerToolsFromConfig(server, config, clients);

      const result = await callTool(server, "pathway_list_jobs", {});
      assert.strictEqual(clients.pathway.ListJobs.mock.calls.length, 1);
      assert.deepStrictEqual(result, {
        content: [{ type: "text", text: "pathway-jobs-ttl" }],
      });
    });
  });
});
