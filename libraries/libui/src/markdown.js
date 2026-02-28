/**
 * Simple Markdown to HTML converter
 *
 * Converts common markdown syntax to HTML. Designed for job descriptions
 * with headings, lists, bold text, and paragraphs.
 */

/**
 * Convert markdown text to HTML
 * @param {string} markdown - The markdown text to convert
 * @returns {string} HTML string
 */
export function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const htmlLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip empty lines but close list if open
    if (line.trim() === "") {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      continue;
    }

    // H1 heading
    if (line.startsWith("# ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    // H2 heading
    if (line.startsWith("## ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }

    // H3 heading
    if (line.startsWith("### ")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }

    // List item
    if (line.startsWith("- ")) {
      if (!inList) {
        htmlLines.push("<ul>");
        inList = true;
      }
      const content = formatInlineMarkdown(line.slice(2));
      htmlLines.push(`<li>${content}</li>`);
      continue;
    }

    // Regular paragraph
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    htmlLines.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  // Close any open list
  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("\n");
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
