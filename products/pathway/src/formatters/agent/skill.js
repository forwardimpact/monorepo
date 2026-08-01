/**
 * Agent Skill Formatter
 *
 * Formats agent skill data into SKILL.md, scripts/install.sh, and
 * references/{name}.md file content. It follows the Agent Skills Standard
 * specification and uses progressive disclosure.
 *
 * Mustache templates keep the output format flexible.
 * Templates come from the data/ directory. The fallback is the templates/
 * directory.
 */

import Mustache from "mustache";

import { trimValue, splitLines } from "../shared.js";
import { flattenToLine } from "../template-preprocess.js";

/**
 * Lowercase the first character of a string
 * @param {string} s
 * @returns {string}
 */
const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Prepare agent skill data for the template
 * It trims trailing newlines from string values. The template output then
 * stays consistent.
 * @param {Object} params
 * @param {Object} params.frontmatter - YAML frontmatter data
 * @param {string} params.frontmatter.name - Skill name (required)
 * @param {string} params.frontmatter.description - Skill description (required)
 * @param {string} [params.frontmatter.useWhen] - When to use this skill
 * @param {string} params.title - Human-readable skill title for the heading
 * @param {string} [params.focus] - Skill focus text
 * @param {Array} [params.readChecklist] - Read-do checklist items
 * @param {Array} [params.confirmChecklist] - Do-confirm checklist items
 * @param {string} params.instructions - Workflow guidance content (markdown)
 * @param {string} params.installScript - Shell commands for the install script
 * @param {Array} [params.toolReferences] - Array of tool reference objects
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentSkillData({
  frontmatter,
  title,
  focus,
  readChecklist,
  confirmChecklist,
  instructions,
  installScript,
  toolReferences,
}) {
  // Flatten multi-line strings to one line so they fit the front matter
  const description = flattenToLine(frontmatter.description);
  const useWhen = lcFirst(flattenToLine(frontmatter.useWhen));

  // Keep line arrays to render the body
  const descriptionLines = splitLines(frontmatter.description);

  const trimmedFocus = trimValue(focus) || "";
  const trimmedReadChecklist = (readChecklist || []).map((c) => trimValue(c));
  const trimmedConfirmChecklist = (confirmChecklist || []).map((c) =>
    trimValue(c),
  );
  const trimmedInstructions = trimValue(instructions) || "";
  const trimmedInstallScript = trimValue(installScript) || "";
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
    focus: trimmedFocus,
    hasFocus: !!trimmedFocus,
    readChecklist: trimmedReadChecklist,
    hasReadChecklist: trimmedReadChecklist.length > 0,
    confirmChecklist: trimmedConfirmChecklist,
    hasConfirmChecklist: trimmedConfirmChecklist.length > 0,
    instructions: trimmedInstructions,
    hasInstructions: !!trimmedInstructions,
    installScript: trimmedInstallScript,
    hasInstallScript: !!trimmedInstallScript,
    toolReferences: tools,
    hasToolReferences: tools.length > 0,
  };
}

/**
 * Format agent skill as SKILL.md file content with a Mustache template
 * @param {Object} skill - Skill with frontmatter, title, focus, readChecklist, confirmChecklist, instructions, installScript
 * @param {Object} skill.frontmatter - YAML frontmatter data
 * @param {string} skill.frontmatter.name - Skill name (required)
 * @param {string} skill.frontmatter.description - Skill description (required)
 * @param {string} skill.title - Human-readable skill title for the heading
 * @param {string} [skill.focus] - Skill focus text
 * @param {Array} [skill.readChecklist] - Read-do checklist items
 * @param {Array} [skill.confirmChecklist] - Do-confirm checklist items
 * @param {string} skill.instructions - Workflow guidance (markdown)
 * @param {string} skill.installScript - Shell commands for the install script
 * @param {Array} [skill.toolReferences] - Array of tool reference objects
 * @param {string} template - Mustache template string
 * @returns {string} Complete SKILL.md file content
 */
export function formatAgentSkill(
  {
    frontmatter,
    title,
    focus,
    readChecklist,
    confirmChecklist,
    instructions,
    installScript,
    toolReferences,
  },
  template,
) {
  const data = prepareAgentSkillData({
    frontmatter,
    title,
    focus,
    readChecklist,
    confirmChecklist,
    instructions,
    installScript,
    toolReferences,
  });
  return Mustache.render(template, data);
}

/**
 * Format the content of the install script file with a Mustache template
 * @param {Object} skill - Skill data with installScript and frontmatter
 * @param {string} template - Mustache template string for the install script
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
 * Format the reference file content with a Mustache template
 * @param {Object} entry - Reference entry with name, title, body
 * @param {string} entry.title - Document title
 * @param {string} entry.body - Reference content (markdown body)
 * @param {string} template - Mustache template string for the reference
 * @returns {string} Complete reference file content
 */
export function formatReference(entry, template) {
  const data = {
    title: entry.title,
    body: entry.body,
  };
  return Mustache.render(template, data);
}
