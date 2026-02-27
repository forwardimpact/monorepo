import { test, describe } from "node:test";

import { AgentMind } from "../mind.js";
import { common, resource } from "@forwardimpact/libtype";
import { createPerformanceTest } from "@forwardimpact/libperf";

describe("LibAgent Performance Tests", () => {
  /**
   * Generate mock tool identifiers
   * @param {number} count - Number of tools to generate
   * @returns {object[]} Mock tool identifiers
   */
  function generateMockTools(count) {
    const tools = [];

    for (let i = 0; i < count; i++) {
      const identifier = resource.Identifier.fromObject({
        name: `tool-${i}`,
        type: "tool.ToolFunction",
        tokens: 150,
      });
      tools.push(identifier);
    }

    return tools;
  }

  /**
   * Create mock dependencies for AgentMind
   * @param {number} toolCount - Number of tools
   * @returns {object} Mock dependencies
   */
  function createDependencies(toolCount) {
    const tools = generateMockTools(toolCount);

    const agent = common.Agent.fromObject({
      instructions: "You are a helpful assistant for testing",
    });
    agent.withIdentifier();

    const config = {
      budget: {
        tokens: 100000,
        allocation: {
          tools: 0.2,
          history: 0.6,
          results: 0.2,
        },
      },
      assistant: "test-assistant",
      permanent_tools: [],
      temperature: 0.7,
      threshold: 0.3,
      limit: 10,
    };

    const mockCallbacks = {
      memory: {
        append: () => Promise.resolve({}),
        get: () =>
          Promise.resolve({
            tools: [],
            context: [],
            history: [],
          }),
      },
      llm: {
        createCompletions: () =>
          Promise.resolve({
            choices: [
              {
                message: common.Message.fromObject({
                  role: "assistant",
                  content: "Response",
                }),
              },
            ],
          }),
      },
      tool: {
        call: () =>
          Promise.resolve(
            common.Message.fromObject({
              role: "tool",
              content: "Tool result",
            }),
          ),
      },
    };

    const mockResourceIndex = {
      get: () => Promise.resolve([]),
      put: () => Promise.resolve(),
    };

    return {
      config,
      mockCallbacks,
      mockResourceIndex,
      agent,
      tools,
    };
  }

  test(
    "AgentMind.setupConversation performance",
    createPerformanceTest({
      count: 100,
      setupFn: () => {
        const deps = createDependencies(10);
        const mockHands = {
          executeToolLoop: () => Promise.resolve({}),
        };
        const agentMind = new AgentMind(
          deps.config,
          deps.mockCallbacks,
          deps.mockResourceIndex,
          mockHands,
        );

        const req = {
          messages: [
            common.Message.fromObject({
              role: "user",
              content: "Test message",
            }),
          ],
        };

        return { agentMind, req };
      },
      testFn: ({ agentMind, req }) => agentMind.setupConversation(req),
      constraints: {
        maxDuration: 5,
        maxMemory: 500,
      },
    }),
  );

  test(
    "AgentMind.setupConversation memory stability",
    createPerformanceTest({
      count: 1000,
      setupFn: (iterations) => {
        const deps = createDependencies(10);
        const mockHands = {
          executeToolLoop: () => Promise.resolve({}),
        };
        const mind = new AgentMind(
          deps.config,
          deps.mockCallbacks,
          deps.mockResourceIndex,
          mockHands,
        );
        const req = {
          messages: [
            common.Message.fromObject({
              role: "user",
              content: "Test message",
            }),
          ],
        };
        return { mind, req, iterations };
      },
      testFn: async ({ mind, req, iterations }) => {
        for (let i = 0; i < iterations; i++) {
          await mind.setupConversation(req);
        }
      },
      constraints: {
        maxMemory: 5000,
      },
    }),
  );
});
