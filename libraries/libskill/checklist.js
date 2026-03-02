/**
 * Checklist Derivation
 *
 * Checklists are derived from skills with agent.stages.{stage} criteria.
 * Each skill defines its own read-then-do and do-then-confirm items
 * for stage transitions.
 *
 * Checklist = Stage × Skill Matrix × Skill Checklists
 */

/**
 * @typedef {Object} ChecklistEntry
 * @property {{id: string, name: string}} skill - Skill info
 * @property {{id: string, name: string, emojiIcon: string}} capability - Capability info
 * @property {string[]} items - Checklist items
 */

/**
 * Derive checklist items for a specific stage
 * Returns read-then-do and do-then-confirm items grouped by skill/capability
 *
 * @param {Object} params
 * @param {string} params.stageId - Current stage (plan, code, review)
 * @param {Array} params.skillMatrix - Derived skill matrix with skill details
 * @param {Array} params.skills - All skills (to look up agent.stages)
 * @param {Array} params.capabilities - All capabilities (for emoji lookup)
 * @returns {{readChecklist: ChecklistEntry[], confirmChecklist: ChecklistEntry[]}} Checklists by type
 */
export function deriveChecklist({
  stageId,
  skillMatrix,
  skills,
  capabilities,
}) {
  // Build skill lookup
  const skillById = new Map(skills.map((s) => [s.id, s]));

  // Build capability lookup
  const capabilityById = new Map(capabilities.map((c) => [c.id, c]));

  const readChecklist = [];
  const confirmChecklist = [];

  for (const entry of skillMatrix) {
    const skill = skillById.get(entry.skillId);
    if (!skill || !skill.agent || !skill.agent.stages) {
      continue;
    }

    const stageData = skill.agent.stages[stageId];
    if (!stageData) {
      continue;
    }

    // Get capability for this skill
    const capability = capabilityById.get(entry.capability);
    if (!capability) {
      continue;
    }

    const skillInfo = { id: skill.id, name: skill.name };
    const capabilityInfo = {
      id: capability.id,
      name: capability.name,
      emojiIcon: capability.emojiIcon,
    };

    if (stageData.readChecklist && stageData.readChecklist.length > 0) {
      readChecklist.push({
        skill: skillInfo,
        capability: capabilityInfo,
        items: stageData.readChecklist,
      });
    }

    if (stageData.confirmChecklist && stageData.confirmChecklist.length > 0) {
      confirmChecklist.push({
        skill: skillInfo,
        capability: capabilityInfo,
        items: stageData.confirmChecklist,
      });
    }
  }

  return { readChecklist, confirmChecklist };
}

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
