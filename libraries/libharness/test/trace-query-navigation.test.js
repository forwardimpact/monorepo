import { describe, test } from "node:test";
import assert from "node:assert";

import { TraceQuery, createTraceQuery } from "@forwardimpact/libharness";
import { buildTrace } from "./trace-query-helpers.js";

describe("TraceQuery", () => {
  describe("overview", () => {
    test("returns metadata, summary, turnCount, and tools", () => {
      const q = new TraceQuery(buildTrace());
      const ov = q.overview();

      assert.strictEqual(ov.metadata.model, "claude-opus-4-6");
      assert.strictEqual(ov.turnCount, 10);
      assert.strictEqual(ov.summary.totalCostUsd, 0.0523);
      assert.ok(ov.tools.length > 0);
      assert.strictEqual(ov.tools[0].tool, "Bash");
      assert.strictEqual(ov.tools[0].count, 2);
    });
  });

  describe("count", () => {
    test("returns number of turns", () => {
      const q = new TraceQuery(buildTrace());
      assert.strictEqual(q.count(), 10);
    });

    test("returns 0 for empty trace", () => {
      const q = new TraceQuery(buildTrace({ turns: [] }));
      assert.strictEqual(q.count(), 0);
    });
  });

  describe("batch", () => {
    test("returns turns in range [from, to)", () => {
      const q = new TraceQuery(buildTrace());
      const batch = q.batch(2, 5);

      assert.strictEqual(batch.length, 3);
      assert.strictEqual(batch[0].index, 2);
      assert.strictEqual(batch[2].index, 4);
    });

    test("clamps to available range", () => {
      const q = new TraceQuery(buildTrace());
      const batch = q.batch(8, 20);
      assert.strictEqual(batch.length, 2);
    });
  });

  describe("head", () => {
    test("returns first N turns (default 10)", () => {
      const q = new TraceQuery(buildTrace());
      const h = q.head();
      assert.strictEqual(h.length, 10);
      assert.strictEqual(h[0].index, 0);
    });

    test("returns first N turns with custom count", () => {
      const q = new TraceQuery(buildTrace());
      const h = q.head(3);
      assert.strictEqual(h.length, 3);
    });
  });

  describe("tail", () => {
    test("returns last N turns", () => {
      const q = new TraceQuery(buildTrace());
      const t = q.tail(3);
      assert.strictEqual(t.length, 3);
      assert.strictEqual(t[0].index, 7);
      assert.strictEqual(t[2].index, 9);
    });
  });

  describe("search", () => {
    test("finds text in assistant reasoning", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("config file");

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].turn.index, 3);
      assert.ok(results[0].matches[0].startsWith("text:"));
    });

    test("finds text in tool result content", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("test suite failed");

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].turn.index, 8);
      assert.ok(results[0].matches[0].startsWith("result:"));
    });

    test("finds tool name matches", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("^Edit$");

      assert.ok(results.length >= 1);
      const hasToolNameMatch = results.some((r) =>
        r.matches.some((m) => m.startsWith("tool_name:")),
      );
      assert.ok(hasToolNameMatch);
    });

    test("finds text in tool input", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("npm test");

      assert.ok(results.length >= 1);
      assert.ok(results[0].matches[0].includes("tool_input"));
    });

    test("respects limit option", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search(".", { limit: 2 });
      assert.strictEqual(results.length, 2);
    });

    test("includes context turns when requested", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("test suite failed", { context: 1 });

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].context.length > 0);
      // Context should include adjacent turns (index 7 and 9)
      const contextIndexes = results[0].context.map((t) => t.index);
      assert.ok(contextIndexes.includes(7));
      assert.ok(contextIndexes.includes(9));
    });

    test("returns empty array for no matches", () => {
      const q = new TraceQuery(buildTrace());
      const results = q.search("nonexistent_xyz_pattern");
      assert.strictEqual(results.length, 0);
    });
  });
  describe("createTraceQuery", () => {
    test("accepts JSON string and plain object, returns TraceQuery", () => {
      for (const input of [JSON.stringify(buildTrace()), buildTrace()]) {
        const q = createTraceQuery(input);
        assert.ok(q instanceof TraceQuery);
        assert.strictEqual(q.count(), 10);
      }
    });
  });
});
