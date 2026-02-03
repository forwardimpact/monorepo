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
    useWhenLines: frontmatter.useWhen
      ? frontmatter.useWhen.trim().split("\n")
      : [],
    title,
    stages,
    reference: reference ? reference.trim() : "",
  };
  return Mustache.render(template, data);
}
