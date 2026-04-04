import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { TraceIndex } from "../index/trace.js";
import { trace } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libharness";

describe("TraceIndex - Core", () => {
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
});
