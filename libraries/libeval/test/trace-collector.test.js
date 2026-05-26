import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TraceCollector, createTraceCollector } from "@forwardimpact/libeval";

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

  describe("toJSON", () => {
    test("produces complete trace from fixture", () => {
      const collector = collectFixture();
      const trace = collector.toJSON();

      assert.strictEqual(trace.version, "1.1.0");
      assert.strictEqual(trace.metadata.sessionId, "abc-123");
      assert.strictEqual(trace.metadata.model, "claude-opus-4-6");
      assert.strictEqual(trace.metadata.claudeCodeVersion, "2.1.87");
      assert.strictEqual(trace.metadata.tools.length, 6);
      assert.ok(trace.turns.length > 0);
      assert.ok(trace.initEvent);
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

      assert.strictEqual(trace.version, "1.1.0");
      assert.strictEqual(trace.metadata.sessionId, null);
      assert.strictEqual(trace.initEvent, null);
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

    test("includes tool call lines in the new `<Tool>: <hint>` shape", () => {
      const collector = collectFixture();
      const text = collector.toText();

      // Tool-call lines pair the tool name with a colon and the
      // sanitized hint — no leading marker, no JSON punctuation.
      assert.ok(text.includes("Bash: ls -la"));
      assert.ok(!text.includes("> Bash"));
      assert.ok(!text.includes("{"));
    });

    test("successful tool_result emits no preview line", () => {
      const collector = collectFixture();
      const text = collector.toText();

      // The fixture's tool_result is a success (`total 42\n...`). Per the
      // updated rendering rule, successful tool results are silently dropped
      // from text output — only `Error:` lines remain. The trailing
      // `--- Result: <verdict> ---` footer is a different shape.
      const previewLines = text
        .split("\n")
        .filter(
          (l) =>
            (l.startsWith("Result:") || l.includes(": Result:")) &&
            !l.startsWith("---"),
        );
      assert.deepStrictEqual(previewLines, []);
      assert.ok(!text.includes("Result: total 42"));
    });

    test("failing tool_result emits an Error: preview line", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Read",
                input: { file_path: "/nope" },
              },
            ],
          },
        }),
      );
      collector.addLine(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t1",
                is_error: true,
                content: "ENOENT: no such file",
              },
            ],
          },
        }),
      );

      const text = collector.toText();
      assert.ok(text.includes("Error: ENOENT: no such file"));
    });

    test("includes result summary line", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("--- Result: success"));
      assert.ok(text.includes("Turns: 3"));
      assert.ok(text.includes("Cost: $0.0523"));
      assert.ok(text.includes("Duration: 5s"));
    });

    test("orchestrator verdict overrides SDK subtype in result footer", () => {
      const collector = collectFixture();
      // After fixture replay the SDK reported subtype=success. Inject an
      // orchestrator summary with verdict=failure (the supervisor judged
      // the agent failed) and verify the footer reflects the verdict.
      collector.addLine(
        JSON.stringify({
          source: "orchestrator",
          seq: 99,
          event: {
            type: "summary",
            success: false,
            verdict: "failure",
            turns: 2,
            summary: "Agent did not query MCP tools.",
          },
        }),
      );

      const text = collector.toText();
      assert.ok(text.includes("--- Result: failure"));
      assert.ok(!text.includes("--- Result: success"));
    });

    test("truncates long tool input hints", () => {
      const collector = new TraceCollector();
      const longCommand = "x".repeat(300);
      collector.addLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Bash",
                input: { command: longCommand },
              },
            ],
          },
        }),
      );

      const text = collector.toText();
      // New shape: `Bash: <hint>` where the hint is truncated with `...`.
      // We look for the hint ending (strip ANSI first so the escape bytes
      // don't inflate the visible length).
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR stripping is intentional.
      const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
      const toolLine = plain.split("\n").find((l) => l.startsWith("Bash:"));
      assert.ok(toolLine, "expected a `Bash:` line");
      assert.ok(toolLine.includes("..."));
      // Full 300-char command must not survive unchanged.
      assert.ok(toolLine.length < 100);
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

    test("accepts injectable clock for deterministic timestamps", () => {
      const fixedTime = "2026-01-01T00:00:00Z";
      const collector = createTraceCollector({ now: () => fixedTime });
      const trace = collector.toJSON();

      assert.strictEqual(trace.metadata.timestamp, fixedTime);
    });
  });
});
