import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

// Module under test
import { HtmlFormatter, TerminalFormatter } from "../index.js";

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
  });
});
