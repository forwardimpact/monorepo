import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../src/visualizer.js";
import { TraceIndex } from "../src/index/trace.js";
import { span as spanType } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libmock";
import { createMockClock } from "@forwardimpact/libmock";
const _clock = createMockClock();

describe("TraceVisualizer - edge cases and complex scenarios", () => {
  let traceIndex;
  let visualizer;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl", {
      clock: _clock,
    });
    visualizer = new TraceVisualizer(traceIndex);
  });
  describe("visualize() - Edge Cases", () => {
    test("handles CLIENT span without corresponding SERVER span", async () => {
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "external.Call",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "Call",
            rpc_service: "external",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      // Should not crash, but CLIENT span without SERVER won't generate interactions
      assert.ok(
        result.includes("sequenceDiagram"),
        "Should include sequenceDiagram",
      );
      assert.ok(
        result.includes("participant agent"),
        "Should include agent participant",
      );
    });

    test("handles spans with missing attributes gracefully", async () => {
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "incomplete.Operation",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {}, // Missing service.name and rpc.method
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "incomplete.Operation",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {}, // Missing service.name and rpc.method
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      // Should not crash, but spans without required attributes won't generate interactions
      assert.ok(
        result.includes("sequenceDiagram"),
        "Should include sequenceDiagram",
      );
      assert.ok(
        result.includes("sequenceDiagram"),
        "Should be a sequence diagram",
      );
    });

    test("handles spans with empty events array", async () => {
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "test.Method",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "Method",
            rpc_service: "memory",
          },
          events: [], // Empty events
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "test.Method",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "memory",
            rpc_method: "Method",
          },
          events: [], // Empty events
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("agent->>+memory: Method"),
        "Should show request",
      );
      assert.ok(
        result.includes("memory-->>-agent: OK"),
        "Should show response",
      );
      // Should not include attribute parentheses when no attributes exist
      assert.ok(
        !result.includes("Method ()"),
        "Should not show empty attribute parentheses",
      );
    });

    test("handles single-service traces", async () => {
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.InternalOperation",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "InternalOperation",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("sequenceDiagram"),
        "Should include sequenceDiagram",
      );
      assert.ok(
        result.includes("participant agent"),
        "Should include agent participant",
      );
      assert.strictEqual(
        (result.match(/participant/g) || []).length,
        1,
        "Should have only one participant",
      );
    });
  });
});
