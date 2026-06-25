/**
 * Shared formatting utilities
 *
 * Common formatting functions used across different output formats (CLI, DOM, markdown)
 */

/**
 * Trim trailing newlines from a string value
 * Used by template prepare functions for consistent output formatting.
 * @param {string|null|undefined} value - Value to trim
 * @returns {string|null} Trimmed value or null if empty
 */
export function trimValue(value) {
  if (value == null) return null;
  const trimmed = value.replace(/\n+$/, "");
  return trimmed || null;
}

/**
 * Trim a required field, preserving original if trim would result in empty
 * Use for fields that must have a value.
 * @param {string|null|undefined} value - Value to trim
 * @returns {string} Trimmed value or original
 */
export function trimRequired(value) {
  return trimValue(value) || value || "";
}

/**
 * Trim and split a string into lines
 * @param {string|null|undefined} value - Value to process
 * @returns {string[]} Array of lines (empty array if no value)
 */
export function splitLines(value) {
  const trimmed = trimValue(value);
  return trimmed ? trimmed.split("\n") : [];
}

/**
 * Transform an array of objects by applying trimValue to specified fields
 * @param {Array<Object>} array - Array of objects to transform
 * @param {Object<string, 'optional'|'required'|'array'>} fieldSpec - Fields to trim and their type
 *   - 'optional': use trimValue (returns null if empty)
 *   - 'required': use trimRequired (preserves original if empty)
 *   - 'array': trim each element in array field
 * @returns {Array<Object>} Transformed array
 */
export function trimFields(array, fieldSpec) {
  if (!array) return [];
  return array.map((item) => {
    const result = { ...item };
    for (const [field, type] of Object.entries(fieldSpec)) {
      if (type === "optional") {
        result[field] = trimValue(item[field]);
      } else if (type === "required") {
        result[field] = trimRequired(item[field]);
      } else if (type === "array") {
        result[field] = (item[field] || []).map((v) => trimRequired(v));
      }
    }
    return result;
  });
}

/**
 * Format level as text with dots (for CLI/markdown)
 * @param {number} level - 1-5
 * @param {string} name - Level name
 * @returns {string}
 */
export function formatLevelText(level, name) {
  return `${"●".repeat(level)}${"○".repeat(5 - level)} ${name}`;
}

/**
 * Format table as markdown
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Table rows
 * @returns {string}
 */
export function tableToMarkdown(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerRow, separator, ...dataRows].join("\n");
}

/**
 * Format a key-value object as markdown list
 * @param {Object<string, string>} obj - Key-value pairs
 * @param {number} indent - Indent level
 * @returns {string}
 */
export function objectToMarkdownList(obj, indent = 0) {
  const prefix = "  ".repeat(indent);
  return Object.entries(obj)
    .map(([key, value]) => `${prefix}- **${capitalize(key)}**: ${value}`)
    .join("\n");
}

/**
 * Format percentage for display
 * @param {number} value - Decimal value (0-1)
 * @returns {string}
 */
export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Capitalize first letter of each word
 * Handles both snake_case and camelCase
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  if (!str) return "";
  // Insert space before uppercase letters (for camelCase), then handle snake_case
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Truncate text to max length (reserves space for ellipsis)
 * @param {string} text
 * @param {number} maxLength - Total length including ellipsis
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || "";
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Format a numeric modifier as a signed string (e.g. +2, -1, 0)
 * @param {number} modifier
 * @returns {string}
 */
export function formatModifier(modifier) {
  return modifier > 0 ? `+${modifier}` : `${modifier}`;
}
