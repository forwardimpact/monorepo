/**
 * Format Checklists
 *
 * This utility formats skill checklists as markdown.
 */

/**
 * @typedef {Object} ChecklistEntry
 * @property {{id: string, name: string}} skill - Skill info
 * @property {{id: string, name: string, emojiIcon: string}} capability - Capability info
 * @property {string[]} items - Checklist items
 */

/**
 * Format a checklist for display (markdown format)
 * Groups items by skill with capability emoji
 *
 * @param {ChecklistEntry[]} checklist - Checklist entries (readChecklist or confirmChecklist)
 * @returns {string} Markdown-formatted checklist
 */
export function formatChecklistMarkdown(checklist) {
  if (!checklist || checklist.length === 0) {
    return "";
  }

  const sections = checklist.map(({ skill, capability, items }) => {
    const header = `**${capability.emojiIcon} ${skill.name}**`;
    const itemList = items.map((item) => `- [ ] ${item}`).join("\n");
    return `${header}\n\n${itemList}`;
  });

  return sections.join("\n\n");
}
