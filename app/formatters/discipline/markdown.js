/**
 * Discipline formatting for markdown/CLI output
 */

import { tableToMarkdown } from "../shared.js";
import { prepareDisciplinesList, prepareDisciplineDetail } from "./shared.js";

/**
 * Format discipline list as markdown
 * @param {Array} disciplines - Raw discipline entities
 * @returns {string}
 */
export function disciplineListToMarkdown(disciplines) {
  const { items } = prepareDisciplinesList(disciplines);
  const lines = ["# 📋 Disciplines", ""];

  const rows = items.map((d) => [
    d.name,
    `${d.coreSkillsCount}C`,
    `${d.supportingSkillsCount}S`,
    `${d.broadSkillsCount}B`,
  ]);

  lines.push(
    tableToMarkdown(["Discipline", "Core", "Supporting", "Broad"], rows),
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Format discipline detail as markdown
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {boolean} [context.showBehaviourModifiers=true] - Whether to show behaviour modifiers section
 * @returns {string}
 */
export function disciplineToMarkdown(
  discipline,
  { skills, behaviours, showBehaviourModifiers = true } = {},
) {
  const view = prepareDisciplineDetail(discipline, { skills, behaviours });
  const lines = [`# 📋 ${view.name}`, "", view.description, ""];

  // Core skills
  if (view.coreSkills.length > 0) {
    lines.push("## Core Skills", "");
    for (const s of view.coreSkills) {
      lines.push(`- ${s.name}`);
    }
    lines.push("");
  }

  // Supporting skills
  if (view.supportingSkills.length > 0) {
    lines.push("## Supporting Skills", "");
    for (const s of view.supportingSkills) {
      lines.push(`- ${s.name}`);
    }
    lines.push("");
  }

  // Broad skills
  if (view.broadSkills.length > 0) {
    lines.push("## Broad Skills", "");
    for (const s of view.broadSkills) {
      lines.push(`- ${s.name}`);
    }
    lines.push("");
  }

  // Behaviour modifiers
  if (showBehaviourModifiers && view.behaviourModifiers.length > 0) {
    lines.push("## Behaviour Modifiers", "");
    const modifierRows = view.behaviourModifiers.map((b) => [
      b.name,
      b.modifier > 0 ? `+${b.modifier}` : `${b.modifier}`,
    ]);
    lines.push(tableToMarkdown(["Behaviour", "Modifier"], modifierRows));
    lines.push("");
  }

  return lines.join("\n");
}
