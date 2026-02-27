import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../visualizer.js";
import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceVisualizer", () => {
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

  describe("visualize() - Multiple Traces with resource_id", () => {
    beforeEach(async () => {
      // First trace with resource_id
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {
            service_name: "agent",
            rpc_method: "ProcessStream",
            rpc_service: "memory",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "agent.ProcessStream",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1100000",
          end_time_unix_nano: "1900000",
          attributes: {
            service_name: "memory",
            rpc_method: "ProcessStream",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      // Second trace with same resource_id
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span3",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "3000000",
          end_time_unix_nano: "4000000",
          attributes: {
            service_name: "agent",
            rpc_method: "ProcessStream",
            rpc_service: "memory",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span4",
          parent_span_id: "span3",
          name: "agent.ProcessStream",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "3100000",
          end_time_unix_nano: "3900000",
          attributes: {
            service_name: "memory",
            rpc_method: "ProcessStream",
          },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );
    });

    test("combines multiple traces into single diagram when resource_id filter used", async () => {
      const result = await visualizer.visualize(null, {
        resource_id: "common.Conversation.conv1",
      });

      assert.ok(
        result.includes("title Resource: common.Conversation.conv1"),
        "Should use resource ID in title",
      );
      assert.ok(result.includes("trace1"), "Should include trace1");
      assert.ok(result.includes("trace2"), "Should include trace2");
      assert.ok(
        result.includes("sequenceDiagram"),
        "Should include sequenceDiagram",
      );
    });

    test("adds separator notes between traces in combined diagram", async () => {
      const result = await visualizer.visualize(null, {
        resource_id: "common.Conversation.conv1",
      });

      const noteLines = result
        .split("\n")
        .filter((line) => line.includes("Note over"));

      assert.ok(noteLines.length >= 2, "Should have notes for both traces");
      assert.ok(
        noteLines[0].includes("trace1"),
        "First note should mention trace1",
      );
      assert.ok(
        noteLines[1].includes("trace2"),
        "Second note should mention trace2",
      );
    });

    test("uses truncated trace IDs in separator notes", async () => {
      const result = await visualizer.visualize(null, {
        resource_id: "common.Conversation.conv1",
      });

      // Trace IDs should be shown in separator notes
      assert.ok(result.includes("Trace: trace1"), "Should include trace1 ID");
      assert.ok(result.includes("Trace: trace2"), "Should include trace2 ID");
    });
  });

  describe("visualize() - Timeline Ordering", () => {
    test("processes spans in chronological order", async () => {
      // Add spans in non-chronological order
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "span2",
          name: "llm.CreateCompletions",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "3100000",
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

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "span0",
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

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "",
          name: "llm.CreateCompletions",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "3000000",
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
          span_id: "span0",
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
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const result = await visualizer.visualize(null, { trace_id: "trace1" });

      const interactionLines = result
        .split("\n")
        .filter((line) => line.includes("->>") || line.includes("-->>"));

      // Memory interaction should appear before LLM interaction
      const memoryRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+memory"),
      );
      const llmRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+llm"),
      );

      assert.ok(memoryRequestIndex >= 0, "Should have memory request");
      assert.ok(llmRequestIndex >= 0, "Should have LLM request");
      assert.ok(
        memoryRequestIndex < llmRequestIndex,
        "Memory request should come before LLM request",
      );
    });

    test("handles overlapping spans correctly", async () => {
      // Create nested/overlapping spans:
      // span1: 1000000 - 5000000 (outer)
      //   span2: 1500000 - 2500000 (inner, starts first)
      //   span3: 3000000 - 4000000 (inner, starts later)
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span2",
          parent_span_id: "span1",
          name: "memory.AppendMemory",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "2500000",
          attributes: {
            service_name: "agent",
            rpc_method: "AppendMemory",
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
          span_id: "span3",
          parent_span_id: "span2",
          name: "memory.AppendMemory",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "1600000",
          end_time_unix_nano: "2400000",
          attributes: {
            service_name: "memory",
            rpc_method: "AppendMemory",
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
          parent_span_id: "span1",
          name: "llm.CreateCompletions",
          kind: trace.Kind.CLIENT,
          start_time_unix_nano: "3000000",
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
          span_id: "span5",
          parent_span_id: "span4",
          name: "llm.CreateCompletions",
          kind: trace.Kind.SERVER,
          start_time_unix_nano: "3100000",
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

      // Memory interaction should complete before LLM interaction starts
      const memoryRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+memory"),
      );
      const memoryResponseIndex = interactionLines.findIndex((line) =>
        line.includes("memory-->>-agent"),
      );
      const llmRequestIndex = interactionLines.findIndex((line) =>
        line.includes("agent->>+llm"),
      );

      assert.ok(
        memoryRequestIndex < memoryResponseIndex,
        "Memory request before response",
      );
      assert.ok(
        memoryResponseIndex < llmRequestIndex,
        "Memory response before LLM request",
      );
    });
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
