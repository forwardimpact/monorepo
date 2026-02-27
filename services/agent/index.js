import { generateUUID } from "@forwardimpact/libsecret";
import { services } from "@forwardimpact/librpc";
// eslint-disable-next-line no-unused-vars -- agent used in JSDoc type annotations
import { agent, common, tool } from "@forwardimpact/libtype";

const { AgentBase } = services;

/**
 * Main orchestration service for agent requests
 */
export class AgentService extends AgentBase {
  #mind;
  #resourceIndex;

  /**
   * Creates a new Agent service instance
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config - Service configuration object
   * @param {import("@forwardimpact/libagent").AgentMind} agentMind - AgentMind instance for request orchestration
   * @param {import("@forwardimpact/libresource").ResourceIndex} resourceIndex - Resource index for data access
   */
  constructor(config, agentMind, resourceIndex) {
    super(config);
    if (!agentMind) throw new Error("agentMind is required");
    if (!resourceIndex) throw new Error("resourceIndex is required");

    this.#mind = agentMind;
    this.#resourceIndex = resourceIndex;
  }

  /**
   * @inheritdoc
   * @param {agent.AgentRequest} req - The agent request
   * @param {(response: agent.AgentResponse) => void} write - Callback to write response messages
   */
  async ProcessStream(req, write) {
    const onProgress = (resource_id, messages) => {
      write({ resource_id, messages });
    };

    await this.#mind.process(req, onProgress);
  }

  /**
   * @inheritdoc
   * @param {agent.AgentRequest} req - The agent request
   * @returns {Promise<agent.AgentResponse>} The agent response
   */
  async ProcessUnary(req) {
    /** @type {agent.AgentResponse} */
    let finalResponse;

    const onProgress = (resource_id, messages) => {
      finalResponse = { resource_id, messages };
    };

    await this.#mind.process(req, onProgress);

    return finalResponse;
  }

  /**
   * List available sub-agents that can be invoked for delegation
   * @returns {Promise<tool.ToolCallResult>} Tool result with agent list as content
   */
  async ListSubAgents() {
    const actor = "common.System.root";
    const identifiers = await this.#resourceIndex.findByPrefix("common.Agent");
    const agents = await this.#resourceIndex.get(
      identifiers.map(String),
      actor,
    );
    const inferAgents = agents.filter((a) => a.infer === true);
    const agentList = inferAgents.map((a) => ({
      agent_id: String(a.id),
      description: a.description || "",
    }));
    return tool.ToolCallResult.fromObject({
      content: JSON.stringify(agentList),
    });
  }

  /**
   * Run a sub-agent with a specific task in an isolated child conversation
   * @param {agent.RunSubAgentRequest} req - Request with agent_id and prompt
   * @returns {Promise<tool.ToolCallResult>} Tool result with sub-agent response content
   */
  async RunSubAgent(req) {
    const actor = "common.System.root";

    // Normalize agent_id to fully qualified identifier if needed
    let agentId = req.agent_id;
    if (!agentId.startsWith("common.Agent.")) {
      agentId = `common.Agent.${agentId}`;
    }

    // Validate target agent has infer=true
    const [targetAgent] = await this.#resourceIndex.get([agentId], actor);
    if (!targetAgent?.infer) {
      throw new Error(
        `Agent ${agentId} is not available for sub-agent invocation`,
      );
    }

    // Create child conversation with parent reference
    const childConversation = common.Conversation.fromObject({
      id: { name: generateUUID() },
      agent_id: agentId,
    });
    // Set the parent conversation
    childConversation.withIdentifier(req.resource_id);
    await this.#resourceIndex.put(childConversation);

    // Execute via AgentMind
    const processReq = {
      resource_id: String(childConversation.id),
      messages: [{ role: "user", content: req.prompt }],
      llm_token: req.llm_token,
    };

    let result;
    await this.#mind.process(processReq, (resource_id, messages) => {
      result = { resource_id, messages };
    });

    // Extract content from final assistant message
    const assistantMessages = (result?.messages || []).filter(
      (m) => m.role === "assistant" && m.content,
    );
    const content = assistantMessages.map((m) => m.content).join("\n");

    return tool.ToolCallResult.fromObject({ content });
  }

  /**
   * List valid handoff labels available from the current agent
   * @param {agent.ListHandoffsRequest} req - Request with resource_id
   * @returns {Promise<tool.ToolCallResult>} Tool result with handoff labels as content
   */
  async ListHandoffs(req) {
    const actor = "common.System.root";

    // Load conversation to get current agent
    const [conversation] = await this.#resourceIndex.get(
      [req.resource_id],
      actor,
    );
    if (!conversation) {
      throw new Error(`Conversation not found: ${req.resource_id}`);
    }

    // Load agent to get handoff labels
    const [currentAgent] = await this.#resourceIndex.get(
      [conversation.agent_id],
      actor,
    );
    if (!currentAgent) {
      throw new Error(`Agent not found: ${conversation.agent_id}`);
    }

    const labels = (currentAgent.handoffs || []).map((h) => h.label);
    return tool.ToolCallResult.fromObject({ content: JSON.stringify(labels) });
  }

  /**
   * Hand off conversation control to another agent
   * @param {agent.RunHandoffRequest} req - Request with resource_id and label
   * @returns {Promise<tool.ToolCallResult>} Tool result with handoff details as content
   */
  async RunHandoff(req) {
    const actor = "common.System.root";

    // Load conversation
    const [conversation] = await this.#resourceIndex.get(
      [req.resource_id],
      actor,
    );
    if (!conversation) {
      throw new Error(`Conversation not found: ${req.resource_id}`);
    }

    // Load current agent to find handoff by label
    const [currentAgent] = await this.#resourceIndex.get(
      [conversation.agent_id],
      actor,
    );
    const handoff = (currentAgent?.handoffs || []).find(
      (h) => h.label === req.label,
    );
    if (!handoff) {
      throw new Error(`Invalid handoff label: ${req.label}`);
    }

    // Update conversation with new agent
    const newAgentId = `common.Agent.${handoff.agent}`;
    conversation.agent_id = newAgentId;
    await this.#resourceIndex.put(conversation);

    const result = {
      resource_id: req.resource_id,
      agent_id: conversation.agent_id,
      prompt: handoff.prompt,
    };
    return tool.ToolCallResult.fromObject({ content: JSON.stringify(result) });
  }
}
