import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TraceCollector } from "@forwardimpact/libharness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures", "stream.ndjson");

function collectFixture() {
  const collector = new TraceCollector();
  for (const line of fs.readFileSync(fixturePath, "utf8").trim().split("\n")) {
    collector.addLine(line);
  }
  return collector;
}

describe("TraceCollector v1.2 schema expansion", () => {
  describe("system turns", () => {
    test("stores init as a system turn with full payload", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "system",
          subtype: "init",
          session_id: "sess-init",
          cwd: "/home/user/monorepo",
          agents: ["staff-engineer"],
          memory_paths: ["wiki/staff-engineer.md"],
          slash_commands: ["/review"],
          model: "claude-opus-4-6",
          tools: ["Bash"],
        }),
      );

      const trace = collector.toJSON();
      const systemTurn = trace.turns.find((t) => t.role === "system");
      assert.ok(systemTurn, "expected a system turn");
      assert.strictEqual(systemTurn.subtype, "init");
      assert.deepStrictEqual(systemTurn.data.agents, ["staff-engineer"]);
      assert.strictEqual(systemTurn.data.cwd, "/home/user/monorepo");
      assert.strictEqual(systemTurn.data.type, undefined);
    });

    test("stores non-init system events as system turns", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "system",
          subtype: "hook",
          hook_name: "pre-tool",
          tool: "Bash",
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 1);
      assert.strictEqual(trace.turns[0].role, "system");
      assert.strictEqual(trace.turns[0].subtype, "hook");
      assert.strictEqual(trace.turns[0].data.hook_name, "pre-tool");
      assert.strictEqual(trace.turns[0].data.tool, "Bash");
      // Non-init system events must not populate init metadata.
      assert.strictEqual(trace.metadata.sessionId, null);
      assert.strictEqual(trace.metadata.model, null);
      assert.strictEqual(trace.initEvent, null);
    });
  });

  describe("initEvent top-level field", () => {
    test("exposes full init event as top-level initEvent field", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "system",
          subtype: "init",
          session_id: "sess-init",
          cwd: "/home/user/monorepo",
          agents: ["staff-engineer"],
          memory_paths: ["wiki/staff-engineer.md"],
          slash_commands: ["/review"],
          model: "claude-opus-4-6",
          tools: ["Bash"],
        }),
      );

      const trace = collector.toJSON();
      assert.ok(trace.initEvent);
      assert.strictEqual(trace.initEvent.subtype, "init");
      assert.deepStrictEqual(trace.initEvent.agents, ["staff-engineer"]);
      assert.deepStrictEqual(trace.initEvent.memory_paths, [
        "wiki/staff-engineer.md",
      ]);
      assert.strictEqual(trace.initEvent.type, undefined);
    });

    test("initEvent is null when no init event seen", () => {
      const collector = new TraceCollector();
      const trace = collector.toJSON();
      assert.strictEqual(trace.initEvent, null);
    });
  });

  describe("assistant message identity", () => {
    test("assistant turns carry the API message id", () => {
      const trace = collectFixture().toJSON();
      const assistant = trace.turns.filter((t) => t.role === "assistant");
      assert.ok(assistant.length > 0);
      assert.strictEqual(assistant[0].messageId, "msg_01");
    });
  });

  describe("user turns", () => {
    test("stores user text messages as user turns", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "text", text: "Run the security audit and report." },
            ],
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 1);
      assert.strictEqual(trace.turns[0].role, "user");
      assert.deepStrictEqual(trace.turns[0].content, [
        { type: "text", text: "Run the security audit and report." },
      ]);
    });

    test("user event with both text and tool_result produces both turns", () => {
      const collector = new TraceCollector();
      collector.addLine(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "text", text: "Follow-up instruction." },
              {
                type: "tool_result",
                tool_use_id: "toolu_01",
                content: "output",
              },
            ],
          },
        }),
      );

      const trace = collector.toJSON();
      assert.strictEqual(trace.turns.length, 2);
      assert.strictEqual(trace.turns[0].role, "user");
      assert.strictEqual(trace.turns[0].index, 0);
      assert.strictEqual(trace.turns[1].role, "tool_result");
      assert.strictEqual(trace.turns[1].index, 1);
    });
  });

  describe("toText rendering for new roles", () => {
    test("renders system turns with their subtype label", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("[init]"));
      assert.ok(text.includes("[hook]"));
    });

    test("renders user text with [user] prefix", () => {
      const collector = collectFixture();
      const text = collector.toText();

      assert.ok(text.includes("[user] Check the repository"));
    });
  });

  describe("modelUsage additive merge across result events", () => {
    test("sums additive fields and carries non-additive first-seen", () => {
      const collector = new TraceCollector();
      const result = (cost, inTok, contextWindow) =>
        JSON.stringify({
          type: "result",
          subtype: "success",
          total_cost_usd: cost,
          modelUsage: {
            "claude-opus-4-x": {
              inputTokens: inTok,
              outputTokens: 10,
              costUSD: cost,
              contextWindow,
            },
          },
        });
      collector.addLine(result(1.0, 100, 200000));
      collector.addLine(result(2.0, 50, 999999));

      const mu = collector.toJSON().summary.modelUsage["claude-opus-4-x"];
      // Additive fields sum.
      assert.strictEqual(mu.inputTokens, 150);
      assert.strictEqual(mu.outputTokens, 20);
      assert.strictEqual(mu.costUSD, 3.0);
      // Non-additive field carried first-seen, never summed.
      assert.strictEqual(mu.contextWindow, 200000);
    });
  });
});
