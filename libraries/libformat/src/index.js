// External libraries (alphabetical)
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import sanitizeHtml from "sanitize-html";

/**
 * @typedef {object} FormatterInterface
 * @property {function(string): string} format - Formats markdown content to the target format
 */

/**
 * Replaces details/summary tags in text using a callback
 * @param {string} text - Text to process
 * @param {Function} replacer - Callback function ({ attributes, summary, content }) => string
 * @returns {string} Processed text
 */
function replaceDetails(text, replacer) {
  return text.replace(
    /<details([^>]*)>([\s\S]*?)<\/details>/gi,
    (match, attributes, inner) => {
      const summaryRegex = /(<summary[^>]*>)([\s\S]*?)(<\/summary>)/i;
      const summaryMatch = summaryRegex.exec(inner);

      let summary = null;
      let content = inner;

      if (summaryMatch) {
        summary = {
          full: summaryMatch[0],
          open: summaryMatch[1],
          content: summaryMatch[2],
          close: summaryMatch[3],
        };
        content = inner.replace(summaryMatch[0], "");
      }

      return replacer({
        match,
        attributes,
        summary,
        content,
      });
    },
  );
}

/**
 * Formats markdown content to sanitized HTML
 * @implements {FormatterInterface}
 */
export class HtmlFormatter {
  #sanitize;
  #marked;
  #htmlMarked;

  /**
   * Creates an HTML formatter with required dependencies
   * @param {object} sanitizeFn - sanitize-html sanitizer
   * @param {object} marked - Marked markdown parser
   */
  constructor(sanitizeFn, marked) {
    if (!sanitizeFn) throw new Error("sanitizeFn dependency is required");
    if (!marked) throw new Error("marked dependency is required");

    this.#sanitize = sanitizeFn;
    this.#marked = marked;

    // Initialize the HTML marked instance with configuration
    this.#htmlMarked = new this.#marked.Marked().setOptions({
      breaks: true,
      gfm: true,
    });
  }

  /**
   * Formats text content inside details elements in paragraph tags
   * @param {string} html - Raw HTML content
   * @returns {string} HTML with wrapped details content
   */
  #formatDetails(html) {
    return replaceDetails(html, ({ match, attributes, summary, content }) => {
      if (!content.trim()) return match;

      let formatted = this.#htmlMarked.parse(content);
      if (!formatted.trim().toLowerCase().startsWith("<p")) {
        formatted = `<p>${formatted}</p>`;
      }

      const summaryHtml = summary ? summary.full : "";
      return `<details${attributes}>${summaryHtml}${formatted}</details>`;
    });
  }

  /**
   * Formats markdown content to the target format
   * @param {string} markdown - Markdown content to format
   * @returns {string} Sanitized HTML with allowed tags and attributes
   */
  format(markdown) {
    const rawHtml = this.#htmlMarked.parse(markdown);
    const formattedHtml = this.#formatDetails(rawHtml);

    return this.#sanitize(formattedHtml, {
      allowedTags: [
        "a",
        "blockquote",
        "br",
        "code",
        "details",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "img",
        "li",
        "ol",
        "p",
        "pre",
        "strong",
        "summary",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "u",
        "ul",
      ],
      allowedAttributes: {
        a: ["href", "title"],
        img: ["src", "alt", "title"],
      },
      allowedSchemes: ["http", "https", "mailto"],
    });
  }
}

/**
 * Formats markdown content to terminal output with ANSI escape codes
 * @implements {FormatterInterface}
 */
export class TerminalFormatter {
  #marked;
  #markedTerminal;
  #terminalMarked;
  #colors;

