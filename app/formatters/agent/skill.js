/**
 * Agent Skill Formatter
 *
 * Formats agent skill data into SKILL.md file content
 * following the Agent Skills Standard specification.
 *
 * Uses Mustache templates for flexible output formatting.
 * Templates are loaded from data/ directory with fallback to templates/ directory.
 */

import Mustache from "mustache";

/**
 * Format agent skill as SKILL.md file content using Mustache template
 * @param {Object} skill - Skill with frontmatter, title, stages, reference
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.title - Human-readable skill title for heading
 * @param {Array} skill.stages - Array of stage objects with stageName, focus, activities, ready
 * @param {string} skill.reference - Reference content (markdown)
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill(
  { frontmatter, title, stages, reference },
  template,
) {
  const data = {
    name: frontmatter.name,
    descriptionLines: frontmatter.description.trim().split("\n"),
    title,
    stages,
    reference: reference ? reference.trim() : "",
  };
  return Mustache.render(template, data);
}

/**
 * Format agent skill for CLI output (markdown)
 * @param {Object} skill - Skill with frontmatter, title, stages, reference
 * @returns {string} Markdown formatted for CLI display
 */
export function formatAgentSkillForCli({
  frontmatter,
  title,
  stages,
  reference,
}) {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`**Name:** ${frontmatter.name}`);
  lines.push("");
  lines.push(`**Description:** ${frontmatter.description.trim()}`);
  lines.push("");

  if (stages && stages.length > 0) {
    lines.push("## Stage Guidance");
    lines.push("");
    for (const stage of stages) {
      lines.push(`### ${stage.stageName} Stage`);
      lines.push("");
      lines.push(`**Focus:** ${stage.focus.trim()}`);
      lines.push("");
      if (stage.activities && stage.activities.length > 0) {
        lines.push("**Activities:**");
        for (const item of stage.activities) {
          lines.push(`- ${item}`);
        }
        lines.push("");
      }
      if (stage.ready && stage.ready.length > 0) {
        lines.push(`**Ready for ${stage.nextStageName} when:**`);
        for (const item of stage.ready) {
          lines.push(`- [ ] ${item}`);
        }
        lines.push("");
      }
    }
  }

  if (reference) {
    lines.push("## Reference");
    lines.push("");
    lines.push(reference.trim());
  }

  return lines.join("\n");
}
