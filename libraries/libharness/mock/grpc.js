import { mock } from "node:test";

/**
 * Creates a mock gRPC factory function
 * @param {object} overrides - Method overrides
 * @returns {Function} Mock gRPC factory
 */
export function createMockGrpcFn(overrides = {}) {
  const mockGrpc = {
    Server: function () {
      return {
        addService: mock.fn(),
        bindAsync: mock.fn((uri, creds, callback) => callback(null, 5000)),
        tryShutdown: mock.fn((callback) => callback()),
        ...overrides.server,
      };
    },
    loadPackageDefinition: mock.fn(() => ({
      test: { Test: { service: {} } },
    })),
    makeGenericClientConstructor: mock.fn(() => function () {}),
    ServerCredentials: {
      createInsecure: mock.fn(),
    },
    credentials: {
      createInsecure: mock.fn(),
    },
    status: {
      OK: 0,
      CANCELLED: 1,
      UNKNOWN: 2,
      INVALID_ARGUMENT: 3,
      DEADLINE_EXCEEDED: 4,
      NOT_FOUND: 5,
      ALREADY_EXISTS: 6,
      PERMISSION_DENIED: 7,
      RESOURCE_EXHAUSTED: 8,
      FAILED_PRECONDITION: 9,
      ABORTED: 10,
      OUT_OF_RANGE: 11,
      UNIMPLEMENTED: 12,
      INTERNAL: 13,
      UNAVAILABLE: 14,
      DATA_LOSS: 15,
      UNAUTHENTICATED: 16,
    },
    ...overrides.grpc,
  };

  const mockProtoLoader = {
    loadSync: mock.fn(() => ({})),
    ...overrides.protoLoader,
  };

  return () => ({ grpc: mockGrpc, protoLoader: mockProtoLoader });
}

/**
 * Creates a mock gRPC Metadata class
 */
export class MockMetadata {
  /**
   * Creates a new MockMetadata instance
   */
  constructor() {
    this.data = new Map();
  }

  /**
   * Sets a metadata key-value pair
   * @param {string} key - The metadata key
   * @param {string} value - The metadata value
   */
  set(key, value) {
    this.data.set(key, value);
  }

  /**
   * Gets metadata value by key
   * @param {string} key - The metadata key
   * @returns {string[]} Array containing the value, or empty array if not found
   */
  get(key) {
    const value = this.data.get(key);
    return value !== undefined ? [value] : [];
  }

  /**
   * Returns all metadata as a plain object
   * @returns {object} Object with all metadata key-value pairs
   */
  getMap() {
    return Object.fromEntries(this.data);
  }
}
