/**
 * Tool presentation helpers
 *
 * Shared utilities for formatting tool data across DOM and CLI outputs.
 */

/**
 * @typedef {Object} ToolUsage
 * @property {string} skillId
 * @property {string} skillName
 * @property {string} capabilityId
 * @property {string} useWhen
 */

/**
 * @typedef {Object} AggregatedTool
 * @property {string} name
 * @property {string} [url]
 * @property {string} description
 * @property {ToolUsage[]} usages
 */

/**
 * Aggregate tools from all skills, deduplicating by name
 * @param {Array} skills - All skills with toolReferences
 * @returns {AggregatedTool[]}
 */
export function aggregateTools(skills) {
  const toolMap = new Map();

  for (const skill of skills) {
    if (!skill.toolReferences) continue;

    for (const tool of skill.toolReferences) {
      const usage = {
        skillId: skill.id,
        skillName: skill.name,
        capabilityId: skill.capability,
        useWhen: tool.useWhen,
      };

      const existing = toolMap.get(tool.name);
      if (existing) {
        existing.usages.push(usage);
      } else {
        toolMap.set(tool.name, {
          name: tool.name,
          url: tool.url,
          description: tool.description,
          usages: [usage],
        });
      }
    }
  }

  return Array.from(toolMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Prepare tools list view data
 * @param {Array} skills - All skills
 * @returns {{ tools: AggregatedTool[], totalCount: number }}
 */
export function prepareToolsList(skills) {
  const tools = aggregateTools(skills);
  return {
    tools,
    totalCount: tools.length,
  };
}
