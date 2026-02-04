/**
 * Code Display Component
 *
 * Reusable read-only code block with copy buttons and syntax highlighting.
 * Used for markdown content, agent profiles, skills, and code snippets.
 */

/* global Prism */
import { div, p, span, button } from "../lib/render.js";

/**
 * Create a copy button that copies content to clipboard
 * @param {string} content - The text content to copy
 * @param {string} label - Button label text
 * @param {string} [className="btn btn-sm"] - Button class
 * @returns {HTMLElement}
 */
export function createCopyButton(content, label, className = "btn btn-sm") {
  const btn = button(
    {
      className: `${className} copy-btn`,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(content);
          btn.textContent = "✓ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = label;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.textContent = "Copy failed";
          setTimeout(() => {
            btn.textContent = label;
          }, 2000);
        }
      },
    },
    label,
  );
  return btn;
}

/**
 * Create a copy button that copies HTML to clipboard (for rich text pasting)
 * @param {string} html - The HTML content to copy
 * @param {string} label - Button label text
 * @returns {HTMLElement}
 */
export function createCopyHtmlButton(html, label) {
  const btn = button(
    {
      className: "btn btn-sm btn-secondary copy-btn",
      onClick: async () => {
        try {
          const blob = new Blob([html], { type: "text/html" });
          const clipboardItem = new ClipboardItem({ "text/html": blob });
          await navigator.clipboard.write([clipboardItem]);
          btn.textContent = "✓ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = label;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.textContent = "Copy failed";
          setTimeout(() => {
            btn.textContent = label;
          }, 2000);
        }
      },
    },
    label,
  );
  return btn;
}

/**
 * Create a code display component with syntax highlighting and copy button
 * @param {Object} options
 * @param {string} options.content - The code content to display
 * @param {string} [options.language] - Language for syntax highlighting (e.g., "markdown", "yaml")
 * @param {string} [options.filename] - Optional filename to display in header
 * @param {string} [options.description] - Optional description text
 * @param {string} [options.copyLabel="📋 Copy"] - Label for the copy button
 * @param {Function} [options.toHtml] - Optional function to convert content to HTML for rich copy
 * @param {string} [options.copyHtmlLabel="Copy as HTML"] - Label for HTML copy button
 * @param {number} [options.minHeight] - Optional minimum height in pixels
 * @param {number} [options.maxHeight] - Optional maximum height in pixels
 * @returns {HTMLElement}
 */
export function createCodeDisplay({
  content,
  language,
  filename,
  description,
  copyLabel = "📋 Copy",
  toHtml,
  copyHtmlLabel = "Copy as HTML",
  minHeight,
  maxHeight,
}) {
  // Create highlighted code block
  const pre = document.createElement("pre");
  pre.className = "code-display";
  if (minHeight) pre.style.minHeight = `${minHeight}px`;
  if (maxHeight) {
    pre.style.maxHeight = `${maxHeight}px`;
    pre.style.overflowY = "auto";
  }

  const code = document.createElement("code");
  if (language) {
    code.className = `language-${language}`;
  }
  code.textContent = content;
  pre.appendChild(code);

  // Apply Prism highlighting if available and language specified
  if (language && typeof Prism !== "undefined") {
    Prism.highlightElement(code);
  }

  // Build header content
  const headerLeft = [];
  if (filename) {
    headerLeft.push(span({ className: "code-display-filename" }, filename));
  }
  if (description) {
    headerLeft.push(p({ className: "text-muted" }, description));
  }

  // Build buttons
  const buttons = [createCopyButton(content, copyLabel)];
  if (toHtml) {
    buttons.push(createCopyHtmlButton(toHtml(content), copyHtmlLabel));
  }

  // Only show header if there's content for it
  const hasHeader = headerLeft.length > 0 || buttons.length > 0;

  return div(
    { className: "code-display-container" },
    hasHeader
      ? div(
          { className: "code-display-header" },
          headerLeft.length > 0
            ? div({ className: "code-display-info" }, ...headerLeft)
            : null,
          div({ className: "button-group" }, ...buttons),
        )
      : null,
    pre,
  );
}

/**
 * Create a markdown textarea with copy buttons (backward-compatible alias)
 * @param {Object} options
 * @param {string} options.markdown - The markdown content to display
 * @param {string} [options.description] - Optional description text above the textarea
 * @param {string} [options.copyLabel="Copy Markdown"] - Label for the copy button
 * @param {Function} [options.toHtml] - Optional function to convert markdown to HTML for rich copy
 * @param {string} [options.copyHtmlLabel="Copy as HTML"] - Label for the HTML copy button
 * @param {number} [options.minHeight=300] - Minimum height in pixels
 * @returns {HTMLElement}
 */
export function createMarkdownTextarea({
  markdown,
  description,
  copyLabel = "Copy Markdown",
  toHtml,
  copyHtmlLabel = "Copy as HTML",
  minHeight = 300,
}) {
  return createCodeDisplay({
    content: markdown,
    language: "markdown",
    description,
    copyLabel,
    toHtml,
    copyHtmlLabel,
    minHeight,
  });
}
