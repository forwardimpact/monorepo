import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../visualizer.js";
import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceVisualizer - basics", () => {
  let traceIndex;
  let visualizer;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
    visualizer = new TraceVisualizer(traceIndex);
  });

  describe("Constructor", () => {
    test("throws error when traceIndex is not provided", () => {
      assert.throws(
        () => new TraceVisualizer(null),
        /traceIndex is required/,
        "Should throw when traceIndex is null",
      );
    });

    test("throws error when traceIndex is undefined", () => {
      assert.throws(
        () => new TraceVisualizer(undefined),
        /traceIndex is required/,
        "Should throw when traceIndex is undefined",
      );
    });

    test("creates visualizer instance when traceIndex is provided", () => {
      const vis = new TraceVisualizer(traceIndex);
      assert.ok(vis, "Should create instance successfully");
    });
  });

  describe("visualize() - Empty Results", () => {
    test("returns message when no spans match filter", async () => {
      const result = await visualizer.visualize(null, {
        trace_id: "nonexistent",
      });

      assert.strictEqual(
        result,
        "No spans found matching the filter criteria.",
        "Should return helpful message for empty results",
      );
    });

    test("returns message when index is empty", async () => {
      const result = await visualizer.visualize(null, {});

      assert.strictEqual(
        result,
        "No spans found matching the filter criteria.",
        "Should return helpful message for empty index",
      );
    });
  });

  describe("visualize() - Single Trace", () => {
    beforeEach(async () => {
      // Create a simple CLIENT -> SERVER interaction
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "3000000",
          attributes: {
            service_name: "agent",
            rpc_method: "ProcessStream",
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
          name: "agent.ProcessStream",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "2500000",
          attributes: {
            service_name: "memory",
            rpc_method: "ProcessStream",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );
    });

    test("generates Mermaid diagram for single trace", async () => {
      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(
        result.includes("sequenceDiagram"),
        "Should include sequenceDiagram",
      );
      assert.ok(
        result.includes("sequenceDiagram"),
        "Should be a sequence diagram",
      );
      assert.ok(
        result.includes("title Trace: trace1"),
        "Should include trace ID in title",
      );
      assert.ok(
        result.includes("participant agent"),
        "Should include agent participant",
      );
      assert.ok(
        result.includes("participant memory"),
        "Should include memory participant",
      );
      assert.ok(
        result.includes("agent->>+memory: ProcessStream"),
        "Should show request",
      );
      assert.ok(
        result.includes("memory-->>-agent: OK"),
        "Should show response",
      );
    });

    test("filters spans by trace_id", async () => {
      // Add spans for a different trace
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span3",
          parent_span_id: "",
          name: "test.Operation",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "4000000",
          end_time_unix_nano: "5000000",
          attributes: {
            service_name: "agent",
            rpc_method: "Operation",
            rpc_service: "llm",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      assert.ok(result.includes("trace1"), "Should include trace1");
      assert.ok(!result.includes("trace2"), "Should not include trace2");
      assert.ok(
        !result.includes("llm"),
        "Should not include llm service from trace2",
      );
    });

    test("orders participants in architectural sequence", async () => {
      // Add more services in non-architectural order
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "",
          name: "llm.CreateCompletions",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "3500000",
          end_time_unix_nano: "4500000",
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
          start_time_unix_nano: "3600000",
          end_time_unix_nano: "4400000",
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

      // Extract participant declarations
      const participantLines = result
        .split("\n")
        .filter((line) => line.includes("participant"));
      const agentIndex = participantLines.findIndex((line) =>
        line.includes("agent"),
      );
      const memoryIndex = participantLines.findIndex((line) =>
        line.includes("memory"),
      );
      const llmIndex = participantLines.findIndex((line) =>
        line.includes("llm"),
      );

      assert.ok(agentIndex >= 0, "Should include agent");
      assert.ok(memoryIndex >= 0, "Should include memory");
      assert.ok(llmIndex >= 0, "Should include llm");
      assert.ok(agentIndex < memoryIndex, "Agent should come before memory");
      assert.ok(memoryIndex < llmIndex, "Memory should come before llm");
    });
  });
});
