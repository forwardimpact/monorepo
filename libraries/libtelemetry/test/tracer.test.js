import { describe, test } from "node:test";
import assert from "node:assert";

import { Tracer } from "../tracer.js";

/**
 * Mock gRPC Metadata class for testing
 */
class MockMetadata {
  /**
   * Constructor for MockMetadata
   */
  constructor() {
    this.data = new Map();
  }
  /**
   * Set a metadata key-value pair
   * @param {string} key - The metadata key
   * @param {string} value - The metadata value
   */
  set(key, value) {
    this.data.set(key, value);
  }
  /**
   * Get a metadata value by key
   * @param {string} key - The metadata key
   * @returns {string[]} The metadata value as an array
   */
  get(key) {
    const value = this.data.get(key);
    return value !== undefined ? [value] : [];
  }
}

describe("Tracer", () => {
  describe("AsyncLocalStorage context isolation", () => {
    test("maintains separate span contexts for concurrent operations", async () => {
      const mockTraceClient = { RecordSpan: () => Promise.resolve() };
      const tracer = new Tracer({
        serviceName: "test-service",
        traceClient: mockTraceClient,
        grpcMetadata: MockMetadata,
      });

      // Simulate two concurrent operations
      const operation1 = async () => {
        const span1 = tracer.startSpan("operation1", { kind: "SERVER" });
        const context = tracer.getSpanContext();

        // Store span in AsyncLocalStorage
        return context.run(span1, async () => {
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Verify we can still retrieve the correct span
          const currentSpan = context.getStore();
          assert.strictEqual(currentSpan.span_id, span1.span_id);
          assert.strictEqual(currentSpan.trace_id, span1.trace_id);
          return span1.span_id;
        });
      };

      const operation2 = async () => {
        const span2 = tracer.startSpan("operation2", { kind: "SERVER" });
        const context = tracer.getSpanContext();

        // Store span in AsyncLocalStorage
        return context.run(span2, async () => {
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Verify we can still retrieve the correct span
          const currentSpan = context.getStore();
          assert.strictEqual(currentSpan.span_id, span2.span_id);
          assert.strictEqual(currentSpan.trace_id, span2.trace_id);
          return span2.span_id;
        });
      };

      // Run both operations concurrently
      const [spanId1, spanId2] = await Promise.all([
        operation1(),
        operation2(),
      ]);

      // Verify spans are different
      assert.notStrictEqual(spanId1, spanId2);
    });

    test("startClientSpan reads parent from AsyncLocalStorage", () => {
      const mockTraceClient = { RecordSpan: () => Promise.resolve() };
      const tracer = new Tracer({
        serviceName: "test-service",
        traceClient: mockTraceClient,
        grpcMetadata: MockMetadata,
      });
      const context = tracer.getSpanContext();

      // Create a parent SERVER span
      const parentSpan = tracer.startSpan("parent", { kind: "SERVER" });

      // Run within AsyncLocalStorage context
      context.run(parentSpan, () => {
        // Create a CLIENT span - should automatically use parent from storage
        const { span: clientSpan, metadata } = tracer.startClientSpan(
          "test-service",
          "testMethod",
        );

        // Verify client span was created and shares trace ID with parent
        assert.strictEqual(clientSpan.trace_id, parentSpan.trace_id);
        assert.ok(clientSpan.span_id);
        assert.notStrictEqual(clientSpan.span_id, parentSpan.span_id);

        // Verify metadata was created and populated
        assert.ok(metadata instanceof MockMetadata);
        assert.strictEqual(metadata.get("x-trace-id")[0], clientSpan.trace_id);
        assert.strictEqual(metadata.get("x-span-id")[0], clientSpan.span_id);
      });
    });

    test("startServerSpan extracts trace context from metadata", () => {
      const mockTraceClient = { RecordSpan: () => Promise.resolve() };
      const tracer = new Tracer({
        serviceName: "test-service",
        traceClient: mockTraceClient,
        grpcMetadata: MockMetadata,
      });

      // Mock gRPC metadata with trace context
      const metadata = {
        get: (key) => {
          if (key === "x-trace-id") return ["test-trace-id"];
          if (key === "x-span-id") return ["test-parent-span-id"];
          return [];
        },
      };

      const serverSpan = tracer.startServerSpan(
        "test-service",
        "testMethod",
        null, // request
        metadata,
      );

      // Verify trace context was extracted (trace ID should match)
      assert.strictEqual(serverSpan.trace_id, "test-trace-id");
      assert.ok(serverSpan.span_id);
    });
  });
});
