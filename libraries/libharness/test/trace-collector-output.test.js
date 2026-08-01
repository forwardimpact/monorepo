import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TraceCollector,
  createTraceCollector,
} from "@forwardimpact/libharness";

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
  describe("toJSON", () => {
    test("produces a complete trace from the fixture", () => {
      const collector = collectFixture();
      const trace = collector.toJSON();

      assert.strictEqual(trace.version, "1.2.0");
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

      assert.strictEqual(trace.version, "1.2.0");
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
      // sanitized hint. They carry no leading marker and no JSON
      // punctuation.
      assert.ok(text.includes("Bash: ls -la"));
      assert.ok(!text.includes("> Bash"));
      assert.ok(!text.includes("{"));
    });

    test("successful tool_result emits no preview line", () => {
      const collector = collectFixture();
      const text = collector.toText();

      // The fixture's tool_result is a success (`total 42\n...`). The
      // updated render rule silently drops successful tool results from the
      // text output. Only `Error:` lines remain. The trailing
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

    test("a failed tool_result emits an Error: preview line", () => {
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

    test("includes the result summary line", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("--- Result: success"));
      assert.ok(text.includes("Turns: 3"));
      assert.ok(text.includes("Cost: $0.0523"));
      assert.ok(text.includes("Duration: 5s"));
    });

    test("orchestrator verdict overrides the SDK subtype in the result footer", () => {
      const collector = collectFixture();
      // After fixture replay the SDK reported subtype=success. Inject an
      // orchestrator summary with verdict=failure. The supervisor judged
      // that the agent failed. Verify the footer reflects the verdict.
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
      // New shape: `Bash: <hint>` where `...` truncates the hint. Look for
      // the end of the hint. Strip ANSI first so the escape bytes do not
      // inflate the visible length.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR stripping is intentional.
      const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
      const toolLine = plain.split("\n").find((l) => l.startsWith("Bash:"));
      assert.ok(toolLine, "expected a `Bash:` line");
      assert.ok(toolLine.includes("..."));
      // The full 300-char command must not survive unchanged.
      assert.ok(toolLine.length < 100);
    });

    test("returns an empty string for empty input", () => {
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

    test("accepts an injectable clock for deterministic timestamps", () => {
      const fixedTime = "2026-01-01T00:00:00Z";
      const collector = createTraceCollector({ now: () => fixedTime });
      const trace = collector.toJSON();

      assert.strictEqual(trace.metadata.timestamp, fixedTime);
    });
  });
});
