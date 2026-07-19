import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import {
  AgentTraceFormatter,
  HtmlFormatter,
  TerminalFormatter,
  createTerminalFormatter,
} from "../src/index.js";

describe("libformat", () => {
  describe("HtmlFormatter", () => {
    let mockSanitizeHtml, mockMarked, htmlFormatter;

    beforeEach(() => {
      // Mock sanitize-html
      mockSanitizeHtml = (html, options) => {
        // Simple mock that removes script tags but keeps other allowed tags
        let sanitized = html.replace(/<script[^>]*>.*?<\/script>/gi, "");

        // Filter allowed tags (basic implementation for testing)
        if (options.allowedTags) {
          const allowedTagsSet = new Set(options.allowedTags);
          sanitized = sanitized.replace(
            /<(\/?[^>]+)>/g,
            (match, tagContent) => {
              const tagName = tagContent.split(/\s/)[0].replace("/", "");
              return allowedTagsSet.has(tagName) ? match : "";
            },
          );
        }

        return sanitized;
      };

      // Mock Marked
      const mockMarkedInstance = {
        setOptions: () => mockMarkedInstance,
        parse: (markdown) => {
          // Simple mock that converts basic markdown
          return markdown
            .replace(/^# (.*$)/gm, "<h1>$1</h1>")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        },
      };
      mockMarked = {
        Marked: class {
          /**
           * Set options for marked instance
           * @returns {object} Mock marked instance
           */
          setOptions() {
            return mockMarkedInstance;
          }
        },
      };

      htmlFormatter = new HtmlFormatter(mockSanitizeHtml, mockMarked);
    });

    test("converts basic markdown to HTML", () => {
      const markdown = "# Hello World\n\nThis is **bold** text.";
      const html = htmlFormatter.format(markdown);

      assert(html.includes("<h1>"));
      assert(html.includes("Hello World"));
      assert(html.includes("<strong>"));
      assert(html.includes("bold"));
    });

    test("sanitizes dangerous HTML", () => {
      const markdown = '<script>alert("xss")</script>\n\n# Safe Content';
      const html = htmlFormatter.format(markdown);

      assert(!html.includes("<script>"));
      assert(!html.includes("alert"));
      assert(html.includes("<h1>"));
      assert(html.includes("Safe Content"));
    });

    test("preserves allowed HTML tags", () => {
      const markdown = "# Heading\n\n**Bold** and *italic* text.";
      const html = htmlFormatter.format(markdown);

      assert(html.includes("<h1>"));
      assert(html.includes("<strong>"));
      assert(html.includes("<em>"));
    });

    test("handles empty input", () => {
      const html = htmlFormatter.format("");
      assert.strictEqual(typeof html, "string");
    });

    test("handles links with allowed attributes", () => {
      const markdown = "[Link](https://example.com)";
      const html = htmlFormatter.format(markdown);

      assert(html.includes('<a href="https://example.com"'));
      assert(html.includes("Link"));
    });
  });

  describe("TerminalFormatter", () => {
    let mockMarked, mockMarkedTerminal, terminalFormatter;

    beforeEach(() => {
      // Mock marked-terminal
      mockMarkedTerminal = () => ({});

      // Mock Marked - should behave like the real Marked class
      mockMarked = {
        Marked: class {
          /**
           * Constructor for Marked
           * @param {object} _options - Marked options
           */
          constructor(_options) {
            // Instance methods that mimic real Marked behavior
          }
          /**
           * Use marked extensions
           * @returns {this} Returns this for method chaining
           */
          use() {
            return this; // Return this for method chaining like real Marked
          }
          /**
           * Parse markdown to formatted output
           * @param {string} markdown - Markdown to parse
           * @returns {string} Formatted output
           */
          parse(markdown) {
            // Simple mock that adds ANSI codes for terminal formatting
            return markdown
              .replace(/^# (.*$)/gm, "\x1b[1m$1\x1b[0m") // Bold for headers
              .replace(/\*\*(.*?)\*\*/g, "\x1b[1m$1\x1b[0m") // Bold
              .replace(/\*(.*?)\*/g, "\x1b[3m$1\x1b[0m"); // Italic
          }
        },
      };

      terminalFormatter = new TerminalFormatter(mockMarked, mockMarkedTerminal);
    });

    test("converts markdown to terminal output", () => {
      const markdown = "# Hello World\n\nThis is **bold** text.";
      const terminal = terminalFormatter.format(markdown);

      assert.strictEqual(typeof terminal, "string");
      assert(terminal.length > 0);
      assert(terminal.includes("Hello World"));
      assert(terminal.includes("bold"));
    });

    test("handles code blocks", () => {
      const markdown = "```javascript\nconst x = 1;\n```";
      const terminal = terminalFormatter.format(markdown);

      assert.strictEqual(typeof terminal, "string");
      assert(terminal.length > 0);
    });

    test("handles lists", () => {
      const markdown = "- Item 1\n- Item 2\n- Item 3";
      const terminal = terminalFormatter.format(markdown);

      assert.strictEqual(typeof terminal, "string");
      assert(terminal.includes("Item 1"));
      assert(terminal.includes("Item 2"));
      assert(terminal.includes("Item 3"));
    });

    test("handles empty input", () => {
      const terminal = terminalFormatter.format("");
      assert.strictEqual(typeof terminal, "string");
    });

    test("strips ANSI codes when colors are disabled", () => {
      const plain = new TerminalFormatter(mockMarked, mockMarkedTerminal, {
        colors: false,
      });
      const terminal = plain.format("This is **bold** text.");

      assert(!terminal.includes("\x1b["));
      assert(terminal.includes("bold"));
    });

    test("createTerminalFormatter emits no ANSI when stdout is not a TTY", () => {
      const formatted = createTerminalFormatter({ isTTY: false }).format(
        "# Heading\n\nThis is **bold** text.",
      );

      assert(!formatted.includes("\x1b["));
      assert(formatted.includes("bold"));
    });
  });

  describe("AgentTraceFormatter", () => {
    let chunks, output, formatter;

    /** Joins all written chunks into a single string for assertions. */
    function written() {
      return chunks.join("");
    }

    beforeEach(() => {
      chunks = [];
      output = { write: (data) => chunks.push(data) };
      formatter = new AgentTraceFormatter(output);
    });

    // -- Section spacing rule -----------------------------------------------
    // Every section (thinking, tool call, result marker) ends with \n\n.

    test("every thinking section ends with blank separator", () => {
      formatter.writeBlocks([{ type: "thinking", thinking: "hmm" }]);
      assert.ok(written().endsWith("\n\n"));
    });

    test("every tool call section ends with blank separator", () => {
      formatter.writeBlocks([{ type: "tool_use", name: "Read", input: {} }]);
      assert.ok(written().endsWith("\n\n"));
    });

    test("marker getter returns configured marker", () => {
      const f = new AgentTraceFormatter(output, { marker: "⏺" });
      assert.strictEqual(f.marker, "⏺");
    });

    // -- Thinking -----------------------------------------------------------

    test("renders thinking in dim text", () => {
      formatter.writeBlocks([{ type: "thinking", thinking: "Let me check" }]);
      assert.strictEqual(written(), "\x1b[2mLet me check\x1b[0m\n\n");
    });

    test("skips thinking blocks with empty content", () => {
      formatter.writeBlocks([{ type: "thinking", thinking: "" }]);
      assert.strictEqual(chunks.length, 0);
    });

    test("indents thinking when indent option is set", () => {
      const f = new AgentTraceFormatter(output, { indent: "  " });
      f.writeBlocks([{ type: "thinking", thinking: "line one\nline two" }]);
      assert.strictEqual(written(), "\x1b[2m  line one\n  line two\x1b[0m\n\n");
    });

    // -- Tool calls ---------------------------------------------------------

    test("renders tool_use with bold name and params", () => {
      formatter.writeBlocks([
        { type: "tool_use", name: "Read", input: { file_path: "/tmp/a.js" } },
      ]);
      assert.strictEqual(
        written(),
        '\x1b[1mRead\x1b[0m(file_path: "/tmp/a.js")\n\n',
      );
    });

    test("strips mcp prefix from mcp_tool_use names", () => {
      formatter.writeBlocks([
        {
          type: "mcp_tool_use",
          name: "mcp__guide__search_content",
          input: { input: "tools" },
        },
      ]);
      assert.strictEqual(
        written(),
        '\x1b[1msearch_content\x1b[0m(input: "tools")\n\n',
      );
    });

    test("truncates long string values in tool input", () => {
      const long = "a".repeat(80);
      formatter.writeBlocks([
        { type: "tool_use", name: "Grep", input: { pattern: long } },
      ]);
      assert.ok(written().includes("aaa..."));
      assert.ok(!written().includes(long));
    });

    test("renders non-string tool input as JSON", () => {
      formatter.writeBlocks([
        { type: "tool_use", name: "Bash", input: { timeout: 5000 } },
      ]);
      assert.strictEqual(written(), "\x1b[1mBash\x1b[0m(timeout: 5000)\n\n");
    });

    test("handles tool_use with empty input", () => {
      formatter.writeBlocks([{ type: "tool_use", name: "List", input: {} }]);
      assert.strictEqual(written(), "\x1b[1mList\x1b[0m()\n\n");
    });

    test("does not indent tool_use blocks", () => {
      const f = new AgentTraceFormatter(output, { indent: "  " });
      f.writeBlocks([
        { type: "tool_use", name: "Read", input: { file_path: "/a" } },
      ]);
      assert.ok(!written().startsWith("  "));
    });

    // -- Marker -------------------------------------------------------------

    test("marker is inline with each tool call", () => {
      const f = new AgentTraceFormatter(output, { marker: "⏺ " });
      f.writeBlocks([
        { type: "tool_use", name: "A", input: {} },
        { type: "tool_use", name: "B", input: {} },
      ]);
      const lines = written().split("\n").filter(Boolean);
      assert.ok(lines[0].startsWith("⏺ "));
      assert.ok(lines[1].startsWith("⏺ "));
    });

    test("marker does not apply to thinking blocks", () => {
      const f = new AgentTraceFormatter(output, { marker: "⏺ " });
      f.writeBlocks([{ type: "thinking", thinking: "hmm" }]);
      assert.ok(!written().includes("⏺"));
    });

    // -- Marker getter -------------------------------------------------------

    test("marker getter returns empty string when not configured", () => {
      assert.strictEqual(formatter.marker, "");
    });

    // -- Edge cases ---------------------------------------------------------

    test("handles null and undefined blocks", () => {
      formatter.writeBlocks(null);
      formatter.writeBlocks(undefined);
      assert.strictEqual(chunks.length, 0);
    });

    test("ignores text blocks", () => {
      formatter.writeBlocks([{ type: "text", text: "Hello" }]);
      assert.strictEqual(chunks.length, 0);
    });

    test("renders mixed blocks in order with separators", () => {
      formatter.writeBlocks([
        { type: "thinking", thinking: "Planning" },
        { type: "tool_use", name: "Read", input: { file_path: "/a" } },
      ]);
      const text = written();
      assert.ok(text.indexOf("Planning") < text.indexOf("Read"));
      // Two sections, each ending with \n\n
      assert.strictEqual(text.match(/\n\n/g).length, 2);
    });

    test("formatToolInput handles null and non-object input", () => {
      assert.strictEqual(formatter.formatToolInput(null), "");
      assert.strictEqual(formatter.formatToolInput("string"), "");
      assert.strictEqual(formatter.formatToolInput(42), "");
    });
  });
});
