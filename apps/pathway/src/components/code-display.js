/**
 * Code Display Component
 *
 * Collapsible read-only code block with copy buttons and syntax highlighting.
 * Wrapped in a <details>/<summary> element with the filename and copy buttons
 * always visible in the summary. Content is lazy-rendered on first open.
 *
 * Used for markdown content, agent profiles, skills, and code snippets.
 */

/* global Prism */
import { div, p, span, button } from "../lib/render.js";

const COPY_LABEL = "📋 Copy";
const COPY_HTML_LABEL = "Copy as HTML";

/**
 * Create a copy button that copies content to clipboard
 * @param {string} content - The text content to copy
 * @returns {HTMLElement}
 */
export function createCopyButton(content) {
  const btn = button(
    {
      className: "btn btn-sm copy-btn",
      onClick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(content);
          btn.textContent = "✓ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = COPY_LABEL;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.textContent = "Copy failed";
          setTimeout(() => {
            btn.textContent = COPY_LABEL;
          }, 2000);
        }
      },
    },
    COPY_LABEL,
  );
  return btn;
}

/**
 * Create a copy button that copies HTML to clipboard (for rich text pasting)
 * @param {string} html - The HTML content to copy
 * @returns {HTMLElement}
 */
function createCopyHtmlButton(html) {
  const btn = button(
    {
      className: "btn btn-sm btn-secondary copy-btn",
      onClick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const blob = new Blob([html], { type: "text/html" });
          const clipboardItem = new ClipboardItem({ "text/html": blob });
          await navigator.clipboard.write([clipboardItem]);
          btn.textContent = "✓ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = COPY_HTML_LABEL;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.textContent = "Copy failed";
          setTimeout(() => {
            btn.textContent = COPY_HTML_LABEL;
          }, 2000);
        }
      },
    },
    COPY_HTML_LABEL,
  );
  return btn;
}

/**
 * Create the code <pre> element with syntax highlighting
 * @param {Object} options
 * @param {string} options.content - Code content
 * @param {string} options.language - Language for highlighting
 * @param {number} [options.minHeight] - Min height in pixels
 * @param {number} [options.maxHeight] - Max height in pixels
 * @returns {HTMLElement}
 */
function createCodeBlock({ content, language, minHeight, maxHeight }) {
  const pre = document.createElement("pre");
  pre.className = "code-display";
  if (minHeight) pre.style.minHeight = `${minHeight}px`;
  if (maxHeight) {
    pre.style.maxHeight = `${maxHeight}px`;
    pre.style.overflowY = "auto";
  }

  const code = document.createElement("code");
  if (language) code.className = `language-${language}`;
  code.textContent = content;
  pre.appendChild(code);

  if (language && typeof Prism !== "undefined") {
    Prism.highlightElement(code);
  }

  return pre;
}

/**
 * Create a collapsible code display component with syntax highlighting and copy buttons.
 *
 * Always rendered as a <details>/<summary> element. The filename and copy buttons
 * appear in the summary (always visible). The code block is in the collapsible body
 * and is lazy-rendered on first open.
 *
 * @param {Object} options
 * @param {string} options.content - The code content to display
 * @param {string} [options.language="markdown"] - Language for syntax highlighting
 * @param {string} [options.filename] - Filename to display in summary
 * @param {string} [options.description] - Optional description text shown in body
 * @param {Function} [options.toHtml] - Function to convert content to HTML (enables "Copy as HTML" button)
 * @param {number} [options.minHeight] - Optional minimum height in pixels
 * @param {number} [options.maxHeight] - Optional maximum height in pixels
 * @param {boolean} [options.open=false] - Whether the details element starts open
 * @returns {HTMLDetailsElement}
 */
export function createCodeDisplay({
  content,
  language = "markdown",
  filename,
  description,
  toHtml,
  minHeight,
  maxHeight,
  open = false,
}) {
  const detailsEl = document.createElement("details");
  detailsEl.className = "code-display-pane";
  if (open) detailsEl.open = true;

  // Build summary: filename (left) + copy buttons (right)
  const summaryEl = document.createElement("summary");
  summaryEl.className = "code-display-summary";

  if (filename) {
    summaryEl.appendChild(
      span({ className: "code-display-filename" }, filename),
    );
  }

  const buttons = [createCopyButton(content)];
  if (toHtml) {
    buttons.push(createCopyHtmlButton(toHtml(content)));
  }
  summaryEl.appendChild(div({ className: "button-group" }, ...buttons));

  detailsEl.appendChild(summaryEl);

  // Lazy-render body on first open
  let rendered = false;
  const renderBody = () => {
    if (rendered) return;
    rendered = true;

    const body = div({ className: "code-display-body" });

    if (description) {
      body.appendChild(p({ className: "text-muted" }, description));
    }

    body.appendChild(
      createCodeBlock({ content, language, minHeight, maxHeight }),
    );

    detailsEl.appendChild(body);
  };

  if (open) {
    renderBody();
  } else {
    detailsEl.addEventListener("toggle", () => {
      if (detailsEl.open) renderBody();
    });
  }

  return detailsEl;
}

/**
 * Wire accordion behaviour on an array of <details> elements.
 * Opening one pane closes all others.
 *
 * @param {HTMLDetailsElement[]} panes - Details elements to accordion
 */
export function accordionize(panes) {
  for (const pane of panes) {
    pane.addEventListener("toggle", () => {
      if (pane.open) {
        for (const other of panes) {
          if (other !== pane) other.open = false;
        }
      }
    });
  }
}
