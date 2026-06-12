import { describe, test } from "node:test";
import assert from "node:assert";

import { TraceQuery } from "@forwardimpact/libeval";
import { buildTrace } from "./trace-query-helpers.js";

describe("TraceQuery", () => {
  describe("toolFrequency", () => {
    test("returns tools sorted by count descending", () => {
      const q = new TraceQuery(buildTrace());
      const freq = q.toolFrequency();

      assert.strictEqual(freq[0].tool, "Bash");
      assert.strictEqual(freq[0].count, 2);
      assert.strictEqual(freq[1].count, 1);
      assert.strictEqual(freq[2].count, 1);
    });
  });

  describe("tool", () => {
    test("returns tool_use and matching tool_result turns", () => {
      const q = new TraceQuery(buildTrace());
      const turns = q.tool("Bash");

      // Should include both Bash tool_use turns and their results
      assert.strictEqual(turns.length, 4);
      assert.strictEqual(turns[0].role, "assistant");
      assert.strictEqual(turns[1].role, "tool_result");
      assert.strictEqual(turns[1].toolUseId, "toolu_01");
      assert.strictEqual(turns[2].role, "assistant");
      assert.strictEqual(turns[3].role, "tool_result");
      assert.strictEqual(turns[3].toolUseId, "toolu_04");
    });

    test("returns empty array for unknown tool", () => {
      const q = new TraceQuery(buildTrace());
      assert.strictEqual(q.tool("NonexistentTool").length, 0);
    });
  });

  describe("errors", () => {
    test("returns only error tool results", () => {
      const q = new TraceQuery(buildTrace());
      const errs = q.errors();

      assert.strictEqual(errs.length, 1);
      assert.strictEqual(errs[0].index, 8);
      assert.ok(errs[0].content.includes("test suite failed"));
    });

    test("returns empty array when no errors", () => {
      const trace = buildTrace();
      trace.turns = trace.turns.filter((t) => !t.isError);
      const q = new TraceQuery(trace);
      assert.strictEqual(q.errors().length, 0);
    });
  });

  describe("reasoning", () => {
    test("extracts text from assistant turns", () => {
      const q = new TraceQuery(buildTrace());
      const r = q.reasoning();

      assert.strictEqual(r.length, 3);
      assert.strictEqual(r[0].index, 0);
      assert.ok(r[0].text.includes("check the files"));
      assert.strictEqual(r[1].index, 3);
      assert.ok(r[1].text.includes("config file"));
      assert.strictEqual(r[2].index, 9);
    });

    test("respects from/to range", () => {
      const q = new TraceQuery(buildTrace());
      const r = q.reasoning({ from: 3, to: 8 });

      assert.strictEqual(r.length, 1);
      assert.strictEqual(r[0].index, 3);
    });
  });

  describe("timeline", () => {
    test("produces one line per non-thinking assistant turn", () => {
      const q = new TraceQuery(buildTrace());
      const lines = q.timeline();

      // 6 assistant turns (indexes 0,1,3,5,7,9), all visible
      assert.strictEqual(lines.length, 6);
    });

    test("shows tool names in output", () => {
      const q = new TraceQuery(buildTrace());
      const lines = q.timeline();

      assert.ok(lines[1].includes("Bash"));
      assert.ok(lines[2].includes("Read"));
    });

    test("shows (text only) for turns without tools", () => {
      const q = new TraceQuery(buildTrace());
      const lines = q.timeline();

      assert.ok(lines[0].includes("(text only)"));
    });

    test("includes token counts", () => {
      const q = new TraceQuery(buildTrace());
      const lines = q.timeline();

      assert.ok(lines[0].includes("in:"));
      assert.ok(lines[0].includes("out:"));
    });

    test("skips thinking-only assistant turns", () => {
      const trace = buildTrace({
        turns: [
          {
            index: 0,
            role: "assistant",
            content: [{ type: "thinking", thinking: "internal reasoning..." }],
            usage: { inputTokens: 10, outputTokens: 5 },
          },
          {
            index: 1,
            role: "assistant",
            content: [{ type: "text", text: "Visible output" }],
            usage: { inputTokens: 20, outputTokens: 10 },
          },
        ],
      });
      const q = new TraceQuery(trace);
      const lines = q.timeline();

      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0].includes("Visible output"));
    });
  });

  describe("stats", () => {
    test("aggregates token totals", () => {
      const q = new TraceQuery(buildTrace());
      const s = q.stats();

      assert.ok(s.totals.inputTokens > 0);
      assert.ok(s.totals.outputTokens > 0);
      assert.ok(s.totals.cacheReadInputTokens > 0);
      assert.strictEqual(s.totals.totalCostUsd, 0.0523);
    });

    test("totals prefer result-event usage over per-turn sums", () => {
      const trace = buildTrace({
        summary: {
          tokenUsage: {
            inputTokens: 9446,
            outputTokens: 11298,
            cacheReadInputTokens: 649855,
            cacheCreationInputTokens: 4321,
          },
        },
      });
      const s = new TraceQuery(trace).stats();

      assert.strictEqual(s.totals.inputTokens, 9446);
      assert.strictEqual(s.totals.outputTokens, 11298);
      assert.strictEqual(s.totals.cacheReadInputTokens, 649855);
      assert.strictEqual(s.totals.cacheCreationInputTokens, 4321);
      // Per-turn breakdown still reflects per-turn figures.
      assert.strictEqual(s.perTurn[0].inputTokens, 100);
    });

    test("includes per-turn breakdown", () => {
      const q = new TraceQuery(buildTrace());
      const s = q.stats();

      // 6 assistant turns have usage (indexes 0,1,3,5,7,9)
      assert.strictEqual(s.perTurn.length, 6);
      assert.strictEqual(s.perTurn[0].index, 0);
      assert.strictEqual(s.perTurn[0].inputTokens, 100);
    });
  });
});
