/**
 * Agent Skill Formatter
 *
 * Formats agent skill data into SKILL.md file content
 * following the Agent Skills Standard specification.
 */

/**
 * Format agent skill as SKILL.md file content
 * @param {Object} skill - Skill with frontmatter and body
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.body - Markdown body content
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill({ frontmatter, body }) {
  const lines = ["---"];

  // Name (required)
  lines.push(`name: ${frontmatter.name}`);

  // Description (required) - handle multiline
  const description = frontmatter.description.trim();
  if (description.includes("\n")) {
    lines.push("description: |");
    for (const line of description.split("\n")) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(`description: ${description}`);
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
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
