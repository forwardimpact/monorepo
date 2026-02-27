/**
 * Creates a mock configuration object
 * @param {string} name - Service/extension name
 * @param {object} overrides - Properties to override
 * @returns {object} Mock config
 */
export function createMockConfig(name = "test-service", overrides = {}) {
  return {
    name,
    namespace: "test",
    host: "0.0.0.0",
    port: 3000,
    max_tokens: 4096,
    ...overrides,
  };
}

/**
 * Creates a mock service config with common service properties
 * @param {string} name - Service name
 * @param {object} overrides - Properties to override
 * @returns {object} Mock service config
 */
export function createMockServiceConfig(name, overrides = {}) {
  return createMockConfig(name, {
    budget: 1000,
    threshold: 0.3,
    limit: 10,
    ...overrides,
  });
}

/**
 * Creates a mock extension config
 * @param {string} name - Extension name
 * @param {object} overrides - Properties to override
 * @returns {object} Mock extension config
 */
export function createMockExtensionConfig(name, overrides = {}) {
  return createMockConfig(name, {
    secret: "test-secret",
    llmToken: async () => "test-llm-token",
    ...overrides,
  });
}
