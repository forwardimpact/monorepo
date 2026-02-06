/**
 * Checklist Derivation
 *
 * Checklists are derived from skills with agent.stages.{stage}.ready criteria.
 * Each skill defines its own readiness criteria for stage transitions.
 *
 * Checklist = Stage × Skill Matrix × Skill Ready Criteria
 */

/**
 * Map from stage ID to the stage whose ready criteria should be shown
 * (i.e., what must be ready before leaving this stage)
 */
const STAGE_TO_HANDOFF = {
  plan: "plan", // Show plan.ready before leaving plan
  code: "code", // Show code.ready before leaving code
  review: "review", // Show review.ready (completion criteria)
};

/**
 * Derive checklist items for a specific stage
 * Returns skills grouped by capability with their ready criteria
 *
 * @param {Object} params
 * @param {string} params.stageId - Current stage (plan, code, review)
 * @param {Array} params.skillMatrix - Derived skill matrix with skill details
 * @param {Array} params.skills - All skills (to look up agent.stages)
 * @param {Array} params.capabilities - All capabilities (for emoji lookup)
 * @returns {Array<{skill: Object, capability: Object, items: string[]}>} Checklist items grouped by skill
 */
export function deriveChecklist({
  stageId,
  skillMatrix,
  skills,
  capabilities,
}) {
  const targetStage = STAGE_TO_HANDOFF[stageId];
  if (!targetStage) {
    return [];
  }

  // Build skill lookup
  const skillById = new Map(skills.map((s) => [s.id, s]));

  // Build capability lookup
  const capabilityById = new Map(capabilities.map((c) => [c.id, c]));

  const result = [];

  for (const entry of skillMatrix) {
    const skill = skillById.get(entry.skillId);
    if (!skill || !skill.agent || !skill.agent.stages) {
      continue;
    }

    const stageData = skill.agent.stages[targetStage];
    if (!stageData || !stageData.ready || stageData.ready.length === 0) {
      continue;
    }

    // Get capability for this skill
    const capability = capabilityById.get(entry.capability);
    if (!capability) {
      continue;
    }

    result.push({
      skill: {
        id: skill.id,
        name: skill.name,
      },
      capability: {
        id: capability.id,
        name: capability.name,
        emojiIcon: capability.emojiIcon,
      },
      items: stageData.ready,
    });
  }

  return result;
}

/**
 * Format a checklist for display (markdown format)
 * Groups items by skill with capability emoji
 *
 * @param {Array<{skill: Object, capability: Object, items: string[]}>} checklist - Derived checklist
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
