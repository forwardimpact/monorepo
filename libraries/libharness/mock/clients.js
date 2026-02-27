import { mock } from "node:test";
import { common } from "@forwardimpact/libtype";

/**
 * Creates a mock memory client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock memory client
 */
export function createMockMemoryClient(overrides = {}) {
  return {
    GetWindow: mock.fn(() =>
      Promise.resolve({
        messages: [{ role: "system", content: "You are an assistant" }],
        tools: [],
      }),
    ),
    AppendMemory: mock.fn(() => Promise.resolve({ accepted: "test-id" })),
    ...overrides,
  };
}

/**
 * Creates a mock LLM client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock LLM client
 */
export function createMockLlmClient(overrides = {}) {
  return {
    CreateCompletions: mock.fn(() =>
      Promise.resolve({
        id: "test-completion",
        choices: [
          {
            message: common.Message.fromObject({
              role: "assistant",
              content: "Test response",
            }),
          },
        ],
        usage: { total_tokens: 100 },
      }),
    ),
    CreateEmbeddings: mock.fn(() =>
      Promise.resolve({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock agent client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock agent client
 */
export function createMockAgentClient(overrides = {}) {
  return {
    ProcessUnary: mock.fn(() =>
      Promise.resolve({
        resource_id: "test-conversation",
        choices: [
          {
            message: common.Message.fromObject({
              role: "assistant",
              content: "Test response",
            }),
          },
        ],
      }),
    ),
    ProcessStream: mock.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock trace client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock trace client
 */
export function createMockTraceClient(overrides = {}) {
  return {
    RecordSpan: mock.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/**
 * Creates a mock vector client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock vector client
 */
export function createMockVectorClient(overrides = {}) {
  return {
    SearchContent: mock.fn(() =>
      Promise.resolve({
        identifiers: [],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock graph client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock graph client
 */
export function createMockGraphClient(overrides = {}) {
  return {
    QueryByPattern: mock.fn(() =>
      Promise.resolve({
        identifiers: [],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock tool client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock tool client
 */
export function createMockToolClient(overrides = {}) {
  return {
    CallTool: mock.fn(() =>
      Promise.resolve({
        content: "Tool result",
      }),
    ),
    ...overrides,
  };
}
