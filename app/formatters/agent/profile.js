/**
 * Agent Profile Formatter
 *
 * Formats agent profile data into .agent.md file content
 * following the GitHub Copilot Custom Agents specification.
 *
 * Uses Mustache templates for flexible output formatting.
 * Templates are loaded from data/ directory with fallback to templates/ directory.
 */

import Mustache from "mustache";

import { trimValue, trimRequired, trimFields } from "../shared.js";

/**
 * Prepare agent profile data for template rendering
 * Normalizes string values by trimming trailing newlines for consistent template output.
 * @param {Object} params
 * @param {Object} params.frontmatter - YAML frontmatter data
 * @param {string} params.frontmatter.name - Agent name
 * @param {string} params.frontmatter.description - Agent description
 * @param {boolean} params.frontmatter.infer - Whether to auto-select
 * @param {Array} [params.frontmatter.handoffs] - Handoff definitions
 * @param {Object} params.bodyData - Structured body data
 * @param {string} params.bodyData.title - Agent title
 * @param {string} params.bodyData.stageDescription - Stage description text
 * @param {string} params.bodyData.identity - Core identity text
 * @param {string} [params.bodyData.priority] - Priority/philosophy statement
 * @param {Array<{name: string, dirname: string, useWhen: string}>} params.bodyData.skillIndex - Skill index entries
 * @param {Array<{index: number, text: string}>} params.bodyData.beforeMakingChanges - Numbered steps
 * @param {string} [params.bodyData.delegation] - Delegation guidance
 * @param {string} params.bodyData.operationalContext - Operational context text
 * @param {string} params.bodyData.workingStyle - Working style markdown section
 * @param {string} [params.bodyData.beforeHandoff] - Before handoff checklist markdown
 * @param {string[]} params.bodyData.constraints - List of constraints
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentProfileData({ frontmatter, bodyData }) {
  // Trim array fields using helpers
  const handoffs = trimFields(frontmatter.handoffs, { prompt: "required" });
  const beforeMakingChanges = trimFields(bodyData.beforeMakingChanges, {
    text: "required",
  });

  // Trim simple string arrays
  const constraints = (bodyData.constraints || []).map((c) => trimRequired(c));

  // Trim skill index entries
  const skillIndex = (bodyData.skillIndex || []).map((s) => ({
    name: trimRequired(s.name),
    dirname: trimRequired(s.dirname),
    useWhen: trimRequired(s.useWhen),
  }));

  return {
    // Frontmatter
    name: frontmatter.name,
    description: trimRequired(frontmatter.description),
    infer: frontmatter.infer,
    handoffs,

    // Body data - trim all string fields
    title: bodyData.title,
    stageDescription: trimValue(bodyData.stageDescription),
    identity: trimValue(bodyData.identity),
    priority: trimValue(bodyData.priority),
    skillIndex,
    hasSkills: skillIndex.length > 0,
    beforeMakingChanges,
    delegation: trimValue(bodyData.delegation),
    operationalContext: trimValue(bodyData.operationalContext),
    workingStyle: trimValue(bodyData.workingStyle),
    beforeHandoff: trimValue(bodyData.beforeHandoff),
    constraints,
  };
}

/**
 * Format agent profile as .agent.md file content using Mustache template
 * @param {Object} profile - Profile with frontmatter and bodyData
 * @param {Object} profile.frontmatter - YAML frontmatter data
 * @param {string} profile.frontmatter.name - Agent name
 * @param {string} profile.frontmatter.description - Agent description
 * @param {string[]} profile.frontmatter.tools - Available tools
 * @param {boolean} profile.frontmatter.infer - Whether to auto-select
 * @param {Array} [profile.frontmatter.handoffs] - Handoff definitions
 * @param {Object} profile.bodyData - Structured body data
 * @param {string} profile.bodyData.title - Agent title (e.g. "Software Engineering - Platform - Plan Agent")
 * @param {string} profile.bodyData.stageDescription - Stage description text
 * @param {string} profile.bodyData.identity - Core identity text
 * @param {string} [profile.bodyData.priority] - Priority/philosophy statement (optional)
 * @param {Array<{name: string, dirname: string, useWhen: string}>} profile.bodyData.skillIndex - Skill index entries
 * @param {Array<{index: number, text: string}>} profile.bodyData.beforeMakingChanges - Numbered steps
 * @param {string} [profile.bodyData.delegation] - Delegation guidance (optional)
 * @param {string} profile.bodyData.operationalContext - Operational context text
 * @param {string} profile.bodyData.workingStyle - Working style markdown section
 * @param {string} [profile.bodyData.beforeHandoff] - Before handoff checklist markdown (optional)
 * @param {string[]} profile.bodyData.constraints - List of constraints
 * @param {string} template - Mustache template string
 * @returns {string} Complete .agent.md file content
 */
export function formatAgentProfile({ frontmatter, bodyData }, template) {
  const data = prepareAgentProfileData({ frontmatter, bodyData });
  return Mustache.render(template, data);
}
