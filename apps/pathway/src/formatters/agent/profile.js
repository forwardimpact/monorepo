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
import {
  flattenToLine,
  preprocessArrayFrontmatter,
} from "../template-preprocess.js";

/**
 * @typedef {Object} WorkingStyleEntry
 * @property {string} title - Section title
 * @property {string} content - Working style content (markdown)
 */

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
 * @param {string} params.bodyData.stageId - Stage identifier (e.g. "plan", "code", "onboard")
 * @param {string} params.bodyData.stageName - Human-readable stage name (e.g. "Plan", "Code", "Onboard")
 * @param {boolean} params.bodyData.isOnboard - Whether this is the onboard stage
 * @param {string} params.bodyData.identity - Core identity text
 * @param {string} [params.bodyData.priority] - Priority/philosophy statement
 * @param {Array<{name: string, dirname: string, useWhen: string}>} params.bodyData.skillIndex - Skill index entries
 * @param {string} params.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} params.bodyData.workingStyles - Working style entries
 * @param {string[]} params.bodyData.constraints - List of constraints
 * @param {Array<{id: string, name: string, description: string}>} [params.bodyData.agentIndex] - List of all available agents
 * @param {boolean} [params.bodyData.hasAgentIndex] - Whether agent index is available
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentProfileData({ frontmatter, bodyData }) {
  // Preprocess handoffs - flatten prompt field for front matter compatibility
  const preprocessedHandoffs = preprocessArrayFrontmatter(
    frontmatter.handoffs,
    ["prompt"],
  );
  // Then trim as before
  const handoffs = trimFields(preprocessedHandoffs, { prompt: "required" });

  const constraints = (bodyData.constraints || []).map((c) => trimRequired(c));
  const skillIndex = trimFields(bodyData.skillIndex, {
    name: "required",
    dirname: "required",
    useWhen: "required",
  });
  const agentIndex = trimFields(bodyData.agentIndex, {
    id: "required",
    name: "required",
    description: "required",
  });
  const workingStyles = trimFields(bodyData.workingStyles, {
    title: "required",
    content: "required",
  });

  return {
    // Frontmatter - flatten description for single-line front matter
    name: frontmatter.name,
    description: flattenToLine(frontmatter.description),
    infer: frontmatter.infer,
    handoffs,

    // Body data - trim all string fields
    title: bodyData.title,
    stageDescription: trimValue(bodyData.stageDescription),
    stageId: bodyData.stageId,
    stageName: bodyData.stageName,
    isOnboard: bodyData.isOnboard,
    identity: trimValue(bodyData.identity),
    priority: trimValue(bodyData.priority),
    skillIndex,
    hasSkills: skillIndex.length > 0,
    roleContext: trimValue(bodyData.roleContext),
    workingStyles,
    hasWorkingStyles: workingStyles.length > 0,
    constraints,
    hasConstraints: constraints.length > 0,
    agentIndex,
    hasAgentIndex: agentIndex.length > 0,
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
 * @param {string} profile.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} profile.bodyData.workingStyles - Working style entries
 * @param {string[]} profile.bodyData.constraints - List of constraints
 * @param {string} template - Mustache template string
 * @returns {string} Complete .agent.md file content
 */
export function formatAgentProfile({ frontmatter, bodyData }, template) {
  const data = prepareAgentProfileData({ frontmatter, bodyData });
  return Mustache.render(template, data);
}
