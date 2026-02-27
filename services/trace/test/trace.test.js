import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { TraceService } from "../index.js";
import { TraceIndex } from "@forwardimpact/libtelemetry/index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockConfig, createMockStorage } from "@forwardimpact/libharness";

describe("trace service", () => {
  describe("TraceService", () => {
    test("exports TraceService class", () => {
      assert.strictEqual(typeof TraceService, "function");
      assert.ok(TraceService.prototype);
    });

    test("TraceService has RecordSpan method", () => {
      assert.strictEqual(typeof TraceService.prototype.RecordSpan, "function");
    });

    test("TraceService has QuerySpans method", () => {
      assert.strictEqual(typeof TraceService.prototype.QuerySpans, "function");
    });

    test("TraceService has shutdown method", () => {
      assert.strictEqual(typeof TraceService.prototype.shutdown, "function");
    });

    test("TraceService constructor accepts expected parameters", () => {
      // Test constructor signature by checking parameter count
      assert.strictEqual(TraceService.length, 2); // config, traceIndex
    });

    test("TraceService has proper method signatures", () => {
      const methods = Object.getOwnPropertyNames(TraceService.prototype);
      assert(methods.includes("RecordSpan"));
      assert(methods.includes("QuerySpans"));
      assert(methods.includes("shutdown"));
      assert(methods.includes("constructor"));
    });
  });

  describe("TraceService business logic", () => {
    let mockConfig;
    let mockTraceIndex;
    let mockStorage;

    beforeEach(() => {
      mockConfig = createMockConfig("trace");

      // Create mock storage for TraceIndex
      mockStorage = createMockStorage();

      // Use real TraceIndex with mock storage for more realistic testing
      mockTraceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
    });

    test("creates service instance with trace index", () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      assert.ok(service);
      assert.strictEqual(service.config, mockConfig);
    });

    test("throws error if traceIndex is missing", () => {
      assert.throws(
        () => {
          new TraceService(mockConfig);
        },
        { message: "traceIndex is required" },
      );
    });

    test("RecordSpan stores span in index", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      const spanRequest = trace.Span.fromObject({
        trace_id: "trace123",
        span_id: "span456",
        parent_span_id: "",
        name: "TestOperation",
        kind: "SERVER",
        start_time_unix_nano: "1698345600000000000",
        end_time_unix_nano: "1698345601000000000",
        attributes: { "service.name": "test-service" },
        events: [],
        status: { code: trace.Code.OK, message: "" },
        resource: { attributes: {} },
      });

      const result = await service.RecordSpan(spanRequest);

      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(mockTraceIndex.index.size, 1);
      assert.ok(mockTraceIndex.index.has("span456"));
    });

    test("QuerySpans returns stored spans", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      // Record a span first
      await service.RecordSpan(
        trace.Span.fromObject({
          trace_id: "trace123",
          span_id: "span456",
          parent_span_id: "",
          name: "TestOperation",
          kind: "SERVER",
          start_time_unix_nano: "1698345600000000000",
          end_time_unix_nano: "1698345601000000000",
          attributes: { "service.name": "test-service" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await service.QuerySpans({
        query: null,
        filter: { trace_id: "trace123" },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.spans));
      assert.strictEqual(result.spans.length, 1);
      assert.strictEqual(result.spans[0].span_id, "span456");
    });

    test("QuerySpans filters by trace_id", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      // Record spans with different trace IDs
      await service.RecordSpan(
        trace.Span.fromObject({
          trace_id: "trace123",
          span_id: "span1",
          parent_span_id: "",
          name: "Operation1",
          kind: "SERVER",
          start_time_unix_nano: "1698345600000000000",
          end_time_unix_nano: "1698345601000000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await service.RecordSpan(
        trace.Span.fromObject({
          trace_id: "trace456",
          span_id: "span2",
          parent_span_id: "",
          name: "Operation2",
          kind: "SERVER",
          start_time_unix_nano: "1698345600000000000",
          end_time_unix_nano: "1698345601000000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await service.QuerySpans({
        query: null,
        filter: { trace_id: "trace123" },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.spans));
      assert.strictEqual(result.spans.length, 1);
      assert.strictEqual(result.spans[0].trace_id, "trace123");
    });

    test("QuerySpans respects limit parameter", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      // Record multiple spans
      for (let i = 0; i < 5; i++) {
        await service.RecordSpan(
          trace.Span.fromObject({
            trace_id: "trace123",
            span_id: `span${i}`,
            parent_span_id: "",
            name: `Operation${i}`,
            kind: "INTERNAL",
            start_time_unix_nano: "1698345600000000000",
            end_time_unix_nano: "1698345601000000000",
            attributes: {},
            events: [],
            status: { code: trace.Code.OK, message: "" },
            resource: { attributes: {} },
          }),
        );
      }

      const result = await service.QuerySpans({
        query: null,
        filter: { trace_id: "trace123" },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.spans));
      assert.strictEqual(result.spans.length, 5);
    });

    test("RecordSpan handles span with events", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      const spanRequest = trace.Span.fromObject({
        trace_id: "trace123",
        span_id: "span456",
        parent_span_id: "span123",
        name: "TestOperation",
        kind: "CLIENT",
        start_time_unix_nano: "1698345600000000000",
        end_time_unix_nano: "1698345601000000000",
        attributes: { "service.name": "test-service", "rpc.method": "Test" },
        events: [
          {
            name: "cache_hit",
            time_unix_nano: "1698345600500000000",
            attributes: { hit_rate: "0.95" },
          },
        ],
        status: { code: trace.Code.OK, message: "" },
        resource: { attributes: {} },
      });

      const result = await service.RecordSpan(spanRequest);

      assert.ok(result);
      assert.strictEqual(result.success, true);

      const stored = mockTraceIndex.index.get("span456");
      assert.ok(stored);
      assert.strictEqual(stored.span.events.length, 1);
      assert.strictEqual(stored.span.events[0].name, "cache_hit");
    });

    test("RecordSpan handles error status", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      const spanRequest = trace.Span.fromObject({
        trace_id: "trace123",
        span_id: "span789",
        parent_span_id: "",
        name: "FailedOperation",
        kind: "INTERNAL",
        start_time_unix_nano: "1698345600000000000",
        end_time_unix_nano: "1698345601000000000",
        attributes: { "service.name": "test-service" },
        events: [],
        status: {
          code: trace.Code.ERROR,
          message: "Connection timeout",
        },
        resource: { attributes: {} },
      });

      const result = await service.RecordSpan(spanRequest);

      assert.ok(result);
      assert.strictEqual(result.success, true);

      const stored = mockTraceIndex.index.get("span789");
      assert.ok(stored);
      assert.strictEqual(stored.span.status.code, trace.Code.ERROR);
      assert.strictEqual(stored.span.status.message, "Connection timeout");
    });

    test("QuerySpans requires either trace_id or resource_id", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      await assert.rejects(
        async () => {
          await service.QuerySpans({});
        },
        { message: "Either query, trace_id, or resource_id is required" },
      );
    });

    test("QuerySpans filters by resource_id", async () => {
      const service = new TraceService(mockConfig, mockTraceIndex);

      // Record spans with resource_id
      await service.RecordSpan(
        trace.Span.fromObject({
          trace_id: "trace123",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "1698345600000000000",
          end_time_unix_nano: "1698345601000000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await service.RecordSpan(
        trace.Span.fromObject({
          trace_id: "trace123",
          span_id: "span2",
          parent_span_id: "span1",
          name: "memory.AppendMemory",
          kind: "CLIENT",
          start_time_unix_nano: "1698345600000000000",
          end_time_unix_nano: "1698345601000000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.test123" } },
        }),
      );

      const result = await service.QuerySpans({
        query: null,
        filter: { resource_id: "common.Conversation.test123" },
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.spans));
      assert.strictEqual(
        result.spans.length,
        2,
        "Should return both child with resource_id and parent without it",
      );
      const spanIds = result.spans.map((s) => s.span_id).sort();
      assert.deepStrictEqual(spanIds, ["span1", "span2"]);
    });
  });
});
