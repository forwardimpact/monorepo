/**
 * Mock service utilities for testing
 */

/**
 * Creates a mock vector service
 * @param {object} overrides - Properties to override in the mock
 * @returns {object} Mock vector service
 */
export function mockVectorService(overrides = {}) {
  return {
    QueryItems: async (request, callback) => {
      callback(null, { results: [], total: 0 });
    },
    close: () => {},
    ...overrides,
  };
}

/**
 * Creates a mock history service
 * @param {object} overrides - Properties to override in the mock
 * @returns {object} Mock history service
 */
export function mockHistoryService(overrides = {}) {
  return {
    GetHistory: async (request, callback) => {
      callback(null, { messages: [] });
    },
    UpdateHistory: async (request, callback) => {
      callback(null, {});
    },
    close: () => {},
    ...overrides,
  };
}

/**
 * Creates a mock LLM service
 * @param {object} overrides - Properties to override in the mock
 * @returns {object} Mock LLM service
 */
export function mockLlmService(overrides = {}) {
  return {
    CreateCompletions: async (request, callback) => {
      callback(null, {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Test response" },
            finish_reason: "stop",
          },
        ],
      });
    },
    CreateEmbeddings: async (request, callback) => {
      callback(null, {
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      });
    },
    close: () => {},
    ...overrides,
  };
}

/**
 * Creates a mock text service
 * @param {object} overrides - Properties to override in the mock
 * @returns {object} Mock text service
 */
export function mockTextService(overrides = {}) {
  return {
    GetChunks: async (request, callback) => {
      callback(null, { chunks: {} });
    },
    close: () => {},
    ...overrides,
  };
}
