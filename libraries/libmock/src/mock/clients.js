import { spy } from "./spy.js";
import { common } from "@forwardimpact/libtype";

/**
 * Creates a mock memory client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock memory client
 */
export function createMockMemoryClient(overrides = {}) {
  return {
    GetWindow: spy(() =>
      Promise.resolve({
        messages: [{ role: "system", content: "You are an assistant" }],
        tools: [],
      }),
    ),
    AppendMemory: spy(() => Promise.resolve({ accepted: "test-id" })),
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
    CreateCompletions: spy(() =>
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
    CreateEmbeddings: spy(() =>
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
    ProcessUnary: spy(() =>
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
    ProcessStream: spy(),
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
    RecordSpan: spy(() => Promise.resolve()),
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
    SearchContent: spy(() =>
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
    QueryByPattern: spy(() =>
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
    CallTool: spy(() =>
      Promise.resolve({
        content: "Tool result",
      }),
    ),
    ...overrides,
  };
}
