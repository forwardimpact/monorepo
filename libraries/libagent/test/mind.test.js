import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import {
  createMockConfig,
  createMockServiceCallbacks,
  createMockResourceIndex,
} from "@forwardimpact/libharness";

import { AgentMind } from "../mind.js";
import { AgentHands } from "../hands.js";
import { common } from "@forwardimpact/libtype";

describe("AgentMind", () => {
  let mockConfig;
  let mockServiceCallbacks;
  let mockResourceIndex;
  let mockAgentHands;

  beforeEach(() => {
    mockConfig = createMockConfig("agent", {
      budget: 1000,
      agent: "software_dev_expert",
      temperature: 0.7,
      threshold: 0.5,
      limit: 10,
    });

    mockServiceCallbacks = createMockServiceCallbacks();

    mockResourceIndex = createMockResourceIndex();
    mockResourceIndex.setupDefaults({ agentId: "test-agent" });

    mockAgentHands = new AgentHands(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
    );
  });

  test("constructor validates required parameters", () => {
    assert.throws(() => new AgentMind(), /config is required/);

    assert.throws(() => new AgentMind(mockConfig), /callbacks is required/);

    assert.throws(
      () => new AgentMind(mockConfig, mockServiceCallbacks),
      /resourceIndex is required/,
    );

    assert.throws(
      () => new AgentMind(mockConfig, mockServiceCallbacks, mockResourceIndex),
      /agentHands is required/,
    );
  });

  test("constructor creates instance with valid parameters", () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    assert.ok(agentMind instanceof AgentMind);
  });

  test("setupConversation creates new conversation when none exists", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    // Mock resourceIndex.get to return empty for conversation lookup
    mockResourceIndex.get = async () => [];

    const request = {
      messages: [common.Message.fromObject({ role: "user", content: "Hello" })],
    };

    const result = await agentMind.setupConversation(request);

    assert.ok(result.conversation);
    assert.ok(result.conversation.id);
    assert.ok(result.message);
    assert.strictEqual(result.message.role, "user");
  });

  test("setupConversation uses existing conversation when resource_id provided", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    const existingConversation = common.Conversation.fromObject({
      id: { name: "existing-conv", type: "common.Conversation" },
      agent_id: "common.Agent.test",
    });

    // Mock resourceIndex.get to return existing conversation
    mockResourceIndex.get = async (ids) => {
      if (ids.includes("existing-conv")) {
        return [existingConversation];
      }
      return [];
    };

    const request = {
      resource_id: "existing-conv",
      messages: [common.Message.fromObject({ role: "user", content: "Hello" })],
    };

    const result = await agentMind.setupConversation(request);

    assert.ok(result.conversation);
    assert.strictEqual(result.conversation.id.name, "existing-conv");
  });

  test("setupConversation throws error when no user message found", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    mockResourceIndex.get = async () => [];

    const request = {
      messages: [
        common.Message.fromObject({ role: "assistant", content: "Hello" }),
      ],
    };

    await assert.rejects(
      () => agentMind.setupConversation(request),
      /No user message found in request/,
    );
  });

  test("process handles complete workflow", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    // Track calls to verify workflow
    let memoryAppendCalls = 0;
    let executeToolLoopCalled = false;

    mockServiceCallbacks.memory.append = async () => {
      memoryAppendCalls++;
      return {};
    };

    // Mock setupConversation to return valid data
    agentMind.setupConversation = async () => ({
      conversation: common.Conversation.fromObject({
        id: {
          name: "test-conv",
          type: "common.Conversation",
        },
        agent_id: "common.Agent.test",
      }),
      message: common.Message.fromObject({
        id: {
          name: "test-msg",
          type: "common.Message",
        },
        role: "user",
        content: "Hello",
      }),
    });

    // Mock AgentHands executeToolLoop
    mockAgentHands.executeToolLoop = async () => {
      executeToolLoopCalled = true;
    };

    const request = {
      llm_token: "test-token",
      messages: [{ role: "user", content: "Hello" }],
    };

    // process returns void - verify it completes without error
    await agentMind.process(request);

    // Verify memory was appended (for the user message)
    assert.ok(memoryAppendCalls >= 1, "Memory should be appended");

    // Verify tool loop was executed
    assert.ok(executeToolLoopCalled, "executeToolLoop should be called");
  });

  test("process passes conversationId to executeToolLoop", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    let capturedConversationId = null;

    agentMind.setupConversation = async () => ({
      conversation: common.Conversation.fromObject({
        id: {
          name: "captured-conv-id",
          type: "common.Conversation",
        },
        agent_id: "common.Agent.test",
      }),
      message: common.Message.fromObject({
        id: {
          name: "test-msg",
          type: "common.Message",
        },
        role: "user",
        content: "Hello",
      }),
    });

    mockAgentHands.executeToolLoop = async (conversationId) => {
      capturedConversationId = conversationId;
    };

    const request = {
      llm_token: "test-token",
      messages: [{ role: "user", content: "Hello" }],
    };

    await agentMind.process(request);

    assert.strictEqual(
      capturedConversationId,
      "common.Conversation.captured-conv-id",
      "Should pass conversationId to executeToolLoop",
    );
  });

  test("process streams progress via onProgress callback", async () => {
    const agentMind = new AgentMind(
      mockConfig,
      mockServiceCallbacks,
      mockResourceIndex,
      mockAgentHands,
    );

    const progressMessages = [];

    agentMind.setupConversation = async () => ({
      conversation: common.Conversation.fromObject({
        id: {
          name: "test-conv",
          type: "common.Conversation",
        },
        agent_id: "common.Agent.test",
      }),
      message: common.Message.fromObject({
        id: {
          name: "test-msg",
          type: "common.Message",
        },
        role: "user",
        content: "Hello",
      }),
    });

    // Mock executeToolLoop to call streamToClient which triggers onProgress
    mockAgentHands.executeToolLoop = async (
      _conversationId,
      callbacks,
      _options,
    ) => {
      // Simulate saving a non-tool message that should trigger onProgress
      const msg = common.Message.fromObject({
        id: { name: "response", type: "common.Message" },
        role: "assistant",
        content: "Response",
      });
      msg.withIdentifier = () => {};
      await callbacks.streamToClient(msg);
    };

    const request = {
      llm_token: "test-token",
      messages: [{ role: "user", content: "Hello" }],
    };

    const onProgress = (msg) => {
      progressMessages.push(msg);
    };

    await agentMind.process(request, onProgress);

    // onProgress should be called for non-tool messages
    assert.ok(
      progressMessages.length >= 1,
      "Should call onProgress for messages",
    );
  });
});
