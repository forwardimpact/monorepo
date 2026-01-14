/**
 * Checklist Derivation
 *
 * Checklists are derived from:
 * Checklist = Handoff × Skills Matrix × Capability Checklists
 *
 * The skill matrix determines which capability levels are relevant,
 * and the capability checklists provide items for each level.
 */

import { SKILL_LEVEL_ORDER, getSkillLevelIndex } from "./levels.js";

/**
 * Get the maximum skill level for a capability from the skill matrix
 * @param {Array} skillMatrix - Derived skill matrix with entries like { skillId, level, capability }
 * @param {string} capabilityId - Capability ID to check
 * @returns {string|null} Maximum skill level or null if no skills in this capability
 */
export function getMaxCapabilityLevel(skillMatrix, capabilityId) {
  const skillsInCapability = skillMatrix.filter(
    (entry) => entry.capability === capabilityId,
  );

  if (skillsInCapability.length === 0) {
    return null;
  }

  // Find the highest level among skills in this capability
  let maxIndex = -1;
  let maxLevel = null;

  for (const entry of skillsInCapability) {
    const index = getSkillLevelIndex(entry.level);
    if (index > maxIndex) {
      maxIndex = index;
      maxLevel = entry.level;
    }
  }

  return maxLevel;
}

/**
 * Get all checklist items up to and including a given level
 * @param {Object} checklists - Capability checklists for a specific handoff
 * @param {string} maxLevel - Maximum level to include
 * @returns {string[]} Array of checklist items
 */
function getChecklistItemsUpToLevel(checklists, maxLevel) {
  if (!checklists || !maxLevel) {
    return [];
  }

  const maxIndex = getSkillLevelIndex(maxLevel);
  const items = [];

  // Include items from all levels up to and including maxLevel
  for (const level of SKILL_LEVEL_ORDER) {
    const levelIndex = getSkillLevelIndex(level);
    if (levelIndex <= maxIndex && checklists[level]) {
      items.push(...checklists[level]);
    }
  }

  return items;
}

/**
 * Derive checklist items for a specific handoff
 *
 * @param {Object} params
 * @param {string} params.handoff - Handoff type (plan_to_code, code_to_review)
 * @param {Array} params.skillMatrix - Derived skill matrix
 * @param {Array} params.capabilities - All capabilities with checklists
 * @returns {Array<{capability: Object, level: string, items: string[]}>} Checklist items grouped by capability
 */
export function deriveChecklist({ handoff, skillMatrix, capabilities }) {
  const result = [];

  for (const capability of capabilities) {
    // Skip if no checklists defined for this capability
    if (
      !capability.transitionChecklists ||
      !capability.transitionChecklists[handoff]
    ) {
      continue;
    }

    // Find the max skill level for this capability
    const maxLevel = getMaxCapabilityLevel(skillMatrix, capability.id);

    // Skip awareness level - not ready for checklists
    if (!maxLevel || maxLevel === "awareness") {
      continue;
    }

    // Get all items up to the max level
    const items = getChecklistItemsUpToLevel(
      capability.transitionChecklists[handoff],
      maxLevel,
    );

    if (items.length > 0) {
      result.push({
        capability: {
          id: capability.id,
          name: capability.name,
          emoji: capability.emoji,
        },
        level: maxLevel,
        items,
      });
    }
  }

  return result;
}

/**
 * Format a checklist for display (markdown format)
 *
 * @param {Array<{capability: Object, level: string, items: string[]}>} checklist - Derived checklist
 * @returns {string} Markdown-formatted checklist
 */
export function formatChecklistMarkdown(checklist) {
  if (!checklist || checklist.length === 0) {
    return "";
  }

  const sections = checklist.map(({ capability, items }) => {
    const header = `**${capability.emoji} ${capability.name}**`;
    const itemList = items.map((item) => `- [ ] ${item}`).join("\n");
    return `${header}\n\n${itemList}`;
  });

  return sections.join("\n\n");
}
