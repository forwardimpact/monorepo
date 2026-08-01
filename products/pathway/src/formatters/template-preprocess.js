/**
 * Utilities that preprocess templates
 *
 * These functions prepare template data for front matter compatibility.
 * They make sure all front matter values are single-line strings for
 * maximum compatibility with coding agents that have limited YAML parsers.
 */

/**
 * Flatten a multi-line string into a single line
 * Replace newlines with spaces. Collapse multiple spaces.
 * @param {string|null|undefined} value - Value to flatten
 * @returns {string} Single-line string (empty string if no value)
 */
export function flattenToLine(value) {
  if (value == null) return "";
  return value
    .replace(/\s*\n\s*/g, " ") // Replace newlines and the whitespace around them with one space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

/**
 * Join an array of strings into a single line
 * @param {string[]|null|undefined} lines - Array of lines to join
 * @param {string} separator - Separator between lines (default: single space)
 * @returns {string} Single-line string
 */
export function joinLines(lines, separator = " ") {
  if (!lines || !Array.isArray(lines)) return "";
  return lines.map((line) => line.trim()).join(separator);
}

/**
 * Preprocess an object's string fields for front matter
 * Flatten the specified fields to single-line strings.
 * @param {Object} obj - Object to preprocess
 * @param {string[]} fields - Field names to flatten
 * @returns {Object} New object with flattened fields
 */
export function preprocessFrontmatter(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] != null) {
      result[field] = flattenToLine(result[field]);
    }
  }
  return result;
}

/**
 * Preprocess an array of objects. Flatten the specified fields in each object.
 * @param {Array<Object>|null|undefined} array - Array to preprocess
 * @param {string[]} fields - Field names to flatten in each object
 * @returns {Array<Object>} Array with preprocessed objects
 */
export function preprocessArrayFrontmatter(array, fields) {
  if (!array) return [];
  return array.map((item) => preprocessFrontmatter(item, fields));
}
