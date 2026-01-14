/**
 * Behaviour formatting for markdown/CLI output
 */

import { tableToMarkdown, capitalize } from "../shared.js";
import { prepareBehavioursList, prepareBehaviourDetail } from "./shared.js";

/**
 * Format behaviour list as markdown
 * @param {Array} behaviours - Raw behaviour entities
 * @returns {string}
 */
export function behaviourListToMarkdown(behaviours) {
  const { items } = prepareBehavioursList(behaviours);
  const lines = ["# 🧠 Behaviours", ""];

  for (const behaviour of items) {
    lines.push(`- **${behaviour.name}**: ${behaviour.truncatedDescription}`);
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Format behaviour detail as markdown
 * @param {Object} behaviour - Raw behaviour entity
 * @param {Object} context - Additional context
 * @param {Array} context.drivers - All drivers
 * @returns {string}
 */
export function behaviourToMarkdown(behaviour, { drivers }) {
  const view = prepareBehaviourDetail(behaviour, { drivers });
  const lines = [`# 🧠 ${view.name}`, "", view.description, ""];

  // Maturity descriptions table
  lines.push("## Maturity Levels", "");
  const maturityRows = Object.entries(view.maturityDescriptions).map(
    ([maturity, desc]) => [capitalize(maturity.replace(/_/g, " ")), desc],
  );
  lines.push(tableToMarkdown(["Maturity", "Description"], maturityRows));
  lines.push("");

  // Related drivers
  if (view.relatedDrivers.length > 0) {
    lines.push("## Linked to Drivers", "");
    for (const d of view.relatedDrivers) {
      lines.push(`- ${d.name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
