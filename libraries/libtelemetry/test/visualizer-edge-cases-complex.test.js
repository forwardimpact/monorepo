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
  describe("visualize() - Complex Scenarios", () => {
    test("handles multi-level service chains", async () => {
      // agent -> memory -> graph
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "memory.GetWindow",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "5000000",
          attributes: {
            service_name: "agent",
            rpc_method: "GetWindow",
            rpc_service: "memory",
          },
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
          name: "memory.GetWindow",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "4500000",
          attributes: {
            service_name: "memory",
            rpc_method: "GetWindow",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "span2",
          name: "graph.QueryTriples",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "2000000",
          end_time_unix_nano: "4000000",
          attributes: {
            service_name: "memory",
            rpc_method: "QueryTriples",
            rpc_service: "graph",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span4",
          parent_span_id: "span3",
          name: "graph.QueryTriples",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "2500000",
          end_time_unix_nano: "3500000",
          attributes: {
            service_name: "graph",
            rpc_method: "QueryTriples",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(result.includes("participant agent"), "Should include agent");
      assert.ok(result.includes("participant memory"), "Should include memory");
      assert.ok(result.includes("participant graph"), "Should include graph");
      assert.ok(
        result.includes("agent->>+memory"),
        "Should show agent to memory",
      );
      assert.ok(
        result.includes("memory->>+graph"),
        "Should show memory to graph",
      );
      assert.ok(
        result.includes("graph-->>-memory"),
        "Should show graph to memory response",
      );
      assert.ok(
        result.includes("memory-->>-agent"),
        "Should show memory to agent response",
      );
    });

    test("handles parallel service calls", async () => {
      // agent calls both memory and llm in parallel
      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "memory.GetWindow",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "3000000",
          attributes: {
            service_name: "agent",
            rpc_method: "GetWindow",
            rpc_service: "memory",
          },
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
          name: "memory.GetWindow",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "2900000",
          attributes: {
            service_name: "memory",
            rpc_method: "GetWindow",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "",
          name: "llm.CreateCompletions",
          kind: spanType.Kind.CLIENT,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "4000000",
          attributes: {
            service_name: "agent",
            rpc_method: "CreateCompletions",
            rpc_service: "llm",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        spanType.SpanItem.fromObject({
          trace_id: "trace1",
          span_id: "span4",
          parent_span_id: "span3",
          name: "llm.CreateCompletions",
          kind: spanType.Kind.SERVER,
          start_time_unix_nano: "1600000",
          end_time_unix_nano: "3900000",
          attributes: {
            service_name: "llm",
            rpc_method: "CreateCompletions",
          },
          events: [],
          status: { code: spanType.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      const interactionLines = result
        .split("\n")
        .filter((line) => line.includes("->>") || line.includes("-->>"));

      // Both requests should be present
      assert.ok(
        interactionLines.some((line) => line.includes("agent->>+memory")),
        "Should have memory request",
      );
      assert.ok(
        interactionLines.some((line) => line.includes("agent->>+llm")),
        "Should have LLM request",
      );

      // Memory request starts first (1000000 < 1500000)
      const memoryRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+memory"),
      );
      const llmRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+llm"),
      );

      assert.ok(
        memoryRequestIndex < llmRequestIndex,
        "Memory request should appear before LLM request due to earlier start time",
      );
    });
  });
});
