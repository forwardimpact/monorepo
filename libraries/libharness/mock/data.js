/**
 * Shared test data for common testing scenarios
 */

// Sample request data
export const testRequestData = {
  query: "test query",
  userId: "test-user-123",
  sessionId: "test-session-456",
};

// Sample vector data
export const testVectorData = [
  { id: "vector-1", embedding: [0.1, 0.2, 0.3], score: 0.9 },
  { id: "vector-2", embedding: [0.4, 0.5, 0.6], score: 0.8 },
  { id: "vector-3", embedding: [0.7, 0.8, 0.9], score: 0.7 },
];

// Sample message data
export const testMessageData = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello, how are you?" },
  { role: "assistant", content: "I'm doing well, thank you for asking!" },
];

// Sample chunk data
export const testChunkData = [
  {
    id: "chunk-1",
    text: "This is a sample text chunk for testing purposes.",
    tokens: 10,
  },
  {
    id: "chunk-2",
    text: "Another sample chunk with different content.",
    tokens: 8,
  },
];

// Sample configuration data
export const testConfigData = {
  host: "localhost",
  port: 3000,
  threshold: 0.5,
  limit: 100,
};
