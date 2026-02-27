import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceIndex", () => {
  let traceIndex;
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();

    traceIndex = new TraceIndex(mockStorage, "test-traces.jsonl");
  });

  describe("Constructor and Inheritance", () => {
    test("constructor validates storage parameter", () => {
      assert.throws(
        () => new TraceIndex(null),
        /storage is required/,
        "Should throw for missing storage",
      );
    });

    test("constructor sets properties correctly", () => {
      const index = new TraceIndex(mockStorage, "custom.jsonl");
      assert.strictEqual(index.storage(), mockStorage, "Should set storage");
      assert.strictEqual(index.indexKey, "custom.jsonl", "Should set indexKey");
      assert.strictEqual(
        index.loaded,
        false,
        "Should initialize loaded as false",
      );
    });

    test("constructor uses default indexKey when not provided", () => {
      const index = new TraceIndex(mockStorage);
      assert.strictEqual(
        index.indexKey,
        "index.jsonl",
        "Should use default indexKey",
      );
    });
  });

  describe("add() Method", () => {
    test("adds span to index with correct item structure", async () => {
      const span = trace.Span.fromObject({
        trace_id: "trace123",
        span_id: "span456",
        parent_span_id: "",
        name: "test.Operation",
        kind: "SERVER",
        start_time_unix_nano: "1000000",
        end_time_unix_nano: "2000000",
        attributes: { "service.name": "test-service" },
        events: [],
        status: { code: trace.Code.OK, message: "" },
        resource: { attributes: {} },
      });

      await traceIndex.add(span);

      // Verify item was added to index with correct structure
      const item = traceIndex.index.get("span456");
      assert.ok(item, "Item should be in index");
      assert.strictEqual(item.id, "span456", "Item id should be span_id");
      assert.strictEqual(item.span, span, "Item should contain span object");
    });

    test("adds span with resource_id to index", async () => {
      const span = trace.Span.fromObject({
        trace_id: "trace123",
        span_id: "span789",
        parent_span_id: "span456",
        name: "memory.AppendMemory",
        kind: "CLIENT",
        start_time_unix_nano: "1000000",
        end_time_unix_nano: "2000000",
        attributes: { "service.name": "agent" },
        events: [],
        status: { code: trace.Code.OK, message: "" },
        resource: { attributes: { id: "common.Conversation.abc-123" } },
      });

      await traceIndex.add(span);

      const item = traceIndex.index.get("span789");
      assert.ok(item, "Item should be in index");
      assert.strictEqual(
        item.span.resource.attributes.id,
        "common.Conversation.abc-123",
        "Resource ID should be preserved",
      );
    });
  });

  describe("queryItems() - Basic Filtering", () => {
    beforeEach(async () => {
      // Add test spans to index
      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace1",
          span_id: "span1",
          parent_span_id: "",
          name: "operation1",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {},
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
          name: "operation2",
          kind: "CLIENT",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );

      await traceIndex.add(
        trace.Span.fromObject({
          trace_id: "trace2",
          span_id: "span3",
          parent_span_id: "",
          name: "operation3",
          kind: "SERVER",
          start_time_unix_nano: "1000000",
          end_time_unix_nano: "2000000",
          attributes: {},
          events: [],
          status: { code: trace.Code.OK, message: "" },
          resource: { attributes: {} },
        }),
      );
    });

    test("returns all spans when no filter specified", async () => {
      const spans = await traceIndex.queryItems(null, {});

      assert.strictEqual(spans.length, 3, "Should return all spans");
    });

    test("filters by trace_id correctly", async () => {
      const spans = await traceIndex.queryItems(null, { trace_id: "trace1" });

      assert.strictEqual(spans.length, 2, "Should return spans for trace1");
      assert.ok(
        spans.every((s) => s.trace_id === "trace1"),
        "All spans should have trace_id trace1",
      );
    });

    test("returns empty array when trace_id has no matches", async () => {
      const spans = await traceIndex.queryItems(null, {
        trace_id: "nonexistent",
      });

      assert.strictEqual(spans.length, 0, "Should return empty array");
    });
  });

  describe("queryItems() - Resource ID Filtering with Complete Traces", () => {
    beforeEach(async () => {
      // Create a trace with multiple spans:
      // trace1: span1 (no resource_id) -> span2 (has resource_id) -> span3 (has resource_id)
      //         + span4 (sibling to span2, no resource_id) for LLM service
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
          resource: { attributes: {} }, // No resource_id yet
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

      // Add LLM span without resource_id (sibling to memory spans)
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
          resource: { attributes: {} }, // No resource_id
        }),
      );

      // Add another span with different resource_id in different trace
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
      // Add span with same resource_id but different trace_id
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
      // Create two separate traces, both with the same resource_id
      // trace1: span1 -> span2 (has resource_id)
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

      // trace2: span3 -> span4 (has resource_id) -> span5
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
      // Create branching hierarchy:
      //       span1 (no resource)
      //      /     \
      //   span2    span3 (only span2 has resource_id)
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
          resource: { attributes: {} }, // No resource_id
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
