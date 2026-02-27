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

  /**
   * Creates a terminal formatter with required dependencies
   * @param {object} marked - Marked markdown parser
   * @param {object} markedTerminal - marked-terminal plugin
   */
  constructor(marked, markedTerminal) {
    if (!marked) throw new Error("marked dependency is required");
    if (!markedTerminal)
      throw new Error("markedTerminal dependency is required");

    this.#marked = marked;
    this.#markedTerminal = markedTerminal;

    // Initialize the terminal marked instance with plugin
    // Pass ignoreIllegals to suppress highlight.js warnings about unknown languages
    // Disable colors if stdout is not a TTY to prevent broken ANSI codes
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
    return formatted.replace(/-{73,}/g, "-".repeat(72));
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
export function createTerminalFormatter() {
  return new TerminalFormatter({ Marked: Marked }, markedTerminal);
}
