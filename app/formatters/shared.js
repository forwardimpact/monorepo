/**
 * Shared formatting utilities
 *
 * Common formatting functions used across different output formats (CLI, DOM, markdown)
 */

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
    .replace(/_/g, " ")
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
