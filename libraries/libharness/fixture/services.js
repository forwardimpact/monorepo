/**
 * Test fixture utilities for creating dynamic test data
 */

/**
 * Creates sample request data for testing
 * @param {object} overrides - Properties to override
 * @returns {object} Test request object
 */
export function createTestRequest(overrides = {}) {
  return {
    query: "test query",
    userId: "test-user-123",
    sessionId: "test-session-456",
    ...overrides,
  };
}

/**
 * Creates sample vector data for testing
 * @param {number} count - Number of vectors to create
 * @returns {Array} Array of test vectors
 */
export function createTestVectors(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `vector-${i}`,
    embedding: Array.from({ length: 384 }, () => Math.random()),
    score: Math.random(),
  }));
}

/**
 * Creates sample message data for testing
 * @param {number} count - Number of messages to create
 * @returns {Array} Array of test messages
 */
export function createTestMessages(count = 3) {
  const roles = ["system", "user", "assistant"];
  return Array.from({ length: count }, (_, i) => ({
    role: roles[i % 3],
    content: `Test message ${i + 1}`,
  }));
}

/**
 * Creates sample chunk data for testing
 * @param {number} count - Number of chunks to create
 * @returns {Array} Array of test chunks
 */
export function createTestChunks(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i}`,
    text: `This is test chunk ${i + 1} with sample content.`,
    tokens: Math.floor(Math.random() * 100) + 10,
  }));
}
