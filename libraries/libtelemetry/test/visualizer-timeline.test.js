import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceVisualizer } from "../visualizer.js";
import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceVisualizer - multiple traces and timeline", () => {
  let traceIndex;
  let visualizer;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
    visualizer = new TraceVisualizer(traceIndex);
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
});
