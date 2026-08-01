/**
 * Shared helpers that render terminal output for every command's text
 * formatter.
 * All functions are pure. They take explicit parameters and return strings.
 */

const FILLED = "█";
const EMPTY = "░";

/**
 * Draw a proportional bar such as "███░░░░░░░".
 *
 * @param {number} value
 * @param {number} max - Scale maximum (maps to full bar width).
 * @param {number} [width=10]
 * @returns {string}
 */
export function renderBar(value, max, width = 10) {
  if (max <= 0 || value <= 0) return EMPTY.repeat(width);
  const ratio = Math.min(1, value / max);
  const filled = Math.max(0, Math.round(ratio * width));
  return FILLED.repeat(filled) + EMPTY.repeat(Math.max(0, width - filled));
}

/**
 * Render the header as "  Title" with a blank line after it.
 *
 * @param {string} title
 * @returns {string}
 */
export function renderHeader(title) {
  return `  ${title}\n`;
}

/**
 * Format a float as a 1-decimal FTE value.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatFte(value) {
  return value.toFixed(1);
}

/**
 * Pad a string to a fixed display width on the right with spaces.
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
export function padRight(str, width) {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}
