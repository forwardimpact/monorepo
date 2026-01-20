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
 * @param {Object} skill - Skill with frontmatter and body
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.body - Markdown body content
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill({ frontmatter, body }, template) {
  const description = frontmatter.description.trim();
  const descriptionLines = description.split("\n");
  const isMultiline = descriptionLines.length > 1;

  const data = {
    frontmatter: {
      name: frontmatter.name,
      description: isMultiline ? description : undefined,
      descriptionSingleLine: !isMultiline ? description : undefined,
      lines: descriptionLines,
    },
    body,
  };
  return Mustache.render(template, data);
}

/**
 * Format agent skill for CLI output (markdown)
 * @param {Object} skill - Skill with frontmatter and body
 * @returns {string} Markdown formatted for CLI display
 */
export function formatAgentSkillForCli({ frontmatter, body }) {
  const lines = [];

  lines.push(`# Skill: ${frontmatter.name}`);
  lines.push("");
  lines.push(`**Description:** ${frontmatter.description.trim()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}
