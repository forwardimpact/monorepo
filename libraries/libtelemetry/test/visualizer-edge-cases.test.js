import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../visualizer.js";
import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceVisualizer - edge cases and complex scenarios", () => {
  let traceIndex;
  let visualizer;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
    visualizer = new TraceVisualizer(traceIndex);
  });

  describe("visualize() - Edge Cases", () => {
    test("handles CLIENT span without corresponding SERVER span", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "external.Call",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "Call",
            rpc_service: "external",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
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
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "incomplete.Operation",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {}, // Missing service.name and rpc.method
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
          name: "incomplete.Operation",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {}, // Missing service.name and rpc.method
          events: [],
          status: { code: trace.Code.OK, message: "" },
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
          events: [], // Empty events
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
          events: [], // Empty events
          status: { code: trace.Code.OK, message: "" },
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
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.InternalOperation",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "InternalOperation",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
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

  describe("visualize() - Complex Scenarios", () => {
    test("handles multi-level service chains", async () => {
      // agent -> memory -> graph
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "memory.GetWindow",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "5000000",
          attributes: {
            service_name: "agent",
            rpc_method: "GetWindow",
            rpc_service: "memory",
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
          name: "memory.GetWindow",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "4500000",
          attributes: {
            service_name: "memory",
            rpc_method: "GetWindow",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "span2",
          name: "graph.QueryTriples",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "2000000",
          end_time_unix_nano: "4000000",
          attributes: {
            service_name: "memory",
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
          span_id: "span4",
          parent_span_id: "span3",
          name: "graph.QueryTriples",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "2500000",
          end_time_unix_nano: "3500000",
          attributes: {
            service_name: "graph",
            rpc_method: "QueryTriples",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
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
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "memory.GetWindow",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "3000000",
          attributes: {
            service_name: "agent",
            rpc_method: "GetWindow",
            rpc_service: "memory",
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
          name: "memory.GetWindow",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "2900000",
          attributes: {
            service_name: "memory",
            rpc_method: "GetWindow",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "",
          name: "llm.CreateCompletions",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "4000000",
          attributes: {
            service_name: "agent",
            rpc_method: "CreateCompletions",
            rpc_service: "llm",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span4",
          parent_span_id: "span3",
          name: "llm.CreateCompletions",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1600000",
          end_time_unix_nano: "3900000",
          attributes: {
            service_name: "llm",
            rpc_method: "CreateCompletions",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
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
