import { describe, test } from "node:test";
import assert from "node:assert";

import { TraceQuery } from "@forwardimpact/libharness";

/**
 * Minimal structured trace factory for v1.1 query tests. Overrides let
 * individual tests supply only the fields they exercise.
 * @param {object} [overrides]
 * @returns {object}
 */
function buildTrace(overrides = {}) {
  return {
    version: overrides.version ?? "1.1.0",
    metadata: {
      timestamp: "2026-01-01T00:00:00Z",
      sessionId: "test-session",
      model: "claude-opus-4-6",
      claudeCodeVersion: "2.1.87",
      tools: ["Bash", "Read", "Edit"],
      permissionMode: "default",
      ...overrides.metadata,
    },
    initEvent: overrides.initEvent ?? null,
    turns: overrides.turns ?? [],
    summary: overrides.summary ?? {
      result: "success",
      isError: false,
      totalCostUsd: 0,
      durationMs: 0,
      numTurns: 0,
      tokenUsage: null,
      modelUsage: null,
    },
  };
}

function mixedTurns() {
  return [
    { index: 0, role: "system", subtype: "init", data: { cwd: "/repo" } },
    {
      index: 1,
      role: "user",
      content: [{ type: "text", text: "Task prompt." }],
    },
    {
      index: 2,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          toolUseId: "t1",
          name: "Bash",
          input: { command: "ls" },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    },
    {
      index: 3,
      role: "tool_result",
      toolUseId: "t1",
      content: "ok",
      isError: false,
    },
    {
      index: 4,
      role: "assistant",
      content: [
        {
          type: "tool_use",
          toolUseId: "t2",
          name: "Read",
          input: { file_path: "/x" },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    },
    {
      index: 5,
      role: "tool_result",
      toolUseId: "t2",
      content: "Error: not found",
      isError: true,
    },
  ];
}

describe("TraceQuery v1.1 introspection", () => {
  describe("overview taskPrompt", () => {
    test("includes taskPrompt from the first user turn", () => {
      const q = new TraceQuery(
        buildTrace({
          turns: [
            {
              index: 0,
              role: "user",
              content: [{ type: "text", text: "Run the security audit." }],
            },
          ],
        }),
      );
      assert.strictEqual(q.overview().taskPrompt, "Run the security audit.");
    });

    test("taskPrompt is null when no user turn exists", () => {
      const q = new TraceQuery(
        buildTrace({
          turns: [
            {
              index: 0,
              role: "assistant",
              content: [{ type: "text", text: "Go." }],
              usage: { inputTokens: 1, outputTokens: 1 },
            },
          ],
        }),
      );
      assert.strictEqual(q.overview().taskPrompt, null);
    });
  });

  describe("init()", () => {
    test("returns the full init event", () => {
      const initEvent = {
        subtype: "init",
        cwd: "/home/user/monorepo",
        agents: ["staff-engineer"],
        memory_paths: ["wiki/staff-engineer.md"],
      };
      const q = new TraceQuery(buildTrace({ initEvent }));
      assert.deepStrictEqual(q.init(), initEvent);
    });

    test("returns null for v1.0.0 traces without initEvent", () => {
      const q = new TraceQuery(buildTrace({ version: "1.0.0" }));
      assert.strictEqual(q.init(), null);
    });
  });

  describe("turn(index)", () => {
    test("returns the turn matching the given index", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const t = q.turn(3);
      assert.ok(t);
      assert.strictEqual(t.index, 3);
      assert.strictEqual(t.role, "tool_result");
    });

    test("returns null when no turn matches", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      assert.strictEqual(q.turn(999), null);
    });
  });

  describe("filter(opts)", () => {
    test("filters by role", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const users = q.filter({ role: "user" });
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].index, 1);
    });

    test("filters by toolName across assistant turns", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const bash = q.filter({ toolName: "Bash" });
      assert.strictEqual(bash.length, 1);
      assert.strictEqual(bash[0].role, "assistant");
      assert.strictEqual(bash[0].content[0].name, "Bash");
    });

    test("filters by isError for tool_result turns", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const errs = q.filter({ isError: true });
      assert.strictEqual(errs.length, 1);
      assert.strictEqual(errs[0].index, 5);
      assert.strictEqual(errs[0].isError, true);
    });

    test("composes criteria as AND", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const errs = q.filter({ role: "tool_result", isError: true });
      assert.strictEqual(errs.length, 1);
      assert.strictEqual(errs[0].index, 5);
    });

    test("composes role + toolName (assistant turns only)", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const hits = q.filter({ role: "assistant", toolName: "Bash" });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0].index, 2);
      assert.strictEqual(hits[0].content[0].name, "Bash");
    });

    test("toolName + isError returns empty (documented limitation)", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const result = q.filter({ toolName: "Bash", isError: true });
      assert.strictEqual(result.length, 0);
    });

    test("returns all turns when no criteria given", () => {
      const turns = mixedTurns();
      const q = new TraceQuery(buildTrace({ turns }));
      assert.strictEqual(q.filter().length, turns.length);
    });
  });

  describe("head with new roles", () => {
    test("returns system and user turns when present", () => {
      const q = new TraceQuery(buildTrace({ turns: mixedTurns() }));
      const h = q.head(2);
      assert.strictEqual(h.length, 2);
      assert.strictEqual(h[0].role, "system");
      assert.strictEqual(h[1].role, "user");
    });
  });

  describe("search over user turns + --full", () => {
    test("matches user turn text with user_text prefix", () => {
      const q = new TraceQuery(
        buildTrace({
          turns: [
            {
              index: 0,
              role: "user",
              content: [
                { type: "text", text: "Investigate the searchable bug." },
              ],
            },
          ],
        }),
      );
      const results = q.search("searchable");
      assert.strictEqual(results.length, 1);
      assert.ok(results[0].matches[0].startsWith("user_text:"));
    });

    test("full option emits full content block text", () => {
      const longText = "Start " + "x ".repeat(80) + "TARGET " + "y ".repeat(80);
      const q = new TraceQuery(
        buildTrace({
          turns: [
            {
              index: 0,
              role: "assistant",
              content: [{ type: "text", text: longText }],
              usage: { inputTokens: 10, outputTokens: 5 },
            },
          ],
        }),
      );
      const results = q.search("TARGET", { full: true });
      assert.strictEqual(results.length, 1);
      const description = results[0].matches[0];
      assert.ok(description.includes(longText));
      assert.ok(!description.includes("..."));
    });

    test("default excerpt mode truncates long content", () => {
      const longText = "Start " + "x ".repeat(80) + "TARGET " + "y ".repeat(80);
      const q = new TraceQuery(
        buildTrace({
          turns: [
            {
              index: 0,
              role: "assistant",
              content: [{ type: "text", text: longText }],
              usage: { inputTokens: 10, outputTokens: 5 },
            },
          ],
        }),
      );
      const results = q.search("TARGET");
      assert.strictEqual(results.length, 1);
      assert.ok(results[0].matches[0].includes("..."));
    });
  });
});
