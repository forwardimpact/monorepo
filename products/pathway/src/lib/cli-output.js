/**
 * Domain-specific CLI Output Formatters
 *
 * Pathway-specific formatting for skill proficiencies, behaviour maturities,
 * modifiers, percentages, and change indicators. Generic formatters (colors,
 * tables, headers, etc.) live in @forwardimpact/libcli.
 */

import { colorize, colors } from "@forwardimpact/libcli";

/**
 * Format skill proficiency with color
 * @param {string} level
 * @returns {string}
 */
export function formatSkillProficiency(level) {
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
    "role-modeling": colors.yellow,
    exemplifying: colors.magenta,
  };
  const color = maturityColors[maturity] || colors.reset;
  const displayName = maturity.replace(/-/g, " ");
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
 * Format a change indicator
 * @param {number} change
 * @returns {string}
 */
export function formatChange(change) {
  if (change > 0) {
    return colorize(`\u2191${change}`, colors.green);
  } else if (change < 0) {
    return colorize(`\u2193${Math.abs(change)}`, colors.red);
  }
  return colorize("\u2192", colors.dim);
}
