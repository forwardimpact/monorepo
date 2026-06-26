/**
 * Line renderer — composes prefix + color + body + reset into a single
 * terminal line. Pure; no side effects.
 *
 * Every renderer returns a `\n`-terminated string:
 *     <source>: <ESC><color><body><RESET>\n
 *
 * The `<source>: ` prefix lives outside the color escape so grep and
 * color-stripping terminals preserve the participant tag. Colons separate
 * the source label and the kind label (`Bash:`, `Result:`, `Error:`) for a
 * tighter line on narrow viewports without losing structure.
 */

import { colorForSource, ERROR_COLOR, RESET } from "./palette.js";

/**
 * @param {string|null} source
 * @param {boolean} withPrefix
 * @returns {string}
 */
function prefix(source, withPrefix) {
  if (!withPrefix || !source) return "";
  return `${source}: `;
}

/**
 * @param {{source: string|null, text: string, withPrefix: boolean}} args
 * @returns {string}
 */
export function renderTextLine({ source, text, withPrefix }) {
  const color = colorForSource(source);
  return `${prefix(source, withPrefix)}${color}${text}${RESET}\n`;
}

/**
 * @param {{source: string|null, toolName: string, hint: string, withPrefix: boolean}} args
 * @returns {string}
 */
export function renderToolCallLine({ source, toolName, hint, withPrefix }) {
  const color = colorForSource(source);
  const body = hint ? `${toolName}: ${hint}` : `${toolName}`;
  return `${prefix(source, withPrefix)}${color}${body}${RESET}\n`;
}

/**
 * @param {{source: string|null, preview: {text: string, isError: boolean}, withPrefix: boolean}} args
 * @returns {string}
 */
export function renderToolResultLine({ source, preview, withPrefix }) {
  const color = preview.isError ? ERROR_COLOR : colorForSource(source);
  const label = preview.isError ? "Error" : "Result";
  const body = `${label}: ${preview.text}`;
  return `${prefix(source, withPrefix)}${color}${body}${RESET}\n`;
}
