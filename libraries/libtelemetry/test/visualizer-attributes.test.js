import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../visualizer.js";
import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceVisualizer - attributes and errors", () => {
  let traceIndex;
  let visualizer;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
    visualizer = new TraceVisualizer(traceIndex);
  });

  describe("visualize() - Request and Response Attributes", () => {
    test("includes request attributes in visualization", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "memory.AppendMemory",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "AppendMemory",
            rpc_service: "memory",
          },
          events: [
            {
              name: "request_sent",
              time_unix_nano: "1000000",
              attributes: {
                conversation_id: "conv123",
                message_count: "5",
              },
            },
          ],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "memory.AppendMemory",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "memory",
            rpc_method: "AppendMemory",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("conversation_id=conv123"),
        "Should include conversation_id attribute",
      );
      assert.ok(
        result.includes("message_count=5"),
        "Should include message_count attribute",
      );
    });

    test("includes response attributes in visualization", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "vector.QueryItems",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "QueryItems",
            rpc_service: "vector",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "vector.QueryItems",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "vector",
            rpc_method: "QueryItems",
          },
          events: [
            {
              name: "response_sent",
              time_unix_nano: "1900000",
              attributes: {
                result_count: "10",
                processing_time: "800ms",
              },
            },
          ],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("result_count=10"),
        "Should include result_count attribute",
      );
      assert.ok(
        result.includes("processing_time=800ms"),
        "Should include processing_time attribute",
      );
    });

    test("filters out empty and null attributes", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "test.Method",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "Method",
            rpc_service: "memory",
          },
          events: [
            {
              name: "request_sent",
              time_unix_nano: "1000000",
              attributes: {
                valid_key: "value",
                empty_key: "",
                null_key: null,
                undefined_key: undefined,
              },
            },
          ],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "test.Method",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "memory",
            rpc_method: "Method",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("valid_key=value"),
        "Should include valid attribute",
      );
      assert.ok(
        !result.includes("empty_key"),
        "Should not include empty attribute",
      );
      assert.ok(
        !result.includes("null_key"),
        "Should not include null attribute",
      );
      assert.ok(
        !result.includes("undefined_key"),
        "Should not include undefined attribute",
      );
    });
  });

  describe("visualize() - Error Status Handling", () => {
    test("displays error status and message", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "tool.ExecuteTool",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "ExecuteTool",
            rpc_service: "tool",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "tool.ExecuteTool",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "tool",
            rpc_method: "ExecuteTool",
          },
          events: [],
          status: {
            code: trace.Code.ERROR,
            message: "Tool execution failed: timeout",
          },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(result.includes("ERROR"), "Should show ERROR status");
      assert.ok(
        result.includes("Tool execution failed: timeout"),
        "Should show error message",
      );
      assert.ok(
        result.includes("tool-->>-agent: ERROR"),
        "Should show error in return line",
      );
    });

    test("prefers error message over response attributes", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "graph.QueryTriples",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "QueryTriples",
            rpc_service: "graph",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "graph.QueryTriples",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "graph",
            rpc_method: "QueryTriples",
          },
          events: [
            {
              name: "response",
              time_unix_nano: "1900000",
              attributes: {
                result_count: "0",
              },
            },
          ],
          status: {
            code: trace.Code.ERROR,
            message: "Invalid query pattern",
          },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("Invalid query pattern"),
        "Should show error message",
      );
      assert.ok(
        !result.includes("result_count=0"),
        "Should not show response attributes when error exists",
      );
    });
  });
});
