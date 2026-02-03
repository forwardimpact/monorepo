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

import { trimValue, splitLines, trimFields } from "../shared.js";

/**
 * Prepare agent skill data for template rendering
 * Normalizes string values by trimming trailing newlines for consistent template output.
 * @param {Object} params
 * @param {Object} params.frontmatter - YAML frontmatter data
 * @param {string} params.frontmatter.name - Skill name (required)
 * @param {string} params.frontmatter.description - Skill description (required)
 * @param {string} [params.frontmatter.useWhen] - When to use this skill
 * @param {string} params.title - Human-readable skill title for heading
 * @param {Array} params.stages - Array of stage objects with stageName, focus, activities, ready
 * @param {string} params.reference - Reference content (markdown)
 * @param {Array} [params.toolReferences] - Array of tool reference objects
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentSkillData({
  frontmatter,
  title,
  stages,
  reference,
  toolReferences,
}) {
  // Process stages - trim focus and array values
  const processedStages = trimFields(stages, {
    focus: "required",
    activities: "array",
    ready: "array",
  });

  return {
    name: frontmatter.name,
    descriptionLines: splitLines(frontmatter.description),
    useWhenLines: splitLines(frontmatter.useWhen),
    title,
    stages: processedStages,
    reference: trimValue(reference) || "",
    toolReferences: toolReferences || [],
  };
}

/**
 * Format agent skill as SKILL.md file content using Mustache template
 * @param {Object} skill - Skill with frontmatter, title, stages, reference
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.title - Human-readable skill title for heading
 * @param {Array} skill.stages - Array of stage objects with stageName, focus, activities, ready
 * @param {string} skill.reference - Reference content (markdown)
 * @param {Array} [skill.toolReferences] - Array of tool reference objects
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill(
  { frontmatter, title, stages, reference, toolReferences },
  template,
) {
  const data = prepareAgentSkillData({
    frontmatter,
    title,
    stages,
    reference,
    toolReferences,
  });
  return Mustache.render(template, data);
}
