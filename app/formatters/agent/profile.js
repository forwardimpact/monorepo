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
 * @param {Object} profile - Profile with frontmatter and body
 * @param {Object} profile.frontmatter - YAML frontmatter data
 * @param {string} profile.frontmatter.name - Agent name
 * @param {string} profile.frontmatter.description - Agent description
 * @param {string[]} profile.frontmatter.tools - Available tools
 * @param {boolean} profile.frontmatter.infer - Whether to auto-select
 * @param {Array} [profile.frontmatter.handoffs] - Handoff definitions
 * @param {string} profile.body - Markdown body content
 * @param {string} template - Mustache template string
 * @returns {string} Complete .agent.md file content
 */
export function formatAgentProfile({ frontmatter, body }, template) {
  const data = {
    frontmatter: {
      name: frontmatter.name,
      description: frontmatter.description,
      tools: frontmatter.tools ? JSON.stringify(frontmatter.tools) : undefined,
      infer: frontmatter.infer,
      handoffs: frontmatter.handoffs || [],
    },
    body,
  };
  return Mustache.render(template, data);
}

/**
 * Format agent profile for CLI output (markdown)
 * @param {Object} profile - Profile with frontmatter and body
 * @returns {string} Markdown formatted for CLI display
 */
export function formatAgentProfileForCli({ frontmatter, body }) {
  const lines = [];

  lines.push(`# Agent Profile: ${frontmatter.name}`);
  lines.push("");
  lines.push(`**Description:** ${frontmatter.description}`);
  lines.push("");
  lines.push(`**Tools:** ${frontmatter.tools.join(", ")}`);
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
  lines.push(body);

  return lines.join("\n");
}
