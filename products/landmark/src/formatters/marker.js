/**
 * Formatters for the `marker` command.
 */

import { renderHeader } from "./shared.js";

const PROFICIENCY_ORDER = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];

export function toText(view) {
  const lines = [renderHeader(`Markers for ${view.name} (${view.skill})`), ""];

  const orderedLevels = PROFICIENCY_ORDER.filter((l) => view.markers[l]);

  for (const level of orderedLevels) {
    const entry = view.markers[level];
    lines.push(`    ${level}:`);
    if (entry.human && entry.human.length > 0) {
      lines.push("      human:");
      for (const m of entry.human) {
        lines.push(`        - ${m}`);
      }
    }
    if (entry.agent && entry.agent.length > 0) {
      lines.push("      agent:");
      for (const m of entry.agent) {
        lines.push(`        - ${m}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const lines = [`# Markers for ${view.name} (${view.skill})`, ""];

  const orderedLevels = PROFICIENCY_ORDER.filter((l) => view.markers[l]);

  for (const level of orderedLevels) {
    const entry = view.markers[level];
    lines.push(`## ${level}`);
    lines.push("");
    if (entry.human && entry.human.length > 0) {
      lines.push("**Human:**");
      for (const m of entry.human) {
        lines.push(`- ${m}`);
      }
      lines.push("");
    }
    if (entry.agent && entry.agent.length > 0) {
      lines.push("**Agent:**");
      for (const m of entry.agent) {
        lines.push(`- ${m}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
