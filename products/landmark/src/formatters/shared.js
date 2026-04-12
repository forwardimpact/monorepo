/**
 * Shared rendering helpers used by Landmark formatters.
 * All functions are pure — take explicit parameters, return strings.
 */

/**
 * Pad a string to a fixed display width on the right.
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
export function padRight(str, width) {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

/**
 * Render a section header.
 *
 * @param {string} title
 * @returns {string}
 */
export function renderHeader(title) {
  return `  ${title}\n`;
}

/**
 * Format a number as a signed string (e.g. "+10", "-5", "0").
 *
 * @param {number|null} value
 * @returns {string}
 */
export function formatDelta(value) {
  if (value == null) return "n/a";
  if (value > 0) return `+${value}`;
  return String(value);
}

/**
 * Render a simple key-value table.
 *
 * @param {Array<[string, string]>} rows
 * @param {number} [indent=4]
 * @returns {string}
 */
export function formatKeyValue(rows, indent = 4) {
  const pad = " ".repeat(indent);
  const maxKey = Math.max(0, ...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${pad}${padRight(k, maxKey)}  ${v}`).join("\n");
}
