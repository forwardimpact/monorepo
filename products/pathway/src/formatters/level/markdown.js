/**
 * Level formatting for markdown/CLI output
 */

import { tableToMarkdown, capitalize } from "../shared.js";
import { prepareLevelsList, prepareLevelDetail } from "./shared.js";
import { getConceptEmoji } from "@forwardimpact/map/levels";

/**
 * Format level list as markdown
 * @param {Array} levels - Raw level entities
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function levelListToMarkdown(levels, framework) {
  const { items } = prepareLevelsList(levels);
  const emoji = framework ? getConceptEmoji(framework, "level") : "📊";
  const lines = [`# ${emoji} Levels`, ""];

  const rows = items.map((g) => [
    g.id,
    g.displayName,
    g.typicalExperienceRange || "-",
    capitalize(g.baseSkillProficiencies?.primary || "-"),
  ]);

  lines.push(tableToMarkdown(["ID", "Name", "Years", "Primary Level"], rows));
  lines.push("");

  return lines.join("\n");
}

/**
 * Format level detail as markdown
 * @param {Object} level - Raw level entity
 * @param {Object} [framework] - Framework config for emojis
 * @returns {string}
 */
export function levelToMarkdown(level, framework) {
  const view = prepareLevelDetail(level);
  const emoji = framework ? getConceptEmoji(framework, "level") : "📊";
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

  // Base skill proficiencies
  lines.push("## Base Skill Proficiencies", "");
  const skillRows = Object.entries(view.baseSkillProficiencies).map(
    ([type, level]) => [capitalize(type), capitalize(level)],
  );
  lines.push(tableToMarkdown(["Skill Type", "Level"], skillRows));
  lines.push("");

  // Base behaviour maturity
  if (view.baseBehaviourMaturity) {
    lines.push("## Base Behaviour Maturity", "");
    lines.push(capitalize(view.baseBehaviourMaturity.replace(/_/g, " ")));
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
