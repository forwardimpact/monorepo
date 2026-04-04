import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { AgentHands } from "../hands.js";

describe("AgentHands - Tool Loop", () => {
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

  test("executeToolLoop passes resource_id to LLM and handles completion without tool calls", async () => {
    let capturedRequest = null;
    const mockCallbacksWithCapture = {
      ...mockServiceCallbacks,
      llm: {
        createCompletions: async (req) => {
          capturedRequest = req;
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Test response",
                  tool_calls: [],
                },
              },
            ],
          };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithCapture,
      mockResourceIndex,
    );

    const savedMessages = [];
    const callbacks = {
      saveToServer: async (msgs) => {
        savedMessages.push(...msgs);
      },
      streamToClient: () => {},
    };

    await agentHands.executeToolLoop("test-conversation-id", callbacks, {
      llmToken: "test-token",
      model: "gpt-4o",
    });

    // Should save the final assistant message
    assert.strictEqual(savedMessages.length, 1);
    assert.strictEqual(savedMessages[0].role, "assistant");

    // Verify resource_id was passed to LLM service
    assert.strictEqual(capturedRequest.resource_id, "test-conversation-id");
    assert.strictEqual(capturedRequest.llm_token, "test-token");
  });

  test("executeToolLoop handles completion with tool calls", async () => {
    // Mock LLM to return tool calls on first iteration, then stop
    let iteration = 0;
    const mockCallbacksWithIterations = {
      ...mockServiceCallbacks,
      llm: {
        createCompletions: async () => {
          iteration++;
          if (iteration === 1) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: [{ id: "call1", function: { name: "search" } }],
                  },
                },
              ],
            };
          }
          return {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "Final response",
                  tool_calls: [],
                },
              },
            ],
          };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithIterations,
      mockResourceIndex,
    );

    const savedMessages = [];
    const callbacks = {
      saveToServer: async (msgs) => {
        savedMessages.push(...msgs);
      },
      streamToClient: () => {},
    };

    await agentHands.executeToolLoop("test-conversation", callbacks, {
      llmToken: "test-token",
      model: "gpt-4o",
    });

    // Should save: assistant with tool_calls, tool result, final assistant
    assert.strictEqual(savedMessages.length, 3);
    assert.strictEqual(savedMessages[0].role, "assistant");
    assert.strictEqual(savedMessages[1].role, "tool");
    assert.strictEqual(savedMessages[2].role, "assistant");
  });

  test("executeToolLoop continues when finish_reason is 'length' (truncated response)", async () => {
    let iteration = 0;
    const mockCallbacksWithTruncation = {
      ...mockServiceCallbacks,
      llm: {
        createCompletions: async () => {
          iteration++;
          if (iteration === 1) {
            // First response is truncated
            return {
              choices: [
                {
                  finish_reason: "length",
                  message: {
                    role: "assistant",
                    content: "Partial response that was truncated...",
                    tool_calls: [],
                  },
                },
              ],
            };
          }
          // Second response completes normally
          return {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "Complete response",
                  tool_calls: [],
                },
              },
            ],
          };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithTruncation,
      mockResourceIndex,
    );

    const savedMessages = [];
    const callbacks = {
      saveToServer: async (msgs) => {
        savedMessages.push(...msgs);
      },
      streamToClient: () => {},
    };

    await agentHands.executeToolLoop("test-conversation", callbacks, {
      llmToken: "test-token",
      model: "gpt-4o",
    });

    // Should save both messages: truncated one and final one
    assert.strictEqual(savedMessages.length, 2);
    assert.strictEqual(
      savedMessages[0].content,
      "Partial response that was truncated...",
    );
    assert.strictEqual(savedMessages[1].content, "Complete response");
  });

  test("executeToolLoop continues when finish_reason is 'tool_calls' but tool_calls array is empty", async () => {
    let iteration = 0;
    const mockCallbacksWithEmptyToolCalls = {
      ...mockServiceCallbacks,
      llm: {
        createCompletions: async () => {
          iteration++;
          if (iteration === 1) {
            // First response says tool_calls but array is empty (API error)
            return {
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: "I will call a tool",
                    tool_calls: [],
                  },
                },
              ],
            };
          }
          // LLM tries again and completes normally
          return {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "Final response",
                  tool_calls: [],
                },
              },
            ],
          };
        },
      },
    };

    const agentHands = new AgentHands(
      mockCallbacksWithEmptyToolCalls,
      mockResourceIndex,
    );

    const savedMessages = [];
    const callbacks = {
      saveToServer: async (msgs) => {
        savedMessages.push(...msgs);
      },
      streamToClient: () => {},
    };

    await agentHands.executeToolLoop("test-conversation", callbacks, {
      llmToken: "test-token",
      model: "gpt-4o",
    });

    // Should save both messages
    assert.strictEqual(savedMessages.length, 2);
    assert.strictEqual(savedMessages[0].content, "I will call a tool");
    assert.strictEqual(savedMessages[1].content, "Final response");
  });
});
