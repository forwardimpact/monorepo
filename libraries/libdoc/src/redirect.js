/**
 * Redirect stubs for pages that moved to another address.
 *
 * A page whose front matter carries `redirect: <absolute http(s) URL>` builds
 * into a forwarding address instead of a page. The old URL stays alive after
 * the content moves. A stub never uses the site template, because a redirect
 * must not render site chrome.
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape the characters that end an HTML attribute or a text node
 * @param {string} value - Raw text
 * @returns {string} Escaped text
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Decide whether a `redirect` front-matter value is an absolute http(s) URL
 * @param {unknown} value - Raw `redirect` front-matter value
 * @returns {boolean} True when the value is a usable redirect target
 */
export function isValidRedirect(value) {
  if (typeof value !== "string") return false;
  const target = value.trim();
  if (target === "" || /\s/.test(target)) return false;
  try {
    const { protocol } = new URL(target);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Render the standalone HTML document for a redirect stub
 * @param {string} title - Page title from front matter
 * @param {string} target - Absolute http(s) URL of the new address
 * @returns {string} HTML document
 */
export function renderRedirectHtml(title, target) {
  const url = escapeHtml(target);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <meta http-equiv="refresh" content="0; url=${url}" />`,
    `    <link rel="canonical" href="${url}" />`,
    `    <title>${escapeHtml(title)}</title>`,
    "  </head>",
    "  <body>",
    `    <p>This page moved to <a href="${url}">${url}</a>.</p>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * Render the companion Markdown for a redirect stub
 * @param {string} title - Page title from front matter
 * @param {string} target - Absolute http(s) URL of the new address
 * @returns {string} Markdown document
 */
export function renderRedirectMarkdown(title, target) {
  return `# ${title}\n\nThis page moved to ${target}.\n`;
}
