/**
 * CLI Output Formatting Utilities
 *
 * Provides consistent formatting for terminal output including colors,
 * tables, headers, and level formatting.
 */

// ANSI color codes
export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

/**
 * Check if stdout supports colors
 * @returns {boolean}
 */
export function supportsColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY;
}

/**
 * Wrap text with color if supported
 * @param {string} text
 * @param {string} color
 * @returns {string}
 */
function colorize(text, color) {
  if (!supportsColor()) return text;
  return `${color}${text}${colors.reset}`;
}

/**
 * Format a header
 * @param {string} text
 * @returns {string}
 */
export function formatHeader(text) {
  return colorize(text, colors.bold + colors.cyan);
}

/**
 * Format a subheader
 * @param {string} text
 * @returns {string}
 */
export function formatSubheader(text) {
  return colorize(text, colors.bold);
}

/**
 * Format a list item
 * @param {string} label
 * @param {string} value
 * @param {number} [indent=0]
 * @returns {string}
 */
export function formatListItem(label, value, indent = 0) {
  const padding = "  ".repeat(indent);
  const bullet = colorize("•", colors.dim);
  return `${padding}${bullet} ${label}: ${value}`;
}

/**
 * Format a bullet item (no label)
 * @param {string} text
 * @param {number} [indent=0]
 * @returns {string}
 */
export function formatBullet(text, indent = 0) {
  const padding = "  ".repeat(indent);
  const bullet = colorize("•", colors.dim);
  return `${padding}${bullet} ${text}`;
}

/**
 * Format a table
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @param {Object} [options]
 * @param {boolean} [options.compact=false]
 * @returns {string}
 */
export function formatTable(headers, rows, options = {}) {
  const { compact = false } = options;

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] || "").length)),
  );

  const lines = [];

  // Header
  const headerLine = headers
    .map((h, i) => String(h).padEnd(widths[i]))
    .join("  ");
  lines.push(colorize(headerLine, colors.bold));

  // Separator
  if (!compact) {
    lines.push(widths.map((w) => "─".repeat(w)).join("──"));
  }

  // Rows
  for (const row of rows) {
    lines.push(
      row.map((cell, i) => String(cell || "").padEnd(widths[i])).join("  "),
    );
  }

  return lines.join("\n");
}

/**
 * Format skill level with color
 * @param {string} level
 * @returns {string}
 */
export function formatSkillLevel(level) {
  const levelColors = {
    awareness: colors.gray,
    foundational: colors.blue,
    working: colors.green,
    practitioner: colors.yellow,
    expert: colors.magenta,
  };
  const color = levelColors[level] || colors.reset;
  return colorize(level, color);
}

/**
 * Format behaviour maturity with color
 * @param {string} maturity
 * @returns {string}
 */
export function formatBehaviourMaturity(maturity) {
  const maturityColors = {
    emerging: colors.gray,
    developing: colors.blue,
    practicing: colors.green,
    role_modeling: colors.yellow,
    exemplifying: colors.magenta,
  };
  const color = maturityColors[maturity] || colors.reset;
  const displayName = maturity.replace(/_/g, " ");
  return colorize(displayName, color);
}

/**
 * Format a modifier value (+1, 0, -1)
 * @param {number} modifier
 * @returns {string}
 */
export function formatModifier(modifier) {
  if (modifier > 0) {
    return colorize(`+${modifier}`, colors.green);
  } else if (modifier < 0) {
    return colorize(String(modifier), colors.red);
  }
  return colorize("0", colors.dim);
}

/**
 * Format a percentage
 * @param {number} value - Value between 0 and 1
 * @returns {string}
 */
export function formatPercent(value) {
  const percent = Math.round(value * 100);
  let color;
  if (percent >= 80) {
    color = colors.green;
  } else if (percent >= 50) {
    color = colors.yellow;
  } else {
    color = colors.red;
  }
  return colorize(`${percent}%`, color);
}

/**
 * Format a change indicator (↑, ↓, →)
 * @param {number} change
 * @returns {string}
 */
export function formatChange(change) {
  if (change > 0) {
    return colorize(`↑${change}`, colors.green);
  } else if (change < 0) {
    return colorize(`↓${Math.abs(change)}`, colors.red);
  }
  return colorize("→", colors.dim);
}

/**
 * Format an error message
 * @param {string} message
 * @returns {string}
 */
export function formatError(message) {
  return colorize(`Error: ${message}`, colors.red);
}

/**
 * Format a success message
 * @param {string} message
 * @returns {string}
 */
export function formatSuccess(message) {
  return colorize(message, colors.green);
}

/**
 * Format a warning message
 * @param {string} message
/**
 * Format a warning message
 * @param {string} message
 * @returns {string}
 */
export function formatWarning(message) {
  return colorize(`Warning: ${message}`, colors.yellow);
}

/**
 * Create a horizontal rule
 * @param {number} [width=60]
 * @returns {string}
 */
export function horizontalRule(width = 60) {
  return colorize("─".repeat(width), colors.dim);
}

/**
 * Format a section with title and content
 * @param {string} title
 * @param {string} content
 * @returns {string}
 */
export function formatSection(title, content) {
  return `${formatHeader(title)}\n\n${content}`;
}

/**
 * Indent all lines of text
 * @param {string} text
 * @param {number} [spaces=2]
 * @returns {string}
 */
export function indent(text, spaces = 2) {
  const padding = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => padding + line)
    .join("\n");
}
