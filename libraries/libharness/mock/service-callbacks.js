/**
 * Creates a mock service callbacks object for agent testing
 * @param {object} overrides - Method overrides per service
 * @returns {object} Service callbacks object
 */
export function createMockServiceCallbacks(overrides = {}) {
  return {
    memory: {
      append: async () => ({}),
      get: async () => ({
        messages: [{ role: "system", content: "You are an assistant" }],
        tools: [],
      }),
      ...overrides.memory,
    },
    llm: {
      createCompletions: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Test response",
              tool_calls: [],
            },
          },
        ],
      }),
      ...overrides.llm,
    },
    tool: {
      call: async () => ({
        role: "tool",
        content: "Tool result",
      }),
      ...overrides.tool,
    },
    ...overrides,
  };
}
