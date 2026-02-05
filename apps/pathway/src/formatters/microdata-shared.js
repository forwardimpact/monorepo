/**
 * Shared microdata HTML utilities
 *
 * Helper functions for generating clean, class-less HTML with microdata attributes
 * aligned with the RDF schema at https://www.forwardimpact.team/schema/rdf/
 */

const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";

/**
 * Create an opening tag with microdata attributes
 * @param {string} tag - HTML tag name
 * @param {Object} [attrs] - Optional attributes
 * @param {string} [attrs.itemtype] - Microdata type (without vocab prefix)
 * @param {string} [attrs.itemprop] - Microdata property name
 * @param {string} [attrs.itemid] - Microdata item ID
 * @returns {string}
 */
export function openTag(tag, attrs = {}) {
  const parts = [tag];

  if (attrs.itemtype) {
    parts.push(`itemscope`);
    parts.push(`itemtype="${VOCAB_BASE}${attrs.itemtype}"`);
  }

  if (attrs.itemprop) {
    parts.push(`itemprop="${attrs.itemprop}"`);
  }

  if (attrs.itemid) {
    parts.push(`itemid="${attrs.itemid}"`);
  }

  return `<${parts.join(" ")}>`;
}

/**
 * Create a self-closing meta element with microdata
 * @param {string} itemprop - Property name
 * @param {string} content - Content value
 * @returns {string}
 */
export function metaTag(itemprop, content) {
  return `<meta itemprop="${itemprop}" content="${escapeAttr(content)}">`;
}

/**
 * Create a link element with microdata
 * @param {string} itemprop - Property name
 * @param {string} href - Link target
 * @returns {string}
 */
export function linkTag(itemprop, href) {
  return `<link itemprop="${itemprop}" href="${escapeAttr(href)}">`;
}

/**
 * Wrap content in an element with itemprop
 * @param {string} tag - HTML tag name
 * @param {string} itemprop - Property name
 * @param {string} content - Content to wrap
 * @returns {string}
 */
export function prop(tag, itemprop, content) {
  return `<${tag} itemprop="${itemprop}">${escapeHtml(content)}</${tag}>`;
}

/**
 * Wrap raw HTML content in an element with itemprop (no escaping)
 * @param {string} tag - HTML tag name
 * @param {string} itemprop - Property name
 * @param {string} html - HTML content to wrap
 * @returns {string}
 */
export function propRaw(tag, itemprop, html) {
  return `<${tag} itemprop="${itemprop}">${html}</${tag}>`;
}

/**
 * Create a section with optional heading
 * @param {string} heading - Section heading text
 * @param {string} content - Section content
 * @param {number} [level=2] - Heading level (2-6)
 * @returns {string}
 */
export function section(heading, content, level = 2) {
  const hTag = `h${Math.min(Math.max(level, 1), 6)}`;
  return `<section>
<${hTag}>${escapeHtml(heading)}</${hTag}>
${content}
</section>`;
}

/**
 * Create an unordered list
 * @param {string[]} items - List items (already HTML)
 * @param {string} [itemprop] - Optional property for list items
 * @returns {string}
 */
export function ul(items, itemprop) {
  if (!items.length) return "";
  const lis = items
    .map((item) =>
      itemprop ? `<li itemprop="${itemprop}">${item}</li>` : `<li>${item}</li>`,
    )
    .join("\n");
  return `<ul>\n${lis}\n</ul>`;
}

/**
 * Create a definition list from key-value pairs
 * @param {Array<{term: string, definition: string, itemprop?: string}>} pairs
 * @returns {string}
 */
export function dl(pairs) {
  if (!pairs.length) return "";
  const content = pairs
    .map(({ term, definition, itemprop }) => {
      const dd = itemprop
        ? `<dd itemprop="${itemprop}">${escapeHtml(definition)}</dd>`
        : `<dd>${escapeHtml(definition)}</dd>`;
      return `<dt>${escapeHtml(term)}</dt>\n${dd}`;
    })
    .join("\n");
  return `<dl>\n${content}\n</dl>`;
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape attribute value
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format level name for display (capitalize, replace underscores)
 * @param {string} level
 * @returns {string}
 */
export function formatLevelName(level) {
  if (!level) return "";
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate a full microdata HTML document
 * @param {string} title - Document title
 * @param {string} body - Body content
 * @returns {string}
 */
export function htmlDocument(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}
