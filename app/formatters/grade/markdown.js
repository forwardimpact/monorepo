/**
 * Grade formatting for markdown/CLI output
 */

import { tableToMarkdown, capitalize } from "../shared.js";
import { prepareGradesList, prepareGradeDetail } from "./shared.js";
import { getConceptEmoji } from "../../model/levels.js";

/**
 * Format grade list as markdown
 * @param {Array} grades - Raw grade entities
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function gradeListToMarkdown(grades, framework) {
  const { items } = prepareGradesList(grades);
  const emoji = framework ? getConceptEmoji(framework, "grade") : "📊";
  const lines = [`# ${emoji} Grades`, ""];

  const rows = items.map((g) => [
    g.id,
    g.displayName,
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillLevels?.primary || "-"),
  ]);

  lines.push(tableToMarkdown(["ID", "Name", "Years", "Primary Level"], rows));
  lines.push("");

  return lines.join("\n");
}

/**
 * Format grade detail as markdown
 * @param {Object} grade - Raw grade entity
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function gradeToMarkdown(grade, framework) {
  const view = prepareGradeDetail(grade);
  const emoji = framework ? getConceptEmoji(framework, "grade") : "📊";
  const lines = [`# ${emoji} ${view.displayName} (${view.id})`, ""];

  if (view.typicalExperienceRange) {
    lines.push(`**Experience**: ${view.typicalExperienceRange}`, "");
  }

  // Titles
  if (view.professionalTitle || view.managementTitle) {
    lines.push("## Titles", "");
    if (view.professionalTitle) {
      lines.push(`- **Professional Track**: ${view.professionalTitle}`);
    }
    if (view.managementTitle) {
      lines.push(`- **Management Track**: ${view.managementTitle}`);
    }
    lines.push("");
  }

  // Base skill levels
  lines.push("## Base Skill Levels", "");
  const skillRows = Object.entries(view.baseSkillLevels).map(
    ([type, level]) => [capitalize(type), capitalize(level)],
  );
  lines.push(tableToMarkdown(["Skill Type", "Level"], skillRows));
  lines.push("");

  // Base behaviour maturity
  if (
    view.baseBehaviourMaturity &&
    Object.keys(view.baseBehaviourMaturity).length > 0
  ) {
    lines.push("## Base Behaviour Maturity", "");
    const behaviourRows = Object.entries(view.baseBehaviourMaturity).map(
      ([type, maturity]) => [
        capitalize(type),
        capitalize(maturity.replace(/_/g, " ")),
      ],
    );
    lines.push(tableToMarkdown(["Type", "Maturity"], behaviourRows));
    lines.push("");
  }

  // Expectations
  if (view.expectations && Object.keys(view.expectations).length > 0) {
    lines.push("## Expectations", "");
    for (const [key, value] of Object.entries(view.expectations)) {
      lines.push(`- **${capitalize(key)}**: ${value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
