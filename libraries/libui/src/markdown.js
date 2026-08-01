/**
 * Simple Markdown to HTML converter
 *
 * Converts common markdown syntax to HTML. Use it for job descriptions
 * with headings, lists, bold text, and paragraphs.
 */

/**
 * Convert markdown text to HTML
 * @param {string} markdown - The markdown text to convert
 * @returns {string} HTML string
 */
export function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const tokens = lines.map(classifyLine);
  return renderTokens(tokens);
}

/** Classify a raw line into a tagged token for the renderer. */
function classifyLine(line) {
  if (line.trim() === "") return { type: "blank" };
  const heading = parseHeading(line);
  if (heading) return { type: "heading", html: heading };
  if (line.startsWith("- "))
    return {
      type: "list",
      html: `<li>${formatInlineMarkdown(line.slice(2))}</li>`,
    };
  return { type: "paragraph", html: `<p>${formatInlineMarkdown(line)}</p>` };
}

/** Render classified tokens to HTML. Manage the list open/close state. */
function renderTokens(tokens) {
  const htmlLines = [];
  let inList = false;

  for (const token of tokens) {
    if (token.type === "blank") {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (token.type === "list") {
      if (!inList) {
        htmlLines.push("<ul>");
        inList = true;
      }
      htmlLines.push(token.html);
      continue;
    }
    // Close any open list before a heading or a paragraph
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    htmlLines.push(token.html);
  }

  if (inList) htmlLines.push("</ul>");
  return htmlLines.join("\n");
}

/**
 * Parse a line as a markdown heading (H1–H3). Returns the HTML tag or null.
 * @param {string} line
 * @returns {string|null}
 */
function parseHeading(line) {
  if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
  if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
  if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
  return null;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format inline markdown (bold text)
 * @param {string} text - Text to format
 * @returns {string} HTML formatted text
 */
function formatInlineMarkdown(text) {
  // First escape HTML
  let result = escapeHtml(text);

  // Convert **bold** to <strong>bold</strong>
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return result;
}
