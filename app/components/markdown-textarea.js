/**
 * Markdown Textarea Component
 *
 * Reusable read-only textarea with copy buttons for displaying markdown content.
 * Used by job descriptions and skill implementation patterns.
 */

/* global Prism */
import { div, p, button } from "../lib/render.js";

/**
 * Create a copy button that copies content to clipboard
 * @param {string} content - The text content to copy
 * @param {string} label - Button label text
 * @param {string} [className="btn btn-primary"] - Button class
 * @returns {HTMLElement}
 */
export function createCopyButton(
  content,
  label,
  className = "btn btn-primary",
) {
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
      className: "btn btn-secondary copy-btn",
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
 * Create a markdown textarea with copy buttons
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
  // Create highlighted code block
  const pre = document.createElement("pre");
  pre.className = "markdown-display";
  pre.style.minHeight = `${minHeight}px`;

  const code = document.createElement("code");
  code.className = "language-markdown";
  code.textContent = markdown;
  pre.appendChild(code);

  // Apply Prism highlighting if available
  if (typeof Prism !== "undefined") {
    Prism.highlightElement(code);
  }

  const buttons = [createCopyButton(markdown, copyLabel)];
  if (toHtml) {
    buttons.push(createCopyHtmlButton(toHtml(markdown), copyHtmlLabel));
  }

  return div(
    { className: "markdown-textarea-container" },
    div(
      { className: "markdown-textarea-header" },
      description ? p({ className: "text-muted" }, description) : null,
      div({ className: "button-group" }, ...buttons),
    ),
    pre,
  );
}
