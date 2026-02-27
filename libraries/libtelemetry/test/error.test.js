import { test } from "node:test";
import { strict as assert } from "node:assert";

import { Tracer } from "../tracer.js";

test("Tracer enriches errors with trace context in observeClientUnaryCall", async () => {
  const mockTraceClient = {
    RecordSpan: async () => ({}),
  };

  /** Mock gRPC metadata class for testing */
  const mockGrpcMetadata = class {
    /** Create mock metadata instance */
    constructor() {
      this.data = new Map();
    }
    /**
     * Set metadata value
     * @param {string} key - Key
     * @param {*} value - Value
     */
    set(key, value) {
      this.data.set(key, value);
    }
    /**
     * Get metadata value
     * @param {string} key - Key
     * @returns {Array<*>|undefined} Value array or undefined
     */
    get(key) {
      return this.data.has(key) ? [this.data.get(key)] : undefined;
    }
  };

  const tracer = new Tracer({
    serviceName: "test-service",
    traceClient: mockTraceClient,
    grpcMetadata: mockGrpcMetadata,
  });

  const request = { test: "data" };
  const testError = new Error("Test error message");

  const callFn = async () => {
    throw testError;
  };

  try {
    await tracer.observeClientUnaryCall("TestMethod", request, callFn);
    assert.fail("Should have thrown error");
  } catch (error) {
    // Verify error has trace context properties
    assert.ok(error.trace_id, "Error should have trace_id");
    assert.ok(error.span_id, "Error should have span_id");
    assert.strictEqual(
      error.service_name,
      "test-service",
      "Error should have service_name",
    );

    // Verify error message is unchanged (Logger handles formatting)
    assert.strictEqual(
      error.message,
      "Test error message",
      "Error message should remain unchanged",
    );
  }
});

test("Tracer enriches errors with trace context in observeServerUnaryCall", async () => {
  const mockTraceClient = {
    RecordSpan: async () => ({}),
  };

  /** Mock gRPC metadata class for testing */
  const mockGrpcMetadata = class {
    /** Create mock metadata instance */
    constructor() {
      this.data = new Map();
    }
    /**
     * Set metadata value
     * @param {string} key - Key
     * @param {*} value - Value
     */
    set(key, value) {
      this.data.set(key, value);
    }
    /**
     * Get metadata value
     * @param {string} key - Key
     * @returns {Array<*>|undefined} Value array or undefined
     */
    get(key) {
      return this.data.has(key) ? [this.data.get(key)] : undefined;
    }
  };

  const tracer = new Tracer({
    serviceName: "test-service",
    traceClient: mockTraceClient,
    grpcMetadata: mockGrpcMetadata,
  });

  const call = {
    request: { test: "data" },
    metadata: new mockGrpcMetadata(),
  };
  const testError = new Error("Server error");

  const handlerFn = async () => {
    throw testError;
  };

  try {
    await tracer.observeServerUnaryCall("TestMethod", call, handlerFn);
    assert.fail("Should have thrown error");
  } catch (error) {
    // Verify error has trace context
    assert.ok(error.trace_id, "Error should have trace_id");
    assert.ok(error.span_id, "Error should have span_id");
    assert.strictEqual(
      error.service_name,
      "test-service",
      "Error should have service_name",
    );

    // Verify error message is unchanged (Logger handles formatting)
    assert.strictEqual(
      error.message,
      "Server error",
      "Error message should remain unchanged",
    );
  }
});

test("Logger extracts trace context from error", async () => {
  const mockTraceClient = {
    RecordSpan: async () => ({}),
  };

  /** Mock gRPC metadata class for testing */
  const mockGrpcMetadata = class {
    /** Create mock metadata instance */
    constructor() {
      this.data = new Map();
    }
    /**
     * Set metadata value
     * @param {string} key - Key
     * @param {*} value - Value
     */
    set(key, value) {
      this.data.set(key, value);
    }
    /**
     * Get metadata value
     * @param {string} key - Key
     * @returns {Array<*>|undefined} Value array or undefined
     */
    get(key) {
      return this.data.has(key) ? [this.data.get(key)] : undefined;
    }
  };

  const tracer = new Tracer({
    serviceName: "test-service",
    traceClient: mockTraceClient,
    grpcMetadata: mockGrpcMetadata,
  });

  const request = { test: "data" };
  const testError = new Error("Original error");

  const callFn = async () => {
    throw testError;
  };

  try {
    await tracer.observeClientUnaryCall("TestMethod", request, callFn);
    assert.fail("Should have thrown error");
  } catch (error) {
    // Verify trace context is in properties, not message
    assert.ok(error.trace_id, "Error should have trace_id property");
    assert.strictEqual(
      error.message,
      "Original error",
      "Error message should be unchanged",
    );
  }
});

test("Tracer handles non-Error objects gracefully", async () => {
  const mockTraceClient = {
    RecordSpan: async () => ({}),
  };

  /** Mock gRPC metadata class for testing */
  const mockGrpcMetadata = class {
    /** Create mock metadata instance */
    constructor() {
      this.data = new Map();
    }
    /**
     * Set metadata value
     * @param {string} key - Key
     * @param {*} value - Value
     */
    set(key, value) {
      this.data.set(key, value);
    }
    /**
     * Get metadata value
     * @param {string} key - Key
     * @returns {Array<*>|undefined} Value array or undefined
     */
    get(key) {
      return this.data.has(key) ? [this.data.get(key)] : undefined;
    }
  };

  const tracer = new Tracer({
    serviceName: "test-service",
    traceClient: mockTraceClient,
    grpcMetadata: mockGrpcMetadata,
  });

  const request = { test: "data" };
  const stringError = "Just a string error";

  const callFn = async () => {
    throw stringError;
  };

  try {
    await tracer.observeClientUnaryCall("TestMethod", request, callFn);
    assert.fail("Should have thrown error");
  } catch (error) {
    // Should still throw the original error
    assert.strictEqual(error, stringError);
  }
});