  /**
   * Creates a terminal formatter with required dependencies
   * @param {object} marked - Marked markdown parser
   * @param {object} markedTerminal - marked-terminal plugin
   * @param {object} [options]
   * @param {boolean} [options.colors=true] - Emit ANSI escape codes; pass
   *   false when the output is not a TTY so pipes receive plain text
   */
  constructor(marked, markedTerminal, { colors = true } = {}) {
    if (!marked) throw new Error("marked dependency is required");
    if (!markedTerminal)
      throw new Error("markedTerminal dependency is required");

    this.#marked = marked;
    this.#markedTerminal = markedTerminal;
    this.#colors = colors;

    // Initialize the terminal marked instance with plugin
    // Pass ignoreIllegals to suppress highlight.js warnings about unknown languages
    this.#terminalMarked = new this.#marked.Marked({
      silent: true,
    });
    this.#terminalMarked.use(
      this.#markedTerminal({
        ignoreIllegals: true,
      }),
    );
  }

  /**
   * Formats details/summary tags into terminal-friendly markdown
   * @param {string} markdown - Raw markdown content
   * @returns {string} Markdown with details converted to blockquotes
   */
  #formatDetails(markdown) {
    return replaceDetails(markdown, ({ summary, content }) => {
      const parts = [];
      if (summary) parts.push(`**${summary.content.trim()}**`);
      if (content.trim()) parts.push(content.trim());

      return (
        "\n" +
        parts
          .join("\n\n")
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") +
        "\n"
      );
    });
  }

  /**
   * Formats markdown content to the target format
   * @param {string} markdown - Markdown content to format
   * @returns {string} Terminal-formatted text with ANSI escape codes
   */
  format(markdown) {
    const processed = this.#formatDetails(markdown);
    const formatted = this.#terminalMarked.parse(processed);
    // Reduce the length of horizontal lines by replacing long sequences of dashes
    const normalized = formatted.replace(/-{73,}/g, "-".repeat(72));
    if (this.#colors) return normalized;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR removal is intentional.
    return normalized.replace(/\[[0-9;]*m/g, "");
  }
}

/**
 * Formats agent trace output (thinking and tool calls) for the terminal.
 *
 * Renders Claude Agent SDK assistant message content blocks as plain
 * ANSI-styled text: thinking in dim, tool calls as bold name with params.
 *
 * Every output section is self-contained: content followed by a blank
 * separator line. This single rule governs all spacing — callers never
 * need to inject gaps between sections.
 *
 *   thinking text...         ← section (indent, dim)
 *                            ← separator
 *   ⏺ tool_name(params)     ← section (marker)
 *                            ← separator
 *   ⏺                       ← result marker section
 *                            ← separator (result content follows via caller)
 */
export class AgentTraceFormatter {
  #output;
  #indent;
  #marker;

  /**
   * Creates an agent trace formatter
   * @param {import("stream").Writable} output - Writable stream for trace output (typically process.stderr)
   * @param {{indent?: string, marker?: string}} [options] - Formatting options
   */
  constructor(output, options = {}) {
    if (!output) throw new Error("output dependency is required");
    this.#output = output;
    this.#indent = options.indent || "";
    this.#marker = options.marker || "";
  }

  /**
   * Writes a single section: content line(s) followed by a blank separator.
   * @param {string} text - Section content (no trailing newline needed)
   */
  #writeSection(text) {
    this.#output.write(`${text}\n\n`);
  }

  /**
   * Formats tool input as a compact parameter string.
   * @param {unknown} input - Tool input object
   * @returns {string} Formatted parameter string
   */
  formatToolInput(input) {
    if (!input || typeof input !== "object") return "";
    const entries = Object.entries(input);
    if (entries.length === 0) return "";
    return entries
      .map(([key, value]) => {
        const formatted =
          typeof value === "string"
            ? `"${value.length > 60 ? value.slice(0, 57) + "..." : value}"`
            : JSON.stringify(value);
        return `${key}: ${formatted}`;
      })
      .join(", ");
  }

  /**
   * Writes formatted trace output for an array of content blocks.
   * Each thinking block and each tool call is its own section.
   * @param {Array<{type: string, thinking?: string, name?: string, input?: unknown}>} blocks - Content blocks from an assistant message
   */
  writeBlocks(blocks) {
    if (!blocks) return;
    for (const block of blocks) {
      if (block.type === "thinking" && block.thinking) {
        const text = this.#indent
          ? block.thinking.replace(/^/gm, this.#indent)
          : block.thinking;
        this.#writeSection(`\x1b[2m${text}\x1b[0m`);
      }
      if (block.type === "tool_use" || block.type === "mcp_tool_use") {
        const name = block.name.replace(/^mcp__[^_]+__/, "");
        const params = this.formatToolInput(block.input);
        this.#writeSection(`${this.#marker}\x1b[1m${name}\x1b[0m(${params})`);
      }
    }
  }

  /**
   * Returns the marker string for use as an inline prefix.
   * @returns {string} The marker string, or empty if none configured
   */
  get marker() {
    return this.#marker;
  }
}

/**
 * Creates an HTML formatter with automatically injected dependencies
 * @returns {HtmlFormatter} Configured HTML formatter instance
 */
export function createHtmlFormatter() {
  return new HtmlFormatter(sanitizeHtml, { Marked: Marked });
}

/**
 * Creates a terminal formatter with automatically injected dependencies
 * @returns {TerminalFormatter} Configured terminal formatter instance
 */
export function createTerminalFormatter({
  isTTY = globalThis.process.stdout.isTTY,
} = {}) {
  return new TerminalFormatter({ Marked: Marked }, markedTerminal, {
    colors: Boolean(isTTY),
  });
}

/**
 * Creates an agent trace formatter with automatically injected dependencies
 * @param {import("stream").Writable} output - Writable stream for trace output
 * @param {{indent?: string, marker?: string}} [options] - Formatting options
 * @returns {AgentTraceFormatter} Configured agent trace formatter instance
 */
export function createAgentTraceFormatter(output, options) {
  return new AgentTraceFormatter(output, options);
}
