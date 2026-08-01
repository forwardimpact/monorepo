/**
 * Agent Profile Formatter
 *
 * Formats agent profile data into .md file content.
 * It follows the Claude Code agent specification.
 *
 * Mustache templates keep the output format flexible.
 * Templates come from the data/ directory. The fallback is the templates/
 * directory.
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
 * Compact a working-style body into a single inline clause for one bullet.
 * It drops a short label at the start ("Before taking action:"). It collapses
 * an enumerated checklist ("1. a 2. b 3. c") into one semicolon-joined
 * phrase. The style then reads as a trait. It does not read as a multi-line
 * procedure.
 * @param {string} content - Authored working-style markdown
 * @returns {string} Single-line compact clause
 */
function compactWorkingStyle(content) {
  const flat = flattenToLine(content);
  const unlabelled = flat.replace(/^[^.:]{1,40}:\s*/, "");
  const items = unlabelled
    .split(/\s*\d+\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= 1) return unlabelled;
  const [first, ...rest] = items;
  return [
    first,
    ...rest.map((s) => s.charAt(0).toLowerCase() + s.slice(1)),
  ].join("; ");
}

/**
 * Prepare agent profile data for the template
 * It trims trailing newlines from string values. The template output then
 * stays consistent.
 * @param {Object} params
 * @param {Object} params.frontmatter - YAML frontmatter data
 * @param {string} params.frontmatter.name - Agent name
 * @param {string} params.frontmatter.description - Agent description
 * @param {string} params.frontmatter.model - Claude Code model (sonnet, opus, haiku)
 * @param {string[]} params.frontmatter.skills - Skill dirnames to load automatically
 * @param {Object} params.bodyData - Structured body data
 * @param {string} params.bodyData.title - Agent title
 * @param {string} params.bodyData.identity - Core identity text
 * @param {string} [params.bodyData.priority] - Priority/philosophy statement
 * @param {Array<{name: string, dirname: string, useWhen: string}>} params.bodyData.skillIndex - Skill index entries
 * @param {string} params.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} params.bodyData.workingStyles - Working style entries
 * @param {string[]} params.bodyData.disciplineConstraints - Discipline constraints
 * @param {string[]} params.bodyData.trackConstraints - Track constraints
 * @returns {Object} Data object ready for Mustache template
 */
function prepareAgentProfileData({ frontmatter, bodyData }) {
  // The profile concatenates the discipline and track constraint lists.
  // De-duplicate them. A constraint renders only once, even when both the
  // discipline and the track declare it, or one list repeats it.
  const seenConstraints = new Set();
  const dedupeConstraints = (list) =>
    (list || [])
      .map((c) => trimRequired(c))
      .filter((c) => {
        const key = c.toLowerCase();
        if (seenConstraints.has(key)) return false;
        seenConstraints.add(key);
        return true;
      });
  const disciplineConstraints = dedupeConstraints(
    bodyData.disciplineConstraints,
  );
  const trackConstraints = dedupeConstraints(bodyData.trackConstraints);
  // Flatten the "Use when" cell so each skill renders on one physical table
  // row. A multi-line cell breaks the markdown table. It also inflates the
  // profile's line count against its layer cap.
  const skillIndex = trimFields(bodyData.skillIndex, {
    name: "required",
    dirname: "required",
    useWhen: "required",
  }).map((entry) => ({ ...entry, useWhen: flattenToLine(entry.useWhen) }));
  // Render each working style as one compact bullet. Do not render a titled
  // multi-paragraph block. The profile then stays within its layer cap.
  const workingStyles = trimFields(bodyData.workingStyles, {
    title: "required",
    content: "required",
  }).map((entry) => ({
    ...entry,
    content: compactWorkingStyle(entry.content),
  }));

  const hasConstraints =
    disciplineConstraints.length > 0 || trackConstraints.length > 0;

  return {
    // Frontmatter
    name: frontmatter.name,
    description: flattenToLine(frontmatter.description),
    model: frontmatter.model,
    skills: frontmatter.skills,

    // Body data - trim all string fields
    title: bodyData.title,
    identity: trimValue(bodyData.identity),
    priority: trimValue(bodyData.priority),
    skillIndex,
    hasSkills: skillIndex.length > 0,
    roleContext: trimValue(bodyData.roleContext),
    workingStyles,
    hasWorkingStyles: workingStyles.length > 0,
    disciplineConstraints,
    trackConstraints,
    hasConstraints,
  };
}

/**
 * Format agent profile as .md file content with a Mustache template
 * @param {Object} profile - Profile with frontmatter and bodyData
 * @param {Object} profile.frontmatter - YAML frontmatter data
 * @param {string} profile.frontmatter.name - Agent name
 * @param {string} profile.frontmatter.description - Agent description
 * @param {string} profile.frontmatter.model - Claude Code model
 * @param {string[]} profile.frontmatter.skills - Skill dirnames
 * @param {Object} profile.bodyData - Structured body data
 * @param {string} profile.bodyData.title - Agent title (e.g. "Software Engineering - Platform")
 * @param {string} profile.bodyData.identity - Core identity text
 * @param {string} [profile.bodyData.priority] - Priority/philosophy statement (optional)
 * @param {Array<{name: string, dirname: string, useWhen: string}>} profile.bodyData.skillIndex - Skill index entries
 * @param {string} profile.bodyData.roleContext - Role context text
 * @param {WorkingStyleEntry[]} profile.bodyData.workingStyles - Working style entries
 * @param {string[]} profile.bodyData.disciplineConstraints - Discipline constraints
 * @param {string[]} profile.bodyData.trackConstraints - Track constraints
 * @param {string} template - Mustache template string
 * @returns {string} Complete .md file content
 */
export function formatAgentProfile({ frontmatter, bodyData }, template) {
  const data = prepareAgentProfileData({ frontmatter, bodyData });
  return Mustache.render(template, data);
}
