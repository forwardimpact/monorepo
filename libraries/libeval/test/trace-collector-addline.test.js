import { describe, test } from "node:test";
import assert from "node:assert";

import { TraceCollector } from "@forwardimpact/libeval";

describe("TraceCollector", () => {
  describe("addLine", () => {
    test("extracts metadata from system init event", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "system",
          subtype: "init",
          session_id: "sess-1",
          model: "claude-opus-4-6",
          claude_code_version: "2.1.87",
          tools: ["Bash", "Read"],
          permissionMode: "default",
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.metadata.sessionId, "sess-1");
      assert.strictEqual(trace.metadata.model, "claude-opus-4-6");
      assert.strictEqual(trace.metadata.claudeCodeVersion, "2.1.87");
      assert.deepStrictEqual(trace.metadata.tools, ["Bash", "Read"]);
    });

    test("collects assistant text turns", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello world" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 1);
      assert.strictEqual(trace.turns[0].role, "assistant");
      assert.strictEqual(trace.turns[0].content[0].text, "Hello world");
      assert.strictEqual(trace.turns[0].usage.inputTokens, 10);
    });

    test("collects assistant tool_use turns", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "toolu_01",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns[0].content[0].type, "tool_use");
      assert.strictEqual(trace.turns[0].content[0].name, "Bash");
      assert.strictEqual(trace.turns[0].content[0].toolUseId, "toolu_01");
    });

    test("collects tool_result from user events", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01",
                content: "file listing output",
              },
            ],
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 1);
      assert.strictEqual(trace.turns[0].role, "tool_result");
      assert.strictEqual(trace.turns[0].toolUseId, "toolu_01");
      assert.strictEqual(trace.turns[0].content, "file listing output");
    });

    test("extracts summary from result event", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          total_cost_usd: 1.23,
          duration_ms: 45000,
          num_turns: 12,
          usage: {
            input_tokens: 5000,
            output_tokens: 2000,
            cache_read_input_tokens: 3000,
            cache_creation_input_tokens: 1000,
          },
          modelUsage: { "claude-opus-4-6": { costUSD: 1.23 } },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.summary.result, "success");
      assert.strictEqual(trace.summary.totalCostUsd, 1.23);
      assert.strictEqual(trace.summary.durationMs, 45000);
      assert.strictEqual(trace.summary.numTurns, 12);
      assert.strictEqual(trace.summary.tokenUsage.inputTokens, 5000);
    });

    test("accumulates summary across multiple result events", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: true,
          total_cost_usd: 1.0,
          duration_ms: 1000,
          num_turns: 3,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 1000,
            cache_creation_input_tokens: 10,
          },
        }),
      );
      collector.addLine(
        JSON.stringify({
          type: "result",
          subtype: "error_max_turns",
          is_error: false,
          total_cost_usd: 2.5,
          duration_ms: 2000,
          num_turns: 4,
          usage: {
            input_tokens: 200,
            output_tokens: 70,
            cache_read_input_tokens: 3000,
            cache_creation_input_tokens: 20,
          },
        }),
      );

      const summary = collector.toJSON().summary;
      assert.strictEqual(summary.result, "error_max_turns");
      assert.strictEqual(summary.isError, true);
      assert.strictEqual(summary.totalCostUsd, 3.5);
      assert.strictEqual(summary.durationMs, 3000);
      assert.strictEqual(summary.numTurns, 7);
      assert.deepStrictEqual(summary.tokenUsage, {
        inputTokens: 300,
        outputTokens: 120,
        cacheReadInputTokens: 4000,
        cacheCreationInputTokens: 30,
      });
    });

    test("carries usage through a result event without usage", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "result",
          subtype: "success",
          total_cost_usd: 1.0,
          duration_ms: 1000,
          num_turns: 3,
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      );
      collector.addLine(
        JSON.stringify({
          type: "result",
          subtype: "success",
          total_cost_usd: 0.5,
          duration_ms: 500,
          num_turns: 1,
        }),
      );

      const summary = collector.toJSON().summary;
      assert.strictEqual(summary.totalCostUsd, 1.5);
      assert.strictEqual(summary.tokenUsage.inputTokens, 100);
      assert.strictEqual(summary.tokenUsage.outputTokens, 50);
    });

    test("unwraps combined supervised trace format {source, seq, event}", () => {
      const collector = new TraceCollector();

      // System init wrapped in supervisor envelope
      collector.addLine(
        JSON.stringify({
          source: "agent",
          seq: 0,
          event: {
            type: "system",
            subtype: "init",
            session_id: "sess-supervised",
            model: "claude-opus-4-6",
            tools: ["Bash"],
          },
        }),
      );

      // Assistant message wrapped in supervisor envelope
      collector.addLine(
        JSON.stringify({
          source: "agent",
          seq: 1,
          event: {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "I ran the tests." }],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          },
        }),
      );

      // Tool result wrapped in supervisor envelope
      collector.addLine(
        JSON.stringify({
          source: "agent",
          seq: 2,
          event: {
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "toolu_sup",
                  content: "All tests passed",
                },
              ],
            },
          },
        }),
      );

      // Result event wrapped in supervisor envelope
      collector.addLine(
        JSON.stringify({
          source: "supervisor",
          seq: 3,
          event: {
            type: "result",
            subtype: "success",
            total_cost_usd: 0.44,
            duration_ms: 30000,
            num_turns: 2,
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.metadata.sessionId, "sess-supervised");
      // init now always produces a system turn → assistant + tool_result + system = 3
      assert.strictEqual(trace.turns.length, 3);
      assert.strictEqual(trace.turns[0].role, "system");
      assert.strictEqual(trace.turns[0].subtype, "init");
      assert.strictEqual(trace.turns[0].source, "agent");
      assert.strictEqual(trace.turns[1].role, "assistant");
      assert.strictEqual(trace.turns[1].content[0].text, "I ran the tests.");
      assert.strictEqual(trace.turns[2].role, "tool_result");
      assert.strictEqual(trace.turns[2].content, "All tests passed");
      assert.strictEqual(trace.summary.result, "success");
      assert.strictEqual(trace.summary.totalCostUsd, 0.44);
    });

    test("skips orchestrator summary lines from supervised traces", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          source: "orchestrator",
          seq: 99,
          event: { type: "summary", success: true, turns: 3 },
        }),
      );

      // Orchestrator summaries unwrap to { type: "summary" } which
      // hits the default case — silently skipped.
      assert.strictEqual(collector.toJSON().turns.length, 0);
    });

    test("skips rate_limit_event and unknown types", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} }),
      );
      collector.addLine(JSON.stringify({ type: "unknown_event" }));

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 0);
    });

    test("skips malformed JSON lines", () => {
      const collector = new TraceCollector();
      collector.addLine("not valid json {{{");
      collector.addLine("");
      collector.addLine("   ");

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 0);
    });

    test("skips assistant event with missing message", () => {
      const collector = new TraceCollector();
      collector.addLine(JSON.stringify({ type: "assistant" }));
      collector.addLine(JSON.stringify({ type: "assistant", message: null }));

      assert.strictEqual(collector.toJSON().turns.length, 0);
    });

    test("skips user event with non-array content", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "plain string" },
        }),
      );
      collector.addLine(
        JSON.stringify({ type: "user", message: { role: "user" } }),
      );
      collector.addLine(JSON.stringify({ type: "user" }));

      assert.strictEqual(collector.toJSON().turns.length, 0);
    });

    test("uses event timestamp when present in system init", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "system",
          subtype: "init",
          timestamp: "2026-01-15T10:00:00Z",
          session_id: "sess-ts",
        }),
      );

      assert.strictEqual(
        collector.toJSON().metadata.timestamp,
        "2026-01-15T10:00:00Z",
      );
    });
  });
});
