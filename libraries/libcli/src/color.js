// ANSI color constants
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
 * Check if the output supports colors.
 * @param {object} proc - process-like object with env and stdout
 * @returns {boolean}
 */
export function supportsColor(proc = process) {
  if (proc.env.NO_COLOR) return false;
  if (proc.env.FORCE_COLOR) return true;
  return proc.stdout?.isTTY ?? false;
}

/**
 * Wrap the text with an ANSI color if the output supports colors.
 * @param {string} text
 * @param {string} color
 * @param {object} proc - process-like object
 * @returns {string}
 */
export function colorize(text, color, proc = process) {
  if (!supportsColor(proc)) return text;
  return `${color}${text}${colors.reset}`;
}
