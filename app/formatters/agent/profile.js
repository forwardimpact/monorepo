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

/**
 * Format agent profile for CLI output (markdown)
 * @param {Object} profile - Profile with frontmatter and bodyData
 * @returns {string} Markdown formatted for CLI display
 */
export function formatAgentProfileForCli({ frontmatter, bodyData }) {
  const lines = [];

  lines.push(`# Agent Profile: ${frontmatter.name}`);
  lines.push("");
  lines.push(`**Description:** ${frontmatter.description}`);
  lines.push("");
  lines.push(`**Infer:** ${frontmatter.infer}`);

  if (frontmatter.handoffs && frontmatter.handoffs.length > 0) {
    lines.push("");
    lines.push("**Handoffs:**");
    for (const handoff of frontmatter.handoffs) {
      const target = handoff.agent ? ` → ${handoff.agent}` : " (self)";
      lines.push(`  - ${handoff.label}${target}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Render structured body data
  lines.push(`# ${bodyData.title}`);
  lines.push("");
  lines.push(bodyData.stageDescription);
  lines.push("");

  lines.push("## Core Identity");
  lines.push("");
  lines.push(bodyData.identity);
  lines.push("");

  if (bodyData.priority) {
    lines.push(bodyData.priority);
    lines.push("");
  }

  if (bodyData.capabilities && bodyData.capabilities.length > 0) {
    lines.push("Your primary capabilities:");
    for (const cap of bodyData.capabilities) {
      lines.push(`- ${cap}`);
    }
    lines.push("");
  }

  if (bodyData.beforeMakingChanges && bodyData.beforeMakingChanges.length > 0) {
    lines.push("Before making changes:");
    for (const step of bodyData.beforeMakingChanges) {
      lines.push(`${step.index}. ${step.text}`);
    }
    lines.push("");
  }

  if (bodyData.delegation) {
    lines.push("## Delegation");
    lines.push("");
    lines.push(bodyData.delegation);
    lines.push("");
  }

  lines.push("## Operational Context");
  lines.push("");
  lines.push(bodyData.operationalContext);
  lines.push("");

  lines.push(bodyData.workingStyle);

  if (bodyData.beforeHandoff) {
    lines.push("## Before Handoff");
    lines.push("");
    lines.push(
      "Before offering a handoff, verify and summarize completion of these items:",
    );
    lines.push("");
    lines.push(bodyData.beforeHandoff);
    lines.push("");
    lines.push(
      "When verified, summarize what was accomplished then offer the handoff.",
    );
    lines.push("If items are incomplete, explain what remains.");
    lines.push("");
  }

  lines.push("## Return Format");
  lines.push("");
  lines.push("When completing work (for handoff or as a subagent), provide:");
  lines.push("");
  lines.push("1. **Work completed**: What was accomplished");
  lines.push(
    "2. **Checklist status**: Items verified from Before Handoff section",
  );
  lines.push("3. **Recommendation**: Ready for next stage, or needs more work");
  lines.push("");

  if (bodyData.constraints && bodyData.constraints.length > 0) {
    lines.push("## Constraints");
    lines.push("");
    for (const constraint of bodyData.constraints) {
      lines.push(`- ${constraint}`);
    }
  }

  return lines.join("\n");
}
