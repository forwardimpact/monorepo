/**
 * Agent Skill Formatter
 *
 * Formats agent skill data into SKILL.md, scripts/install.sh, and
 * references/REFERENCE.md file content following the Agent Skills Standard
 * specification with progressive disclosure.
 *
 * Uses Mustache templates for flexible output formatting.
 * Templates are loaded from data/ directory with fallback to templates/ directory.
 */

import Mustache from "mustache";

import { trimValue, splitLines, trimFields } from "../shared.js";
import { flattenToLine } from "../template-preprocess.js";

/**
 * Lowercase the first character of a string
 * @param {string} s
 * @returns {string}
 */
const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Prepare agent skill data for template rendering
 * Normalizes string values by trimming trailing newlines for consistent template output.
 * @param {Object} params
 * @param {Object} params.frontmatter - YAML frontmatter data
 * @param {string} params.frontmatter.name - Skill name (required)
 * @param {string} params.frontmatter.description - Skill description (required)
 * @param {string} [params.frontmatter.useWhen] - When to use this skill
 * @param {string} params.title - Human-readable skill title for heading
 * @param {Array} params.stages - Array of stage objects with stageName, focus, readChecklist, confirmChecklist
 * @param {string} params.instructions - Workflow guidance content (markdown)
 * @param {string} params.installScript - Shell commands for install script
 * @param {string} params.implementationReference - Reference content (markdown)
 * @param {Array} [params.toolReferences] - Array of tool reference objects
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentSkillData({
  frontmatter,
  title,
  stages,
  instructions,
  installScript,
  implementationReference,
  toolReferences,
}) {
  // Process stages - trim focus and array values
  const processedStages = trimFields(stages, {
    focus: "required",
    readChecklist: "array",
    confirmChecklist: "array",
  });

  // Flatten multi-line strings to single line for front matter compatibility
  const description = flattenToLine(frontmatter.description);
  const useWhen = lcFirst(flattenToLine(frontmatter.useWhen));

  // Keep line arrays for body rendering
  const descriptionLines = splitLines(frontmatter.description);

  const trimmedInstructions = trimValue(instructions) || "";
  const trimmedInstallScript = trimValue(installScript) || "";
  const trimmedReference = trimValue(implementationReference) || "";
  const tools = toolReferences || [];

  return {
    name: frontmatter.name,
    // Single-line versions for front matter
    description,
    hasDescription: !!description,
    useWhen,
    hasUseWhen: !!useWhen,
    // Line arrays for body content
    descriptionLines,
    title,
    stages: processedStages,
    hasStages: processedStages.length > 0,
    instructions: trimmedInstructions,
    hasInstructions: !!trimmedInstructions,
    installScript: trimmedInstallScript,
    hasInstallScript: !!trimmedInstallScript,
    implementationReference: trimmedReference,
    hasReference: !!trimmedReference,
    toolReferences: tools,
    hasToolReferences: tools.length > 0,
  };
}

/**
 * Format agent skill as SKILL.md file content using Mustache template
 * @param {Object} skill - Skill with frontmatter, title, stages, instructions, installScript, implementationReference
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.title - Human-readable skill title for heading
 * @param {Array} skill.stages - Array of stage objects with stageName, focus, readChecklist, confirmChecklist
 * @param {string} skill.instructions - Workflow guidance (markdown)
 * @param {string} skill.installScript - Shell commands for install script
 * @param {string} skill.implementationReference - Reference content (markdown)
 * @param {Array} [skill.toolReferences] - Array of tool reference objects
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill(
  {
    frontmatter,
    title,
    stages,
    instructions,
    installScript,
    implementationReference,
    toolReferences,
  },
  template,
) {
  const data = prepareAgentSkillData({
    frontmatter,
    title,
    stages,
    instructions,
    installScript,
    implementationReference,
    toolReferences,
  });
  return Mustache.render(template, data);
}

/**
 * Format install script file content using Mustache template
 * @param {Object} skill - Skill data with installScript and frontmatter
 * @param {string} template - Mustache template string for install script
 * @returns {string} Complete install.sh file content
 */
export function formatInstallScript(skill, template) {
  const data = {
    name: skill.frontmatter.name,
    installScript: trimValue(skill.installScript) || "",
  };
  return Mustache.render(template, data);
}

/**
 * Format reference file content using Mustache template
 * @param {Object} skill - Skill data with implementationReference and title
 * @param {string} template - Mustache template string for reference
 * @returns {string} Complete REFERENCE.md file content
 */
export function formatReference(skill, template) {
  const data = {
    title: skill.title,
    implementationReference: trimValue(skill.implementationReference) || "",
  };
  return Mustache.render(template, data);
}
