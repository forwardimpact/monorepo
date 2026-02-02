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
 * @param {string[]} profile.bodyData.capabilities - List of capability names
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
  const data = {
    // Frontmatter
    name: frontmatter.name,
    description: frontmatter.description,
    infer: frontmatter.infer,
    handoffs: frontmatter.handoffs || [],
    // Body data
    ...bodyData,
  };
  return Mustache.render(template, data);
}
