import { common, tool } from "@forwardimpact/libtype";

/**
 * Creates a mock resource index with common test data
 * @param {object} options - Setup options
 * @returns {object} Mock resource index
 */
export function createMockResourceIndex(options = {}) {
  const resources = new Map();

  const index = {
    resources,

    async get(identifiers, _actor) {
      if (!identifiers || identifiers.length === 0) return [];
      return identifiers
        .map((id) => {
          const key = typeof id === "string" ? id : id.toString?.() || id.name;
          return resources.get(key);
        })
        .filter(Boolean);
    },

    put(resource) {
      const key = resource.id?.toString?.() || resource.id?.name;
      if (key) resources.set(key, resource);
    },

    async has(id) {
      const key = typeof id === "string" ? id : id.toString?.();
      return resources.has(key);
    },

    /**
     * Sets up default test resources
     * @param {object} setupOptions - Setup options
     * @param {string[]} [setupOptions.tools] - Tool names for agent
     * @param {string} [setupOptions.conversationId] - Conversation ID
     * @param {string} [setupOptions.agentId] - Agent ID
     */
    setupDefaults(setupOptions = {}) {
      const {
        tools = [],
        conversationId = "test-conversation",
        agentId = "test-agent",
      } = setupOptions;

      resources.set(
        conversationId,
        common.Conversation.fromObject({
          id: { name: conversationId },
          agent_id: `common.Agent.${agentId}`,
        }),
      );

      resources.set(
        `common.Agent.${agentId}`,
        common.Agent.fromObject({
          id: { name: agentId, tokens: 50 },
          tools,
          content: "You are a test agent.",
        }),
      );

      for (const name of tools) {
        resources.set(
          `tool.ToolFunction.${name}`,
          tool.ToolFunction.fromObject({
            id: { name, tokens: 20 },
            name,
            description: `${name} tool`,
          }),
        );
      }
    },

    /**
     * Adds a message resource
     * @param {object} msg - Message to add
     */
    addMessage(msg) {
      const id =
        msg.id?.type && msg.id?.toString
          ? msg.id.toString()
          : msg.id?.name || String(msg.id);
      resources.set(id, msg);
    },

    /**
     * Find resources by prefix
     * @param {string} prefix - Prefix to search for
     * @returns {Promise<string[]>} List of matching keys
     */
    async findByPrefix(prefix) {
      const keys = [];
      for (const key of resources.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    },
  };

  if (options.tools || options.conversationId || options.agentId) {
    index.setupDefaults(options);
  }

  return index;
}
