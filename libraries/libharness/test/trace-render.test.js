import { describe, test } from "node:test";
import assert from "node:assert";

import {
  renderToolCalls,
  renderCommands,
  renderPaths,
  renderCompare,
  renderStatsByTool,
  renderStatsSummary,
  renderSearch,
  renderDefault,
} from "../src/trace-render.js";

describe("trace-render", () => {
  test("renderToolCalls emits (no result) for orphans", () => {
    const text = renderToolCalls(
      [
        {
          turnIndex: 1,
          name: "Bash",
          toolUseId: "t1",
          input: { command: "ls" },
          result: { content: "ok", isError: false },
        },
        {
          turnIndex: 3,
          name: "Bash",
          toolUseId: "t2",
          input: { command: "pwd" },
          result: null,
        },
      ],
      { multi: false },
    );
    assert.match(text, /\[1\] Bash t1/);
    assert.match(text, /out: ok/);
    assert.match(text, /out: \(no result\)/);
  });

  test("renderCommands escapes newlines and prefixes source when multi", () => {
    const text = renderCommands(
      [{ turnIndex: 2, command: "echo a\nb", source: "x.ndjson" }],
      { multi: true },
    );
    assert.strictEqual(text, "x.ndjson:[2] echo a b");
  });

  test("renderPaths emits count\\tpath, no prefix single-file", () => {
    const text = renderPaths(
      [
        { path: "/a", count: 3 },
        { path: "/b", count: 1 },
      ],
      { multi: false },
    );
    assert.strictEqual(text, "3\t/a\n1\t/b");
  });

  test("renderCompare prints (none) for null participant", () => {
    const text = renderCompare({
      a: {
        metadata: { caseName: "ca", participant: "alice" },
        turnCount: 5,
        tools: ["Bash"],
        paths: ["/p"],
        pathCount: 1,
        cost: 0.01,
      },
      b: {
        metadata: { caseName: "cb", participant: null, marker: "(empty)" },
        turnCount: 0,
        tools: [],
        paths: [],
        pathCount: 0,
        cost: 0,
      },
      toolDelta: [{ tool: "Bash", a: 1, b: 0, diff: -1 }],
      pathDelta: [{ path: "/p", a: 1, b: 0, diff: -1 }],
    });
    assert.match(text, /A: ca \/ alice/);
    assert.match(text, /B: cb \/ \(none\) \(empty\)/);
    assert.match(text, /Tool \| A \| B \| Δ/);
    assert.match(text, /Bash \| 1 \| 0 \| -1/);
  });

  test("renderStatsByTool emits a header and share column", () => {
    const text = renderStatsByTool({
      perTool: [
        {
          tool: "Bash",
          turns: 2,
          inputTokens: 100,
          outputTokens: 20,
          costShare: 1.0,
        },
      ],
      totals: {},
    });
    assert.match(text, /Tool \| Turns \| In \| Out \| Share/);
    assert.match(text, /Bash \| 2 \| 100 \| 20 \| 1.0000/);
  });

  test("renderStatsSummary emits totals lines", () => {
    const text = renderStatsSummary({
      totals: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 0,
        totalCostUsd: 0.01,
        durationMs: 500,
      },
    });
    assert.match(text, /inputTokens: 100/);
    assert.match(text, /totalCostUsd: 0.01/);
  });

  test("renderSearch emits one line per match", () => {
    const text = renderSearch(
      [{ turn: { index: 4 }, matches: ["text: hello", "result: world"] }],
      { multi: false },
    );
    assert.strictEqual(text, "[4] text: hello\n[4] result: world");
  });

  test("renderDefault emits key: value lines, drops source, no JSON braces", () => {
    const text = renderDefault([{ a: 1, b: { c: 2 }, source: "x.ndjson" }], {
      multi: false,
    });
    assert.strictEqual(text, 'a: 1\nb: {"c":2}');
    // Top-level output must not parse as JSON (criterion 5).
    assert.throws(() => JSON.parse(text));
  });

  test("renderDefault prefixes source groups with # header when multi", () => {
    const text = renderDefault(
      [
        { a: 1, source: "x.ndjson" },
        { a: 2, source: "y.ndjson" },
      ],
      { multi: true },
    );
    assert.strictEqual(text, "# x.ndjson\na: 1\n# y.ndjson\na: 2");
  });
});
