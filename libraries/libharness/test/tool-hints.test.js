import { describe, test } from "node:test";
import assert from "node:assert";

import {
  hintForCall,
  previewForResult,
  simplifyToolName,
} from "../src/render/tool-hints.js";

/**
 * Assert a hint contains no `{`, `}`, or `"` characters — success criterion #2,
 * which applies to non-MCP tools only. MCP tools intentionally render full
 * single-line JSON and DO contain `{` and `"`.
 * @param {string} hint
 */
function assertNoJsonPunctuation(hint) {
  assert.ok(!hint.includes("{"), `hint contained '{': ${JSON.stringify(hint)}`);
  assert.ok(!hint.includes("}"), `hint contained '}': ${JSON.stringify(hint)}`);
  assert.ok(!hint.includes('"'), `hint contained '"': ${JSON.stringify(hint)}`);
}

describe("hintForCall", () => {
  test("Bash — renders command", () => {
    const hint = hintForCall("Bash", { command: "git status" });
    assert.strictEqual(hint, "git status");
    assertNoJsonPunctuation(hint);
  });

  test('Bash — strips embedded quotes (echo "hi" -> echo hi)', () => {
    const hint = hintForCall("Bash", { command: 'echo "hi there"' });
    assertNoJsonPunctuation(hint);
    assert.strictEqual(hint, "echo hi there");
  });

  test("Bash — collapses multi-line command to one line", () => {
    const hint = hintForCall("Bash", {
      command: "line one\nline two\nline three",
    });
    assert.strictEqual(hint, "line one");
  });

  test("Bash — truncates long commands", () => {
    const hint = hintForCall("Bash", { command: "x".repeat(500) });
    assert.ok(hint.length <= 80);
    assert.ok(hint.endsWith("..."));
  });

  test("Read — renders file_path", () => {
    const hint = hintForCall("Read", { file_path: "/tmp/notes.md" });
    assert.strictEqual(hint, "/tmp/notes.md");
  });

  test("Write — renders file_path", () => {
    const hint = hintForCall("Write", {
      file_path: "/tmp/out.txt",
      content: "hi",
    });
    assert.strictEqual(hint, "/tmp/out.txt");
    assertNoJsonPunctuation(hint);
  });

  test("Edit — renders file_path alone", () => {
    const hint = hintForCall("Edit", {
      file_path: "/tmp/f.js",
      old_string: 'const a = "b"',
      new_string: 'const a = "c"',
    });
    assert.strictEqual(hint, "/tmp/f.js");
    assertNoJsonPunctuation(hint);
  });

  test("Edit — appends (replace_all) when set", () => {
    const hint = hintForCall("Edit", {
      file_path: "/tmp/f.js",
      old_string: "x",
      new_string: "y",
      replace_all: true,
    });
    assert.strictEqual(hint, "/tmp/f.js (replace_all)");
  });

  test("Glob — renders pattern", () => {
    const hint = hintForCall("Glob", { pattern: "**/*.md" });
    assert.strictEqual(hint, "**/*.md");
  });

  test("Grep — renders pattern alone", () => {
    const hint = hintForCall("Grep", { pattern: "TODO" });
    assert.strictEqual(hint, "TODO");
  });

  test("Grep — appends in <path> when path is set", () => {
    const hint = hintForCall("Grep", { pattern: "TODO", path: "libraries/" });
    assert.strictEqual(hint, "TODO in libraries/");
  });

  test("WebFetch — renders url", () => {
    const hint = hintForCall("WebFetch", {
      url: "https://example.com",
      prompt: "summarise",
    });
    assert.strictEqual(hint, "https://example.com");
  });

  test("WebSearch — renders query", () => {
    const hint = hintForCall("WebSearch", { query: "ansi sgr codes" });
    assert.strictEqual(hint, "ansi sgr codes");
  });

  test("ToolSearch — renders query", () => {
    const hint = hintForCall("ToolSearch", { query: "notebook" });
    assert.strictEqual(hint, "notebook");
  });

  test("TodoWrite — renders count", () => {
    const hint = hintForCall("TodoWrite", {
      todos: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    assert.strictEqual(hint, "3 todos");
  });

  test("TodoWrite — zero todos is still rendered as count", () => {
    const hint = hintForCall("TodoWrite", { todos: [] });
    assert.strictEqual(hint, "0 todos");
  });

  test("NotebookEdit — renders notebook_path", () => {
    const hint = hintForCall("NotebookEdit", {
      notebook_path: "/notebooks/a.ipynb",
    });
    assert.strictEqual(hint, "/notebooks/a.ipynb");
  });

  test("Skill — renders skill name", () => {
    const hint = hintForCall("Skill", { skill: "kata-design" });
    assert.strictEqual(hint, "kata-design");
  });

  test("Agent — renders prompt", () => {
    const hint = hintForCall("Agent", { prompt: "Review this PR" });
    assert.strictEqual(hint, "Review this PR");
  });

  test("Task — renders description when prompt is missing", () => {
    const hint = hintForCall("Task", { description: "summarise the diff" });
    assert.strictEqual(hint, "summarise the diff");
  });

  test("mcp__orchestration__RollCall — empty input renders as `{}`", () => {
    const hint = hintForCall("mcp__orchestration__RollCall", {});
    assert.strictEqual(hint, "{}");
  });

  test("mcp__orchestration__Ask — renders full input as single-line JSON", () => {
    const input = { to: "staff-engineer", question: "go" };
    const hint = hintForCall("mcp__orchestration__Ask", input);
    assert.strictEqual(hint, JSON.stringify(input));
  });

  test("mcp__orchestration__Announce — preserves embedded quotes via JSON", () => {
    const input = { message: 'Say "hello"' };
    const hint = hintForCall("mcp__orchestration__Announce", input);
    assert.strictEqual(hint, JSON.stringify(input));
    assert.ok(hint.includes('\\"'), "JSON should escape embedded quotes");
  });

  test("mcp__github__list_branches — renders full input as single-line JSON", () => {
    const input = { owner: "foo" };
    const hint = hintForCall("mcp__github__list_branches", input);
    assert.strictEqual(hint, JSON.stringify(input));
  });

  test("MCP hint stays on a single line even with rich nested input", () => {
    const input = {
      owner: "forwardimpact",
      repo: "monorepo",
      issue_number: 1,
      labels: ["bug", "p0"],
      meta: { source: "ci" },
    };
    const hint = hintForCall("mcp__github__add_issue_comment", input);
    assert.strictEqual(hint, JSON.stringify(input));
    assert.ok(!hint.includes("\n"), "MCP hint must be single-line");
  });

  test("unknown tool — returns empty string", () => {
    const hint = hintForCall("UnknownXyz", { foo: "bar" });
    assert.strictEqual(hint, "");
  });

  test("missing input — renders empty hint for Bash", () => {
    const hint = hintForCall("Bash", undefined);
    assert.strictEqual(hint, "");
  });

  test('sanitizer strips every { } " from any branch', () => {
    // Craft inputs that deliberately contain JSON punctuation.
    const cases = [
      ["Bash", { command: 'echo {a: "b"}' }],
      ["Read", { file_path: '/"tmp"/f' }],
      ["Grep", { pattern: "{x}", path: '"dir"' }],
      ["Agent", { prompt: '{"spec":540}' }],
    ];
    for (const [name, input] of cases) {
      assertNoJsonPunctuation(hintForCall(name, input));
    }
  });
});

describe("simplifyToolName", () => {
  test("strips mcp__orchestration__ prefix", () => {
    assert.strictEqual(simplifyToolName("mcp__orchestration__Ask"), "Ask");
  });

  test("strips mcp__github__ prefix", () => {
    assert.strictEqual(
      simplifyToolName("mcp__github__list_branches"),
      "list_branches",
    );
  });

  test("preserves method with embedded __", () => {
    assert.strictEqual(simplifyToolName("mcp__server__foo__bar"), "foo__bar");
  });

  test("non-mcp names pass through unchanged", () => {
    assert.strictEqual(simplifyToolName("Bash"), "Bash");
    assert.strictEqual(simplifyToolName("TodoWrite"), "TodoWrite");
  });

  test("empty and malformed names return safely", () => {
    assert.strictEqual(simplifyToolName(""), "");
    assert.strictEqual(simplifyToolName("mcp__only"), "mcp__only");
  });
});

describe("previewForResult", () => {
  test("empty success content → (ok)", () => {
    const p = previewForResult("", false);
    assert.deepStrictEqual(p, { text: "(ok)", isError: false });
  });

  test("success — first non-blank line", () => {
    const p = previewForResult("\n\n  first line\nsecond line\n", false);
    assert.deepStrictEqual(p, { text: "first line", isError: false });
  });

  test("success — truncates long lines to 80 chars", () => {
    const p = previewForResult("x".repeat(500), false);
    assert.ok(p.text.length <= 80);
    assert.ok(p.text.endsWith("..."));
  });

  test("error — returns raw body with isError flag (renderer owns label)", () => {
    const p = previewForResult("fatal: not a git repository", true);
    assert.deepStrictEqual(p, {
      text: "fatal: not a git repository",
      isError: true,
    });
  });

  test("error — empty content becomes '(no output)'", () => {
    const p = previewForResult("", true);
    assert.deepStrictEqual(p, { text: "(no output)", isError: true });
  });

  test("error — truncates long error bodies to 80 chars", () => {
    const p = previewForResult("x".repeat(500), true);
    assert.ok(p.text.length <= 80);
    assert.ok(p.text.endsWith("..."));
  });

  test("object content — stringified then previewed", () => {
    const p = previewForResult({ status: "ok" }, false);
    assert.strictEqual(p.isError, false);
    assert.ok(p.text.length > 0);
  });

  test("null content — returns (ok) for success", () => {
    const p = previewForResult(null, false);
    assert.deepStrictEqual(p, { text: "(ok)", isError: false });
  });

  test("multi-line content — only first non-blank line", () => {
    const p = previewForResult("\nhello\nworld\n", false);
    assert.deepStrictEqual(p, { text: "hello", isError: false });
  });
});
