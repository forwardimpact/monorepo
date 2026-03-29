import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TraceCollector, createTraceCollector } from "@forwardimpact/libtrace";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures", "stream.ndjson");

/**
 * Load fixture lines from the NDJSON file.
 * @returns {string[]}
 */
function loadFixture() {
  return fs.readFileSync(fixturePath, "utf8").trim().split("\n");
}

/**
 * Feed all fixture lines into a collector and return it.
 * @returns {TraceCollector}
 */
function collectFixture() {
  const collector = new TraceCollector();
  for (const line of loadFixture()) {
    collector.addLine(line);
  }
  return collector;
}

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
  });

  describe("toJSON", () => {
    test("produces complete trace from fixture", () => {
      const collector = collectFixture();
      const trace = collector.toJSON();

      assert.strictEqual(trace.version, "1.0.0");
      assert.strictEqual(trace.metadata.sessionId, "abc-123");
      assert.strictEqual(trace.metadata.model, "claude-opus-4-6");
      assert.strictEqual(trace.metadata.claudeCodeVersion, "2.1.87");
      assert.strictEqual(trace.metadata.tools.length, 6);
      assert.ok(trace.turns.length > 0);
      assert.strictEqual(trace.summary.result, "success");
      assert.strictEqual(trace.summary.totalCostUsd, 0.0523);
      assert.strictEqual(trace.summary.numTurns, 3);
    });

    test("assigns sequential turn indexes", () => {
      const collector = collectFixture();
      const trace = collector.toJSON();

      trace.turns.forEach((turn, i) => {
        assert.strictEqual(turn.index, i);
      });
    });

    test("returns defaults for empty input", () => {
      const collector = new TraceCollector();
      const trace = collector.toJSON();

      assert.strictEqual(trace.version, "1.0.0");
      assert.strictEqual(trace.metadata.sessionId, null);
      assert.strictEqual(trace.turns.length, 0);
      assert.strictEqual(trace.summary.result, "unknown");
    });
  });

  describe("toText", () => {
    test("includes assistant text content", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(
        text.includes("I'll start by checking the repository structure"),
      );
      assert.ok(text.includes("No security issues found"));
    });

    test("includes tool call summaries", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("> Tool: Bash"));
      assert.ok(text.includes("ls -la"));
    });

    test("includes result summary line", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("--- Result: success"));
      assert.ok(text.includes("Turns: 3"));
      assert.ok(text.includes("Cost: $0.0523"));
      assert.ok(text.includes("Duration: 5s"));
    });

    test("returns empty string for empty input", () => {
      const collector = new TraceCollector();
      const text = collector.toText();

      assert.strictEqual(text, "");
    });
  });

  describe("createTraceCollector", () => {
    test("returns a TraceCollector instance", () => {
      const collector = createTraceCollector();
      assert.ok(collector instanceof TraceCollector);
    });
  });
});
