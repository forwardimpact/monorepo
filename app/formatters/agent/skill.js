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
 * @param {Object} skill - Skill with frontmatter, title, applicability, guidance, verificationCriteria
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.title - Human-readable skill title for heading
 * @param {string[]} skill.applicability - When to use this skill (list)
 * @param {string} skill.guidance - Main instructional content (markdown)
 * @param {string[]} skill.verificationCriteria - Checklist items for verification
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill(
  { frontmatter, title, applicability, guidance, verificationCriteria },
  template,
) {
  const data = {
    name: frontmatter.name,
    descriptionLines: frontmatter.description.trim().split("\n"),
    title,
    applicability,
    guidance: guidance ? guidance.trim() : "",
    verificationCriteria,
  };
  return Mustache.render(template, data);
}

/**
 * Format agent skill for CLI output (markdown)
 * @param {Object} skill - Skill with frontmatter, title, applicability, guidance, verificationCriteria
 * @returns {string} Markdown formatted for CLI display
 */
export function formatAgentSkillForCli({
  frontmatter,
  title,
  applicability,
  guidance,
  verificationCriteria,
}) {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`**Name:** ${frontmatter.name}`);
  lines.push("");
  lines.push(`**Description:** ${frontmatter.description.trim()}`);
  lines.push("");

  if (applicability && applicability.length > 0) {
    lines.push("## When to Use This Skill");
    lines.push("");
    for (const item of applicability) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (guidance) {
    lines.push(guidance.trim());
    lines.push("");
  }

  if (verificationCriteria && verificationCriteria.length > 0) {
    lines.push("## Verification Criteria");
    lines.push("");
    for (const item of verificationCriteria) {
      lines.push(`- [ ] ${item}`);
    }
  }

  return lines.join("\n");
}
