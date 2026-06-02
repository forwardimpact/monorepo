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
 * Return the English ordinal suffix for a number (e.g. 1 -> "st", 2 -> "nd").
 * Handles the 11/12/13 special cases.
 *
 * @param {number} n
 * @returns {string}
 */
export function ordinalSuffix(n) {
  const i = Math.round(Math.abs(n));
  const ones = i % 10;
  const tens = i % 100;
  if (tens >= 11 && tens <= 13) return "th";
  if (ones === 1) return "st";
  if (ones === 2) return "nd";
  if (ones === 3) return "rd";
  return "th";
}

/**
 * Truncate a snippet to `max` chars on a word boundary, appending an
 * ellipsis. Falls through to a hard cut if no boundary exists in the last
 * 40% of the slice.
 *
 * @param {string} s
 * @param {number} [max=60]
 * @returns {string}
 */
export function truncateSnippet(s, max = 60) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return body + "…";
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
