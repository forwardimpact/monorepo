import { test, describe } from "node:test";
import assert from "node:assert";

import { registerToolsFromConfig } from "@forwardimpact/libmcp";
import { buildZodSchema } from "../src/schema.js";
import { assertThrowsMessage, spy } from "@forwardimpact/libmock";

/** Minimal mock McpServer that records tool() calls */
function createMockServer() {
  const tools = {};
  return {
    _registeredTools: tools,
    tool(name, description, schema, handler) {
      tools[name] = { description, schema, handler };
    },
  };
}

/** Config with all 10 tools matching the starter config.json */
function createTestConfig() {
  return {
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
      ListJobs: spy(() => Promise.resolve({ content: "jobs-ttl" })),
      DescribeJob: spy(() => Promise.resolve({ content: "job-ttl" })),
      ListAgentProfiles: spy(() =>
        Promise.resolve({ content: "profiles-ttl" }),
      ),
      DescribeAgentProfile: spy(() =>
        Promise.resolve({ content: "profile-ttl" }),
      ),
      DescribeProgression: spy(() =>
        Promise.resolve({ content: "progression-ttl" }),
      ),
      ListJobSoftware: spy(() => Promise.resolve({ content: "software-ttl" })),
    },
  };
}

describe("registerToolsFromConfig", () => {
  test("empty tools config is a no-op", () => {
    const server = createMockServer();
    registerToolsFromConfig(server, { tools: {} }, {});
    assert.strictEqual(Object.keys(server._registeredTools).length, 0);
  });

  test("undefined tools config is a no-op", () => {
    const server = createMockServer();
    registerToolsFromConfig(server, {}, {});
    assert.strictEqual(Object.keys(server._registeredTools).length, 0);
  });

  test("registers correct number of tools on server", () => {
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients);
    assert.strictEqual(Object.keys(server._registeredTools).length, 10);
  });

  test("throws for unknown method not in metadata", () => {
    const server = createMockServer();
    assertThrowsMessage(
      () =>
        registerToolsFromConfig(
          server,
          { tools: { bad: { method: "fake.Fake.Nope", description: "x" } } },
          {},
        ),
      /no metadata for fake.Fake.Nope/,
    );
  });

  test("throws for missing client", () => {
    const server = createMockServer();
    assertThrowsMessage(
      () =>
        registerToolsFromConfig(
          server,
          {
            tools: {
              get_ontology: {
                method: "graph.Graph.GetOntology",
                description: "x",
              },
            },
          },
          {},
        ),
      /no client for package/,
    );
  });

  test("handler calls correct client method", async () => {
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients);

    const result = await server._registeredTools.get_ontology.handler({});
    assert.strictEqual(clients.graph.GetOntology.mock.calls.length, 1);
    assert.deepStrictEqual(result, {
      content: [{ type: "text", text: "ontology-ttl" }],
    });
  });

  test("handler returns identifiers JSON when no resourceIndex", async () => {
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients);

    const result = await server._registeredTools.query_by_pattern.handler({});
    assert.ok(result.content[0].text.includes("id1"));
    assert.ok(result.content[0].text.includes("id2"));
  });

  test("handler resolves identifiers via resourceIndex", async () => {
    const mockResourceIndex = {
      get: spy(() =>
        Promise.resolve([
          { content: "content-for-id1" },
          { content: "content-for-id2" },
        ]),
      ),
    };
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients, mockResourceIndex);

    const result = await server._registeredTools.query_by_pattern.handler({});
    assert.strictEqual(
      result.content[0].text,
      "content-for-id1\n\ncontent-for-id2",
    );
    assert.strictEqual(mockResourceIndex.get.mock.calls.length, 1);
  });

  test("handler returns fallback when resourceIndex resolves empty", async () => {
    const mockResourceIndex = {
      get: spy(() => Promise.resolve([])),
    };
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients, mockResourceIndex);

    const result = await server._registeredTools.query_by_pattern.handler({});
    assert.strictEqual(result.content[0].text, "No results found.");
  });

  test("handler wraps single value for repeated field into array", async () => {
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients);

    await server._registeredTools.search_content.handler({
      input: "test query",
    });
    const call = clients.vector.SearchContent.mock.calls[0];
    const req = call.arguments[0];
    assert.ok(Array.isArray(req.input));
    assert.deepStrictEqual(req.input, ["test query"]);
  });

  test("handler returns content text when no identifiers", async () => {
    const server = createMockServer();
    const config = createTestConfig();
    const clients = createMockClients();
    registerToolsFromConfig(server, config, clients);

    const result = await server._registeredTools.pathway_list_jobs.handler({});
    assert.deepStrictEqual(result, {
      content: [{ type: "text", text: "jobs-ttl" }],
    });
  });
});

describe("buildZodSchema", () => {
  test("excludes system fields", () => {
    const fields = {
      input: {
        type: "string",
        optional: false,
        repeated: true,
        description: "query",
      },
      filter: {
        type: "message",
        optional: true,
        repeated: false,
        description: null,
      },
      anthropic_api_key: {
        type: "string",
        optional: true,
        repeated: false,
        description: null,
      },
      resource_id: {
        type: "string",
        optional: true,
        repeated: false,
        description: null,
      },
    };
    const schema = buildZodSchema(fields);
    assert.ok(!schema.filter);
    assert.ok(!schema.anthropic_api_key);
    assert.ok(!schema.resource_id);
  });

  test("excludes message-type fields", () => {
    const fields = {
      name: {
        type: "string",
        optional: false,
        repeated: false,
        description: "a name",
      },
      nested: {
        type: "message",
        optional: false,
        repeated: false,
        description: null,
      },
    };
    const schema = buildZodSchema(fields);
    assert.ok(schema.name);
    assert.ok(!schema.nested);
  });

  test("includes user-facing fields", () => {
    const fields = {
      discipline: {
        type: "string",
        optional: false,
        repeated: false,
        description: "Discipline",
      },
      level: {
        type: "string",
        optional: false,
        repeated: false,
        description: "Level",
      },
      track: {
        type: "string",
        optional: true,
        repeated: false,
        description: "Track",
      },
    };
    const schema = buildZodSchema(fields);
    assert.ok(schema.discipline);
    assert.ok(schema.level);
    assert.ok(schema.track);
  });

  test("repeated field gets union type", () => {
    const fields = {
      input: {
        type: "string",
        optional: false,
        repeated: true,
        description: "query",
      },
    };
    const schema = buildZodSchema(fields);
    assert.ok(schema.input);
    // The Zod type is wrapped in optional + union; verify it exists
    assert.ok(schema.input._def);
  });
});
