import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceIndex - Resource ID Filtering", () => {
  let traceIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
  });

  describe("queryItems() - Resource ID Filtering with Complete Traces", () => {
    beforeEach(async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "5000000",
          attributes: { "service.name": "agent" },
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
          name: "memory.AppendMemory",
          kind: "CLIENT",
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "2500000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "span2",
          name: "memory.AppendMemory",
          kind: "SERVER",
          start_time_unix_nano: "1600000",
          end_time_unix_nano: "2400000",
          attributes: { "service.name": "memory" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span4",
          parent_span_id: "span1",
          name: "llm.CreateCompletions",
          kind: "CLIENT",
          start_time_unix_nano: "3000000",
          end_time_unix_nano: "4000000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span5",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv2" } },
        }),
      );
    });

    test("returns all spans from trace containing resource_id", async () => {
      const spans = await traceIndex.queryItems(null, {
        resource_id: "common.Conversation.conv1",
      });

      assert.strictEqual(
        spans.length,
        4,
        "Should return all spans from trace1",
      );
      const spanIds = spans.map((s) => s.span_id).sort();
      assert.deepStrictEqual(
        spanIds,
        ["span1", "span2", "span3", "span4"],
        "Should include all spans from trace including those without resource_id",
      );
    });

    test("includes spans without resource_id from same trace", async () => {
      const spans = await traceIndex.queryItems(null, {
        resource_id: "common.Conversation.conv1",
      });

      const spanIds = spans.map((s) => s.span_id).sort();
      assert.ok(
        spanIds.includes("span1"),
        "Should include parent span without resource_id",
      );
      assert.ok(
        spanIds.includes("span4"),
        "Should include sibling LLM span without resource_id",
      );
    });

    test("excludes spans from different trace with different resource_id", async () => {
      const spans = await traceIndex.queryItems(null, {
        resource_id: "common.Conversation.conv1",
      });

      const spanIds = spans.map((s) => s.span_id);
      assert.ok(
        !spanIds.includes("span5"),
        "Should not include span from different trace",
      );
    });

    test("combines resource_id and trace_id filters", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace3",
          span_id: "span6",
          parent_span_id: "",
          name: "test.Operation",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "common.Conversation.conv1" } },
        }),
      );

      const spans = await traceIndex.queryItems(null, {
        trace_id: "trace1",
        resource_id: "common.Conversation.conv1",
      });

      assert.strictEqual(
        spans.length,
        4,
        "Should return only spans from trace1",
      );
      const spanIds = spans.map((s) => s.span_id);
      assert.ok(spanIds.includes("span1"), "Should include spans from trace1");
      assert.ok(
        !spanIds.includes("span6"),
        "Should exclude span from different trace",
      );
    });

    test("returns empty array when resource_id has no matches", async () => {
      const spans = await traceIndex.queryItems(null, {
        resource_id: "nonexistent.Resource.id",
      });

      assert.strictEqual(spans.length, 0, "Should return empty array");
    });
  });

  describe("queryItems() - Multiple Traces with Same Resource", () => {
    test("returns complete traces when resource appears in multiple traces", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "3000000",
          attributes: { "service.name": "agent" },
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
          name: "memory.AppendMemory",
          kind: "CLIENT",
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "2500000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "test.Resource.id" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span3",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "4000000",
          end_time_unix_nano: "7000000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span4",
          parent_span_id: "span3",
          name: "memory.GetWindow",
          kind: "CLIENT",
          start_time_unix_nano: "4500000",
          end_time_unix_nano: "5500000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "test.Resource.id" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span5",
          parent_span_id: "span3",
          name: "llm.CreateCompletions",
          kind: "CLIENT",
          start_time_unix_nano: "5500000",
          end_time_unix_nano: "6500000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const spans = await traceIndex.queryItems(null, {
        resource_id: "test.Resource.id",
      });

      assert.strictEqual(
        spans.length,
        5,
        "Should return all spans from both traces",
      );
      const spanIds = spans.map((s) => s.span_id).sort();
      assert.deepStrictEqual(
        spanIds,
        ["span1", "span2", "span3", "span4", "span5"],
        "Should include all spans from both complete traces",
      );
    });

    test("handles sibling spans with and without resource_id", async () => {
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "agent.ProcessStream",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "5000000",
          attributes: { "service.name": "agent" },
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
          name: "memory.AppendMemory",
          kind: "CLIENT",
          start_time_unix_nano: "1500000",
          end_time_unix_nano: "2500000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: { id: "test.Resource.id" } },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span3",
          parent_span_id: "span1",
          name: "llm.CreateCompletions",
          kind: "CLIENT",
          start_time_unix_nano: "3000000",
          end_time_unix_nano: "4000000",
          attributes: { "service.name": "agent" },
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      const spans = await traceIndex.queryItems(null, {
        resource_id: "test.Resource.id",
      });

      assert.strictEqual(
        spans.length,
        3,
        "Should return all spans from trace including sibling without resource_id",
      );
      const spanIds = spans.map((s) => s.span_id).sort();
      assert.deepStrictEqual(
        spanIds,
        ["span1", "span2", "span3"],
        "Should include parent and both children even though only one has resource_id",
      );
    });
  });
});
