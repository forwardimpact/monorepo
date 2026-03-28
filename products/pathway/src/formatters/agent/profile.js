/**
 * Agent Profile Formatter
 *
 * Formats agent profile data into .md file content
 * following the Claude Code agent specification.
 *
 * Uses Mustache templates for flexible output formatting.
 * Templates are loaded from data/ directory with fallback to templates/ directory.
 */

import Mustache from "mustache";

import { trimValue, trimRequired, trimFields } from "../shared.js";
import { flattenToLine } from "../template-preprocess.js";

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
 * @param {string} params.frontmatter.model - Claude Code model (sonnet, opus, haiku)
 * @param {string[]} params.frontmatter.skills - Skill dirnames for auto-loading
 * @param {Object} params.bodyData - Structured body data
 * @param {string} params.bodyData.title - Agent title
 * @param {string} params.bodyData.stageDescription - Stage description text
 * @param {string} params.bodyData.stageId - Stage identifier (e.g. "plan", "code", "scaffold")
 * @param {string} params.bodyData.stageName - Human-readable stage name (e.g. "Plan", "Code", "Scaffold")
 * @param {string} params.bodyData.identity - Core identity text
 * @param {string} [params.bodyData.priority] - Priority/philosophy statement
 * @param {Array<{name: string, dirname: string, useWhen: string}>} params.bodyData.skillIndex - Skill index entries
 * @param {string} params.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} params.bodyData.workingStyles - Working style entries
 * @param {string[]} params.bodyData.constraints - List of constraints
 * @param {Array<{targetStageName: string, summaryInstruction: string, entryCriteria: string[]}>} params.bodyData.stageTransitions - Stage transition definitions
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentProfileData({ frontmatter, bodyData }) {
  const stageConstraints = (bodyData.stageConstraints || []).map((c) =>
    trimRequired(c),
  );
  const disciplineConstraints = (bodyData.disciplineConstraints || []).map(
    (c) => trimRequired(c),
  );
  const trackConstraints = (bodyData.trackConstraints || []).map((c) =>
    trimRequired(c),
  );
  const returnFormat = (bodyData.returnFormat || []).map((r) =>
    trimRequired(r),
  );
  const skillIndex = trimFields(bodyData.skillIndex, {
    name: "required",
    dirname: "required",
    useWhen: "required",
  });
  const workingStyles = trimFields(bodyData.workingStyles, {
    title: "required",
    content: "required",
  });

  // Prepare stage transitions for body rendering
  const stageTransitions = (bodyData.stageTransitions || []).map((t) => ({
    targetStageName: t.targetStageName,
    summaryInstruction: trimValue(t.summaryInstruction),
    entryCriteria: (t.entryCriteria || []).map((c) => trimRequired(c)),
    hasEntryCriteria: (t.entryCriteria || []).length > 0,
  }));

  const hasConstraints =
    stageConstraints.length > 0 ||
    disciplineConstraints.length > 0 ||
    trackConstraints.length > 0;

  return {
    // Frontmatter
    name: frontmatter.name,
    description: flattenToLine(frontmatter.description),
    model: frontmatter.model,
    skills: frontmatter.skills,

    // Body data - trim all string fields
    title: bodyData.title,
    stageDescription: trimValue(bodyData.stageDescription),
    stageId: bodyData.stageId,
    stageName: bodyData.stageName,
    identity: trimValue(bodyData.identity),
    priority: trimValue(bodyData.priority),
    skillIndex,
    hasSkills: skillIndex.length > 0,
    roleContext: trimValue(bodyData.roleContext),
    workingStyles,
    hasWorkingStyles: workingStyles.length > 0,
    stageConstraints,
    disciplineConstraints,
    trackConstraints,
    hasStageConstraints: stageConstraints.length > 0,
    hasDisciplineOrTrackConstraints:
      disciplineConstraints.length > 0 || trackConstraints.length > 0,
    hasConstraints,
    returnFormat,
    hasReturnFormat: returnFormat.length > 0,
    stageTransitions,
    hasStageTransitions: stageTransitions.length > 0,
  };
}

/**
 * Format agent profile as .md file content using Mustache template
 * @param {Object} profile - Profile with frontmatter and bodyData
 * @param {Object} profile.frontmatter - YAML frontmatter data
 * @param {string} profile.frontmatter.name - Agent name
 * @param {string} profile.frontmatter.description - Agent description
 * @param {string} profile.frontmatter.model - Claude Code model
 * @param {string[]} profile.frontmatter.skills - Skill dirnames
 * @param {Object} profile.bodyData - Structured body data
 * @param {string} profile.bodyData.title - Agent title (e.g. "Software Engineering - Platform - Plan Agent")
 * @param {string} profile.bodyData.stageDescription - Stage description text
 * @param {string} profile.bodyData.identity - Core identity text
 * @param {string} [profile.bodyData.priority] - Priority/philosophy statement (optional)
 * @param {Array<{name: string, dirname: string, useWhen: string}>} profile.bodyData.skillIndex - Skill index entries
 * @param {string} profile.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} profile.bodyData.workingStyles - Working style entries
 * @param {string[]} profile.bodyData.constraints - List of constraints
 * @param {Array} profile.bodyData.stageTransitions - Stage transitions for body section
 * @param {string} template - Mustache template string
 * @returns {string} Complete .md file content
 */
export function formatAgentProfile({ frontmatter, bodyData }, template) {
  const data = prepareAgentProfileData({ frontmatter, bodyData });
  return Mustache.render(template, data);
}
