import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { AgentHands } from "../hands.js";

describe("AgentHands - Tool Calls", () => {
  let mockServiceCallbacks;
  let mockResourceIndex;

  beforeEach(() => {
    mockServiceCallbacks = {
      memory: {
        append: async () => ({}),
      },
      llm: {
        createCompletions: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Test response",
                tool_calls: [],
                id: { name: "test-response" },
                withIdentifier: () => {},
              },
            },
          ],
        }),
      },
      tool: {
        call: async () => ({
          role: "tool",
          content: "Tool result",
        }),
      },
    };

    mockResourceIndex = {
      get: async () => [
        {
          id: { name: "test-resource" },
          content: "Test content",
        },
      ],
      put: () => {},
    };
  });

  test("constructor validates required parameters", () => {
    assert.throws(() => new AgentHands(), /callbacks is required/);

    assert.throws(
      () => new AgentHands(mockServiceCallbacks),
      /resourceIndex is required/,
    );
  });

  test("constructor creates instance with valid parameters", () => {
    const agentHands = new AgentHands(mockServiceCallbacks, mockResourceIndex);
    assert.ok(agentHands instanceof AgentHands);
  });

  test("executeToolCall handles successful tool execution", async () => {
    const agentHands = new AgentHands(mockServiceCallbacks, mockResourceIndex);

    const toolCall = {
      id: "test-call",
      function: { name: "search" },
    };

    const { message } = await agentHands.executeToolCall(
      toolCall,
      "test-token",
      "test-resource",
    );

    assert.ok(message);
    assert.strictEqual(message.role, "tool");
    assert.strictEqual(message.tool_call_id, "test-call");
  });

  test("executeToolCall handles tool execution errors", async () => {
    const mockCallbacksWithError = {
      ...mockServiceCallbacks,
      tool: {
        call: async () => {
          throw new Error("Tool execution failed");
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithError,
      mockResourceIndex,
    );

    const toolCall = {
      id: "test-call",
      function: { name: "search" },
    };

    const { message } = await agentHands.executeToolCall(
      toolCall,
      "test-token",
      "test-resource",
    );

    assert.ok(message);
    assert.strictEqual(message.role, "tool");
    const content = JSON.parse(message.content);
    assert.strictEqual(content.error.message, "Tool execution failed");
  });

  test("processToolCalls processes tool calls and returns results", async () => {
    const agentHands = new AgentHands(mockServiceCallbacks, mockResourceIndex);

    const toolCalls = [
      { id: "call1", function: { name: "search" } },
      { id: "call2", function: { name: "analyze" } },
    ];

    const { messages } = await agentHands.processToolCalls(toolCalls, {
      llmToken: "test-token",
    });

    // Should return 2 tool result messages
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].role, "tool");
    assert.strictEqual(messages[1].role, "tool");
  });

  test("processToolCalls executes calls in parallel", async () => {
    const executionOrder = [];
    const completionOrder = [];

    const mockCallbacksWithTiming = {
      ...mockServiceCallbacks,
      tool: {
        call: async (toolCall) => {
          executionOrder.push(toolCall.id);
          // Stagger completion times - call1 takes longer
          const delay = toolCall.id === "call1" ? 50 : 10;
          await new Promise((resolve) => setTimeout(resolve, delay));
          completionOrder.push(toolCall.id);
          return { content: `Result for ${toolCall.id}` };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithTiming,
      mockResourceIndex,
    );

    const toolCalls = [
      { id: "call1", function: { name: "search" } },
      { id: "call2", function: { name: "analyze" } },
    ];

    await agentHands.processToolCalls(toolCalls, {
      llmToken: "test-token",
    });

    // Parallel execution: both calls start immediately
    assert.deepStrictEqual(executionOrder, ["call1", "call2"]);
    // Parallel execution: call2 completes before call1 (shorter delay)
    assert.deepStrictEqual(completionOrder, ["call2", "call1"]);
  });

  test("processToolCalls returns results in order despite different completion times", async () => {
    const completionTimes = {};

    const mockCallbacksWithTiming = {
      ...mockServiceCallbacks,
      tool: {
        call: async (toolCall) => {
          // call2 completes first (10ms), call1 second (30ms), call3 last (50ms)
          const delays = { call1: 30, call2: 10, call3: 50 };
          await new Promise((resolve) =>
            setTimeout(resolve, delays[toolCall.id]),
          );
          completionTimes[toolCall.id] = Date.now();
          return { content: `Result for ${toolCall.id}` };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithTiming,
      mockResourceIndex,
    );

    const toolCalls = [
      { id: "call1", function: { name: "search" } },
      { id: "call2", function: { name: "analyze" } },
      { id: "call3", function: { name: "summarize" } },
    ];

    const { messages } = await agentHands.processToolCalls(toolCalls, {
      llmToken: "test-token",
    });

    // Messages returned in original order despite different completion times
    assert.strictEqual(messages[0].tool_call_id, "call1");
    assert.strictEqual(messages[1].tool_call_id, "call2");
    assert.strictEqual(messages[2].tool_call_id, "call3");

    // Verify call2 actually completed before call1
    assert.ok(
      completionTimes.call2 < completionTimes.call1,
      "call2 should complete before call1",
    );
  });

  test("processToolCalls handles errors without affecting subsequent calls", async () => {
    const mockCallbacksWithError = {
      ...mockServiceCallbacks,
      tool: {
        call: async (toolCall) => {
          if (toolCall.id === "call2") {
            throw new Error("Tool call2 failed");
          }
          return { content: `Result for ${toolCall.id}` };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithError,
      mockResourceIndex,
    );

    const toolCalls = [
      { id: "call1", function: { name: "search" } },
      { id: "call2", function: { name: "analyze" } },
      { id: "call3", function: { name: "summarize" } },
    ];

    const { messages } = await agentHands.processToolCalls(toolCalls, {
      llmToken: "test-token",
    });

    // All 3 messages should be returned (including the error)
    assert.strictEqual(messages.length, 3);

    // call1 should succeed
    assert.strictEqual(messages[0].content, "Result for call1");

    // call2 should have error
    const call2Content = JSON.parse(messages[1].content);
    assert.ok(call2Content.error);
    assert.strictEqual(call2Content.error.message, "Tool call2 failed");

    // call3 should succeed
    assert.strictEqual(messages[2].content, "Result for call3");
  });

  test("executeToolCall converts Identifier objects to strings for resource lookup", async () => {
    // Track what keys are passed to resourceIndex.get()
    let capturedKeys = null;
    const mockResourceIndexWithCapture = {
      get: async (keys) => {
        capturedKeys = keys;
        return [{ content: "Loaded resource content" }];
      },
    };

    // Mock tool.call to return identifiers as objects (like GraphService does)
    const mockCallbacksWithIdentifiers = {
      ...mockServiceCallbacks,
      tool: {
        call: async () => ({
          // Simulate graph service returning Identifier objects
          identifiers: [
            {
              type: "common.Message",
              name: "abc123",
              parent: "",
              subjects: ["https://example.org/entity1"],
              toString() {
                return "common.Message.abc123";
              },
            },
            {
              type: "common.Message",
              name: "def456",
              parent: "parent/path",
              subjects: ["https://example.org/entity2"],
              toString() {
                return "parent/path/common.Message.def456";
              },
            },
          ],
        }),
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithIdentifiers,
      mockResourceIndexWithCapture,
    );

    const toolCall = {
      id: "test-call",
      function: { name: "query_by_pattern" },
    };

    const { message } = await agentHands.executeToolCall(
      toolCall,
      "test-token",
      "test-resource",
    );

    // Verify resourceIndex.get was called with string keys, not objects
    assert.ok(capturedKeys, "resourceIndex.get should have been called");
    assert.strictEqual(capturedKeys.length, 2);
    assert.strictEqual(capturedKeys[0], "common.Message.abc123");
    assert.strictEqual(capturedKeys[1], "parent/path/common.Message.def456");

    // Verify subjects were extracted from identifiers
    assert.ok(message.id?.subjects);
    assert.deepStrictEqual(message.id.subjects, [
      "https://example.org/entity1",
      "https://example.org/entity2",
    ]);

    // Verify content was loaded
    assert.strictEqual(message.content, "Loaded resource content");
  });
});
