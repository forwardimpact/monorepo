/**
 * Agent Profile Formatter
 *
 * Formats agent profile data into .agent.md file content
 * following the GitHub Copilot Custom Agents specification.
 */

/**
 * Format YAML frontmatter value
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
function formatYamlValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    // Quote strings that contain special characters or newlines
    if (value.includes("\n") || value.includes(":") || value.includes("#")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

/**
 * Format handoffs array as YAML
 * @param {Array} handoffs - Array of handoff objects
 * @returns {string[]} YAML lines for handoffs
 */
function formatHandoffs(handoffs) {
  const lines = ["handoffs:"];
  for (const handoff of handoffs) {
    lines.push(`  - label: ${formatYamlValue(handoff.label)}`);
    if (handoff.agent) {
      lines.push(`    agent: ${formatYamlValue(handoff.agent)}`);
    }

    // Format prompt as single-line string, replacing newlines with spaces
    const singleLinePrompt = handoff.prompt
      .replace(/\n\n+/g, " ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    lines.push(`    prompt: ${formatYamlValue(singleLinePrompt)}`);

    if (handoff.send !== undefined) {
      lines.push(`    send: ${formatYamlValue(handoff.send)}`);
    }
  }
  return lines;
}

/**
 * Format agent profile as .agent.md file content
 * @param {Object} profile - Profile with frontmatter and body
 * @param {Object} profile.frontmatter - YAML frontmatter data
 * @param {string} profile.frontmatter.name - Agent name
 * @param {string} profile.frontmatter.description - Agent description
 * @param {string[]} profile.frontmatter.tools - Available tools
 * @param {boolean} profile.frontmatter.infer - Whether to auto-select
 * @param {Array} [profile.frontmatter.handoffs] - Handoff definitions
 * @param {string} profile.body - Markdown body content
 * @returns {string} Complete .agent.md file content
 */
export function formatAgentProfile({ frontmatter, body }) {
  const lines = ["---"];

  // Name (optional but recommended)
  if (frontmatter.name) {
    lines.push(`name: ${formatYamlValue(frontmatter.name)}`);
  }

  // Description (required)
  lines.push(`description: ${formatYamlValue(frontmatter.description)}`);

  // Tools (optional, defaults to all)
  if (frontmatter.tools && frontmatter.tools.length > 0) {
    lines.push(`tools: ${formatYamlValue(frontmatter.tools)}`);
  }

  // Infer (optional)
  if (frontmatter.infer !== undefined) {
    lines.push(`infer: ${formatYamlValue(frontmatter.infer)}`);
  }

  // Handoffs (optional)
  if (frontmatter.handoffs && frontmatter.handoffs.length > 0) {
    lines.push(...formatHandoffs(frontmatter.handoffs));
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
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
